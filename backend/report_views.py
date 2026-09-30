"""Computed report views for Sonic Finance. Each report returns a uniform
structure: {key, title, meta, columns, rows, summary} so the frontend can
render any report generically and Excel export can reuse the same data."""
from datetime import datetime

DAYS_ID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]

# Catalog mirrors the sheets in the owner's Excel template.
CATALOG = [
    {"key": "pembelian_kredit", "title": "Laporan Pembelian Kredit", "sheet": "PEMBELIAN KREDIT"},
    {"key": "to_ti", "title": "TO / TI Perkedel & Transfer", "sheet": "TO-TI"},
    {"key": "lpkk", "title": "Laporan Pengeluaran Kas Kecil (LPKK)", "sheet": "LPKK"},
    {"key": "vendor", "title": "Vendor Report", "sheet": "VENDOR"},
    {"key": "weekly", "title": "Weekly / Monthly Inventori", "sheet": "WEEKLY"},
    {"key": "cash_flow", "title": "Laporan Cash Flow", "sheet": "LAP. CF"},
    {"key": "ikhtisar_food_cost", "title": "Laporan Ikhtisar Food Cost", "sheet": "IKHTISAR FOOD COST"},
    {"key": "kas_periode", "title": "Laporan Kas & Penjualan Per Periode", "sheet": "LAPORAN KAS PERIODE"},
    {"key": "penjualan_reguler", "title": "Laporan Penjualan Reguler", "sheet": "LAP. PENJUALAN REGULER"},
    {"key": "penjualan_grabfood", "title": "Laporan Penjualan GrabFood", "sheet": "LAP. PENJUALAN GRABFOOD"},
    {"key": "penjualan_gofood", "title": "Laporan Penjualan GoFood", "sheet": "LAP. PENJUALAN GOFOOD"},
    {"key": "penjualan_shopeefood", "title": "Laporan Penjualan ShopeeFood", "sheet": "LAP. PENJUALAN SHOPEFOOD"},
    {"key": "cost_analysis", "title": "Cost Analysis", "sheet": "COST ANALYSIS"},
    {"key": "food_cost_item", "title": "Food Cost Item", "sheet": "FOOD COST PRODUCT"},
    {"key": "left_over", "title": "Left Over & Spoilage Product", "sheet": "LEFT OVER"},
    {"key": "hpp_product", "title": "HPP Product (Food Cost Item)", "sheet": "HPP PRODUCT"},
]

CHANNEL_MAP = {
    "penjualan_reguler": "Reguler", "penjualan_grabfood": "GrabFood",
    "penjualan_gofood": "GoFood", "penjualan_shopeefood": "ShopeeFood",
}

RAW_CATEGORIES = ["Bahan Ayam", "Bahan Pelengkap", "Bahan Roti", "Bahan Minyak",
                  "Bahan Bumbu/Groceries", "Bahan Perkedel", "Bahan Nasgor"]


def _day_label(d):
    try:
        return DAYS_ID[datetime.strptime(d, "%Y-%m-%d").weekday()]
    except Exception:
        return ""


def _q(branch, start, end):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    if start:
        q.setdefault("date", {})["$gte"] = start
    if end:
        q.setdefault("date", {})["$lte"] = end
    return q


async def _list(db, coll, q, sort="date"):
    return await db[coll].find(q, {"_id": 0}).sort(sort, 1).to_list(5000)


async def get_report(db, key, branch, start, end):
    meta = {"Cabang": branch if branch and branch != "all" else "Semua Cabang",
            "Periode": f"{start or '-'} s/d {end or '-'}"}
    title = next((c["title"] for c in CATALOG if c["key"] == key), key)
    base = {"key": key, "title": title, "meta": meta, "columns": [], "rows": [], "summary": []}

    if key == "pembelian_kredit":
        vendors = {v["id"]: v["name"] for v in await db.vendors.find({}, {"_id": 0}).to_list(500)}
        q = {}
        if branch and branch != "all":
            q["branch"] = branch
        rows = []
        total = paid = 0
        for p in await db.purchases.find(q, {"_id": 0}).sort("date", 1).to_list(5000):
            total += p.get("amount", 0); paid += p.get("paid", 0)
            rows.append([p["date"], vendors.get(p.get("vendor_id"), "-"), p.get("description", ""),
                         p.get("amount", 0), p.get("paid", 0), p.get("amount", 0) - p.get("paid", 0),
                         p.get("status", "")])
        base["columns"] = [C("Tanggal"), C("Nama Suplier"), C("Nama Bahan"), M("Total"),
                           M("Terbayar"), M("Sisa"), C("Status")]
        base["rows"] = rows
        base["summary"] = [["Total Pembelian Kredit", total], ["Terbayar", paid], ["Sisa Hutang", total - paid]]

    elif key == "to_ti":
        prods = {p["id"]: p["name"] for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
        q = _q(branch, start, end); q["type"] = "Transfer"
        rows = [[l["date"], prods.get(l.get("product_id"), "-"), l.get("qty", 0),
                 l.get("branch", ""), l.get("branch_to", ""), l.get("reason", "")]
                for l in await _list(db, "inventory", q)]
        base["columns"] = [C("Tanggal"), C("Nama Bahan/Product"), N("QTY"), C("Dari"), C("Ke"), C("Catatan")]
        base["rows"] = rows

    elif key == "lpkk":
        exps = await _list(db, "expenses", _q(branch, start, end))
        total = 0; rows = []
        for e in exps:
            total += e.get("amount", 0)
            rows.append([e["date"], e.get("category", ""), e.get("description", ""), e.get("amount", 0)])
        cat = {}
        for e in exps:
            cat[e["category"]] = cat.get(e["category"], 0) + e.get("amount", 0)
        base["columns"] = [C("TGL"), C("Kategori Bahan"), C("Keterangan"), M("Jumlah")]
        base["rows"] = rows
        base["summary"] = [[k, v] for k, v in sorted(cat.items(), key=lambda x: -x[1])] + [["TOTAL LPKK", total]]

    elif key == "vendor":
        vendors = await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(500)
        q = {}
        if branch and branch != "all":
            q["branch"] = branch
        agg = {}
        for p in await db.purchases.find(q, {"_id": 0}).to_list(5000):
            a = agg.setdefault(p.get("vendor_id"), {"total": 0, "paid": 0})
            a["total"] += p.get("amount", 0); a["paid"] += p.get("paid", 0)
        rows = []
        for v in vendors:
            a = agg.get(v["id"], {"total": 0, "paid": 0})
            rows.append([v["name"], v.get("category", ""), v.get("phone", ""),
                         a["total"], a["paid"], a["total"] - a["paid"]])
        base["columns"] = [C("Nama Vendor"), C("Kategori"), C("Telepon"), M("Total Pembelian"),
                           M("Terbayar"), M("Sisa Hutang")]
        base["rows"] = rows

    elif key in ("weekly", "cost_analysis"):
        prods = await db.products.find({}, {"_id": 0}).sort("category", 1).to_list(2000)
        rows = []; grand = 0
        for p in prods:
            val = p.get("stock", 0) * p.get("unit_price", 0)
            grand += val
            if key == "weekly":
                rows.append([p.get("category", ""), p["name"], p.get("unit", ""), p.get("stock", 0),
                             p.get("unit_price", 0), val])
            else:
                low = p.get("min_stock", 0) > 0 and p.get("stock", 0) <= p.get("min_stock", 0)
                rows.append([p["name"], p.get("category", ""), p.get("stock", 0), p.get("min_stock", 0),
                             p.get("unit_price", 0), val, "STOK MENIPIS" if low else ""])
        if key == "weekly":
            base["columns"] = [C("Kategori"), C("Bahan"), C("Unit"), N("QTY"), M("Price"), M("Total (Rp)")]
        else:
            base["columns"] = [C("Item"), C("Kategori"), N("Stok Akhir"), N("Min"), M("Harga"),
                               M("Nilai Persediaan"), C("Ket")]
        base["rows"] = rows
        base["summary"] = [["TOTAL NILAI PERSEDIAAN", grand]]

    elif key == "cash_flow":
        sales = await _list(db, "sales", _q(branch, start, end))
        exps = await _list(db, "expenses", _q(branch, start, end))
        days = {}
        for s in sales:
            days.setdefault(s["date"], {"in": 0, "out": 0})["in"] += s.get("net", 0)
        for e in exps:
            days.setdefault(e["date"], {"in": 0, "out": 0})["out"] += e.get("amount", 0)
        bal = 0; rows = []; tin = tout = 0
        for d in sorted(days):
            bal += days[d]["in"] - days[d]["out"]
            tin += days[d]["in"]; tout += days[d]["out"]
            rows.append([d, _day_label(d), days[d]["in"], days[d]["out"], bal])
        base["columns"] = [C("Tanggal"), C("Hari"), M("Penerimaan (Sales)"), M("Pengeluaran"), M("Saldo")]
        base["rows"] = rows
        base["summary"] = [["Total Penerimaan", tin], ["Total Pengeluaran", tout], ["Saldo Akhir", tin - tout]]

    elif key == "ikhtisar_food_cost":
        fc = await _foodcost(db, branch, start, end)
        base["columns"] = [C("Komponen"), M("Nilai")]
        base["rows"] = [
            ["Persediaan Awal", fc["beginning"]], ["Total Pembelian", fc["purchases"]],
            ["Persediaan Akhir", fc["ending"]], ["Barang Rusak (Spoilage)", fc["spoilage"]],
            ["Jumlah Yang Dipakai", fc["usage"]], ["Penjualan Bersih", fc["net_sales"]],
        ]
        base["summary"] = [["FOOD COST (%)", f"{fc['food_cost_pct']}%"]]

    elif key == "kas_periode":
        sales = await _list(db, "sales", _q(branch, start, end))
        days = sorted({s["date"] for s in sales})
        by = {d: {"gross": 0, "net": 0, "komisi": 0} for d in days}
        for s in sales:
            by[s["date"]]["gross"] += s.get("gross", 0)
            by[s["date"]]["net"] += s.get("net", 0)
            by[s["date"]]["komisi"] += s.get("gross", 0) - s.get("net", 0)
        cols = [C("Keterangan")] + [C(f"{d} ({_day_label(d)})") for d in days] + [M("TOTAL")]
        def line(label, field):
            vals = [by[d][field] for d in days]
            return [label] + vals + [sum(vals)]
        base["columns"] = cols
        base["rows"] = [line("Penjualan Kotor", "gross"), line("Komisi Online", "komisi"),
                        line("Penjualan Bersih", "net")]
        for r in base["rows"]:
            for i in range(1, len(r)):
                pass
        base["money_from_col"] = 1

    elif key in CHANNEL_MAP:
        ch = CHANNEL_MAP[key]
        q = _q(branch, start, end); q["channel"] = ch
        sales = await _list(db, "sales", q)
        days = {}
        for s in sales:
            a = days.setdefault(s["date"], {"gross": 0, "net": 0})
            a["gross"] += s.get("gross", 0); a["net"] += s.get("net", 0)
        rows = []; tg = tn = 0
        for d in sorted(days):
            komisi = days[d]["gross"] - days[d]["net"]
            tg += days[d]["gross"]; tn += days[d]["net"]
            rows.append([d, _day_label(d), days[d]["gross"], komisi, days[d]["net"]])
        base["columns"] = [C("Tanggal"), C("Hari"), M("Penjualan Kotor"), M("Komisi"), M("Penjualan Bersih")]
        base["rows"] = rows
        base["summary"] = [["Total Kotor", tg], ["Total Komisi", tg - tn], ["Total Bersih", tn]]

    elif key == "food_cost_item":
        prods = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
        rows = []
        for m in await db.menus.find({}, {"_id": 0}).to_list(500):
            hpp = sum(prods.get(i["product_id"], {}).get("unit_price", 0) * i.get("qty", 0)
                      for i in m.get("ingredients", []))
            sell = m.get("sell_price", 0)
            rows.append([m["name"], sell, round(hpp, 2), f"{round(hpp / sell * 100, 1) if sell else 0}%"])
        base["columns"] = [C("Item"), M("Harga Jual"), M("HPP"), C("Food Cost %")]
        base["rows"] = rows

    elif key == "hpp_product":
        prods = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
        rows = []
        for m in await db.menus.find({}, {"_id": 0}).to_list(500):
            ings = m.get("ingredients", [])
            if not ings:
                rows.append([m["name"], "-", 0, 0, 0]); continue
            for i in ings:
                p = prods.get(i["product_id"], {})
                sub = p.get("unit_price", 0) * i.get("qty", 0)
                rows.append([m["name"], p.get("name", "-"), i.get("qty", 0), p.get("unit_price", 0), round(sub, 2)])
        base["columns"] = [C("Menu"), C("Bahan"), N("Qty"), M("Harga Satuan"), M("Subtotal HPP")]
        base["rows"] = rows

    elif key == "left_over":
        prods = {p["id"]: p["name"] for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
        q = _q(branch, start, end); q["type"] = "Rusak"
        rows = [[l["date"], _day_label(l["date"]), prods.get(l.get("product_id"), "-"),
                 l.get("qty", 0), l.get("reason", "")] for l in await _list(db, "inventory", q)]
        base["columns"] = [C("Tanggal"), C("Hari"), C("Item"), N("Qty"), C("Keterangan")]
        base["rows"] = rows
        base["summary"] = [["Total Item Rusak", sum(r[3] for r in rows)]]

    return base


def C(label):
    return {"label": label, "money": False}


def M(label):
    return {"label": label, "money": True}


def N(label):
    return {"label": label, "money": False, "num": True}


async def _foodcost(db, branch, start, end):
    sq = _q(branch, start, end)
    async def _sum(coll, q, field):
        t = 0.0
        async for d in db[coll].find(q, {field: 1, "_id": 0}):
            t += float(d.get(field, 0) or 0)
        return t
    net = await _sum("sales", sq, "net")
    purchases = await _sum("purchases", sq, "amount")
    raw_q = dict(sq); raw_q["category"] = {"$in": RAW_CATEGORIES}
    purchases += await _sum("expenses", raw_q, "amount")
    prices = {p["id"]: p.get("unit_price", 0) async for p in db.products.find({}, {"id": 1, "unit_price": 1, "_id": 0})}
    spoil = 0.0
    spq = dict(sq); spq["type"] = "Rusak"
    async for d in db.inventory.find(spq, {"_id": 0}):
        spoil += float(d.get("qty", 0)) * float(prices.get(d.get("product_id"), 0))
    bq = {}
    if branch and branch != "all":
        bq["branch"] = branch
    beginning = ending = 0.0
    if start:
        s = await db.snapshots.find_one({**bq, "date": {"$lte": start}}, {"_id": 0}, sort=[("date", -1)])
        beginning = float(s.get("value", 0)) if s else 0.0
    if end:
        s = await db.snapshots.find_one({**bq, "date": {"$lte": end}}, {"_id": 0}, sort=[("date", -1)])
        ending = float(s.get("value", 0)) if s else 0.0
    usage = beginning + purchases - ending - spoil
    return {"beginning": round(beginning, 2), "purchases": round(purchases, 2), "ending": round(ending, 2),
            "spoilage": round(spoil, 2), "usage": round(usage, 2), "net_sales": round(net, 2),
            "food_cost_pct": round(usage / net * 100, 2) if net > 0 else 0}
