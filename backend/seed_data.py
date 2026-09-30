"""Seed sample data for SonicGo derived from the SC Marabahan July 2026 report."""
import uuid
from datetime import datetime, timezone, timedelta

RAW_CATEGORIES = ["Bahan Ayam", "Bahan Pelengkap", "Bahan Roti", "Bahan Minyak",
                  "Bahan Bumbu/Groceries", "Bahan Perkedel", "Bahan Nasgor"]

CHANNEL_COMMISSION = {"Reguler": 0, "GrabFood": 20, "GoFood": 20, "ShopeeFood": 20}


def _id():
    return str(uuid.uuid4())


def _iso():
    return datetime.now(timezone.utc).isoformat()


async def seed(db, force=False):
    if not force and await db.branches.count_documents({}) > 0:
        return

    if force:
        for c in ["branches", "vendors", "products", "menus", "sales", "expenses",
                  "purchases", "inventory", "snapshots"]:
            await db[c].delete_many({})

    # Branches
    branches = [
        {"id": _id(), "name": "SC Marabahan", "code": "SCM", "address": "Jl. Ahmad Yani, Marabahan", "created_at": _iso()},
        {"id": _id(), "name": "SC Banjarmasin", "code": "SCB", "address": "Jl. A. Yani Km 5, Banjarmasin", "created_at": _iso()},
        {"id": _id(), "name": "SC Martapura", "code": "SCP", "address": "Jl. A. Yani, Martapura", "created_at": _iso()},
    ]
    await db.branches.insert_many([dict(b) for b in branches])
    main_branch = "SC Marabahan"

    # Vendors
    vendors = [
        {"name": "PT Amanah Bagus Indonesia", "category": "Ayam Broiler", "phone": "0511-333001"},
        {"name": "CV Bumbu Rempah Nusantara", "category": "Bumbu & Groceries", "phone": "0511-333002"},
        {"name": "Toko Minyak Resto Jaya", "category": "Minyak Goreng", "phone": "0511-333003"},
        {"name": "UD Kemasan Prima", "category": "Pembungkus", "phone": "0511-333004"},
        {"name": "Berkah Market", "category": "Sayuran & Roti", "phone": "0511-333005"},
    ]
    vdocs = [{"id": _id(), "created_at": _iso(), **v} for v in vendors]
    await db.vendors.insert_many([dict(v) for v in vdocs])

    # Products / ingredients
    products = [
        ("Dada Ayam", "pcs", 8138, "Bahan Ayam", 40, 35),
        ("Paha Atas", "pcs", 6800, "Bahan Ayam", 40, 52),
        ("Paha Bawah", "pcs", 5900, "Bahan Ayam", 40, 48),
        ("Sayap Ayam", "pcs", 4200, "Bahan Ayam", 40, 30),
        ("Beras", "kg", 13000, "Bahan Nasgor", 20, 45),
        ("Tepung Cakra", "kg", 12500, "Bahan Pelengkap", 15, 22),
        ("Minyak Fryer", "liter", 16000, "Bahan Minyak", 30, 25),
        ("Roti Burger", "pcs", 2500, "Bahan Roti", 50, 60),
        ("Kentang French Fries", "kg", 22000, "Bahan Pelengkap", 10, 8),
        ("Telur", "kg", 28000, "Bahan Perkedel", 10, 12),
        ("Bumbu Marinade", "kg", 35000, "Bahan Bumbu/Groceries", 5, 6),
        ("Es Teh (Bahan)", "liter", 3000, "Bahan Minuman", 20, 40),
        ("Cup 22oz", "pcs", 500, "Bahan Pembungkus", 200, 350),
        ("Kardus Box", "pcs", 1200, "Bahan Pembungkus", 100, 180),
        ("Gas Elpiji", "tabung", 22000, "Operasional", 3, 5),
    ]
    pdocs = []
    for name, unit, price, cat, mins, stock in products:
        pdocs.append({"id": _id(), "name": name, "unit": unit, "unit_price": price,
                      "category": cat, "min_stock": mins, "stock": stock, "created_at": _iso()})
    await db.products.insert_many([dict(p) for p in pdocs])
    pmap = {p["name"]: p["id"] for p in pdocs}

    # Menus with recipes
    menus = [
        ("Ayam Goreng Crispy (Dada)", 15000, [("Dada Ayam", 1), ("Tepung Cakra", 0.08), ("Minyak Fryer", 0.05)]),
        ("Ayam Geprek Paket", 18000, [("Paha Atas", 1), ("Beras", 0.2), ("Tepung Cakra", 0.08)]),
        ("Chicken Wings (6pcs)", 20000, [("Sayap Ayam", 6), ("Tepung Cakra", 0.1)]),
        ("Chicken Burger", 22000, [("Dada Ayam", 1), ("Roti Burger", 1), ("Kentang French Fries", 0.1)]),
        ("Es Teh Manis", 5000, [("Es Teh (Bahan)", 0.3), ("Cup 22oz", 1)]),
    ]
    mdocs = []
    for name, price, ings in menus:
        mdocs.append({"id": _id(), "name": name, "sell_price": price,
                      "ingredients": [{"product_id": pmap[n], "qty": q} for n, q in ings],
                      "created_at": _iso()})
    await db.menus.insert_many([dict(m) for m in mdocs])

    # Sales over last 7 days across channels
    today = datetime.now(timezone.utc).date()
    channels = [("Reguler", 4200000), ("GrabFood", 1800000), ("GoFood", 1500000), ("ShopeeFood", 1200000)]
    sdocs = []
    for i in range(7):
        d = (today - timedelta(days=i)).isoformat()
        for ch, base in channels:
            gross = base + (i * 50000) - (200000 if ch == "ShopeeFood" else 0)
            pct = CHANNEL_COMMISSION[ch]
            sdocs.append({"id": _id(), "date": d, "channel": ch, "gross": float(gross),
                          "net": round(gross * (1 - pct / 100.0), 2), "branch": main_branch,
                          "commission_pct": pct, "payment_method": "QRIS" if ch == "Reguler" else "Transfer",
                          "note": "", "created_at": _iso()})
    await db.sales.insert_many([dict(s) for s in sdocs])

    # Expenses (petty cash - LPKK)
    exp_items = [
        ("Bahan Ayam", "Pembelian ayam broiler", 3500000),
        ("Bahan Bumbu/Groceries", "Sayuran & bumbu dapur", 450000),
        ("Bahan Minyak", "Minyak goreng fryer", 800000),
        ("Operasional", "Gas Elpiji", 110000),
        ("Operasional", "Token Listrik", 300000),
        ("Bahan Pembungkus", "Cup, kardus, sedotan", 250000),
        ("Transport", "Ongkir & transport", 150000),
        ("Lain-lain", "ATK & fotocopy laporan", 75000),
    ]
    edocs = []
    for i, (cat, desc, amt) in enumerate(exp_items):
        d = (today - timedelta(days=i % 7)).isoformat()
        edocs.append({"id": _id(), "date": d, "category": cat, "description": desc,
                      "amount": float(amt), "branch": main_branch, "created_at": _iso()})
    await db.expenses.insert_many([dict(e) for e in edocs])

    # Credit purchases (vendor debt)
    purchases = [
        (vdocs[0]["id"], "Kredit ayam broiler 100kg", 7500000, 0.0, "unpaid"),
        (vdocs[1]["id"], "Bumbu & groceries bulanan", 1200000, 600000, "partial"),
        (vdocs[2]["id"], "Minyak goreng 50 liter", 800000, 800000, "paid"),
        (vdocs[3]["id"], "Kemasan & pembungkus", 950000, 0.0, "unpaid"),
    ]
    pudocs = []
    for i, (vid, desc, amt, paid, status) in enumerate(purchases):
        d = (today - timedelta(days=i + 1)).isoformat()
        due = (today + timedelta(days=14 - i)).isoformat()
        pudocs.append({"id": _id(), "date": d, "vendor_id": vid, "description": desc,
                       "amount": float(amt), "paid": float(paid), "status": status,
                       "branch": main_branch, "due_date": due, "created_at": _iso()})
    await db.purchases.insert_many([dict(p) for p in pudocs])

    # Inventory logs (spoilage + transfer)
    invdocs = [
        {"id": _id(), "date": today.isoformat(), "product_id": pmap["Dada Ayam"], "type": "Rusak",
         "qty": 3, "branch": main_branch, "reason": "Gosong saat penggorengan", "created_at": _iso()},
        {"id": _id(), "date": today.isoformat(), "product_id": pmap["Roti Burger"], "type": "Rusak",
         "qty": 5, "branch": main_branch, "reason": "Kadaluarsa", "created_at": _iso()},
        {"id": _id(), "date": today.isoformat(), "product_id": pmap["Paha Atas"], "type": "Transfer",
         "qty": 20, "branch": main_branch, "branch_to": "SC Banjarmasin", "reason": "TO-TI antar cabang", "created_at": _iso()},
        {"id": _id(), "date": today.isoformat(), "product_id": pmap["Beras"], "type": "Masuk",
         "qty": 25, "branch": main_branch, "reason": "Pembelian", "created_at": _iso()},
    ]
    await db.inventory.insert_many([dict(x) for x in invdocs])

    # Snapshots for food cost
    snaps = [
        {"id": _id(), "date": (today - timedelta(days=7)).isoformat(), "branch": main_branch,
         "value": 8500000, "kind": "awal", "created_at": _iso()},
        {"id": _id(), "date": today.isoformat(), "branch": main_branch,
         "value": 7200000, "kind": "akhir", "created_at": _iso()},
    ]
    await db.snapshots.insert_many([dict(s) for s in snaps])
