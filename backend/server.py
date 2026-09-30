from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import hmac
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from exports import build_excel, build_pdf, _rp
import seed_data
import storage
import email_service

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="SonicGo API")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
logger = logging.getLogger("sonicgo")
logging.basicConfig(level=logging.INFO)


# ----------------------------- Auth utils -----------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    payload = {"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, uid: str, email: str):
    at = create_access_token(uid, email)
    rt = create_refresh_token(uid)
    response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", rt, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        ah = request.headers.get("Authorization", "")
        if ah.startswith("Bearer "):
            token = ah[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Belum terautentikasi")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir, silakan login kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Hanya Super Admin yang diizinkan")
    return user


# ----------------------------- Models -----------------------------
def new_id():
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "finance_user"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class Branch(BaseModel):
    name: str
    code: str
    address: Optional[str] = ""


class Vendor(BaseModel):
    name: str
    category: str
    phone: Optional[str] = ""


class Product(BaseModel):
    name: str
    unit: str
    unit_price: float = 0
    category: str = "Bahan Ayam"
    min_stock: float = 0
    stock: float = 0


class RecipeItem(BaseModel):
    product_id: str
    qty: float


class Menu(BaseModel):
    name: str
    sell_price: float
    ingredients: List[RecipeItem] = []


class SalesTx(BaseModel):
    date: str
    channel: str
    gross: float
    branch: str
    commission_pct: Optional[float] = None
    payment_method: Optional[str] = "Cash"
    note: Optional[str] = ""


class Expense(BaseModel):
    date: str
    category: str
    description: str
    amount: float
    branch: str
    receipt_path: Optional[str] = None


class Purchase(BaseModel):
    date: str
    vendor_id: str
    description: str
    amount: float
    branch: str
    due_date: Optional[str] = None
    receipt_path: Optional[str] = None


class InventoryLog(BaseModel):
    date: str
    product_id: str
    type: str  # Masuk / Keluar / Transfer / Rusak
    qty: float
    branch: str
    branch_to: Optional[str] = None
    reason: Optional[str] = ""


class Snapshot(BaseModel):
    date: str
    branch: str
    value: float
    kind: str = "akhir"  # awal / akhir


CHANNEL_COMMISSION = {"Reguler": 0, "GrabFood": 20, "GoFood": 20, "ShopeeFood": 20}


def net_sales(gross, channel, commission_pct=None):
    pct = commission_pct if commission_pct is not None else CHANNEL_COMMISSION.get(channel, 0)
    return gross * (1 - pct / 100.0)


# ----------------------------- Auth routes -----------------------------
@api.post("/auth/login")
async def login(body: LoginReq, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
    set_auth_cookies(response, user["id"], email)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        at = create_access_token(user["id"], user["email"])
        response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ----------------------------- User mgmt -----------------------------
@api.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)


@api.post("/users")
async def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {"id": new_id(), "email": email, "password_hash": hash_password(body.password),
           "name": body.name, "role": body.role, "created_at": now_iso()}
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    upd = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.role is not None:
        upd["role"] = body.role
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    if upd:
        await db.users.update_one({"id": uid}, {"$set": upd})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@api.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_admin)):
    if uid == admin["id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ----------------------------- Generic CRUD helpers -----------------------------
def crud(collection, model, name, public_read=True):
    @api.get(f"/{name}")
    async def _list(user: dict = Depends(get_current_user)):
        return await db[collection].find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    @api.post(f"/{name}")
    async def _create(body: model, user: dict = Depends(require_admin)):
        doc = body.model_dump()
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.put(f"/{name}/{{item_id}}")
    async def _update(item_id: str, body: model, user: dict = Depends(require_admin)):
        doc = body.model_dump()
        await db[collection].update_one({"id": item_id}, {"$set": doc})
        return await db[collection].find_one({"id": item_id}, {"_id": 0})

    @api.delete(f"/{name}/{{item_id}}")
    async def _delete(item_id: str, user: dict = Depends(require_admin)):
        await db[collection].delete_one({"id": item_id})
        return {"ok": True}


crud("branches", Branch, "branches")
crud("vendors", Vendor, "vendors")
crud("products", Product, "products")
crud("menus", Menu, "menus")


# ----------------------------- Sales -----------------------------
@api.get("/sales")
async def list_sales(branch: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    if start:
        q.setdefault("date", {})["$gte"] = start
    if end:
        q.setdefault("date", {})["$lte"] = end
    return await db.sales.find(q, {"_id": 0}).sort("date", -1).to_list(3000)


@api.post("/sales")
async def create_sale(body: SalesTx, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["net"] = round(net_sales(body.gross, body.channel, body.commission_pct), 2)
    await db.sales.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/sales/{item_id}")
async def delete_sale(item_id: str, user: dict = Depends(get_current_user)):
    await db.sales.delete_one({"id": item_id})
    return {"ok": True}


# ----------------------------- Expenses -----------------------------
@api.get("/expenses")
async def list_expenses(branch: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                        user: dict = Depends(get_current_user)):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    if start:
        q.setdefault("date", {})["$gte"] = start
    if end:
        q.setdefault("date", {})["$lte"] = end
    return await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(3000)


@api.post("/expenses")
async def create_expense(body: Expense, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/expenses/{item_id}")
async def delete_expense(item_id: str, user: dict = Depends(get_current_user)):
    await db.expenses.delete_one({"id": item_id})
    return {"ok": True}


# ----------------------------- Purchases / Vendor debt -----------------------------
@api.get("/purchases")
async def list_purchases(branch: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    items = await db.purchases.find(q, {"_id": 0}).sort("date", -1).to_list(3000)
    return items


@api.post("/purchases")
async def create_purchase(body: Purchase, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["paid"] = 0.0
    doc["status"] = "unpaid"
    await db.purchases.insert_one(doc)
    doc.pop("_id", None)
    return doc


class PayReq(BaseModel):
    amount: float


@api.post("/purchases/{item_id}/pay")
async def pay_purchase(item_id: str, body: PayReq, user: dict = Depends(get_current_user)):
    p = await db.purchases.find_one({"id": item_id})
    if not p:
        raise HTTPException(status_code=404, detail="Tidak ditemukan")
    paid = min(p["amount"], p.get("paid", 0) + body.amount)
    status = "paid" if paid >= p["amount"] else ("partial" if paid > 0 else "unpaid")
    await db.purchases.update_one({"id": item_id}, {"$set": {"paid": paid, "status": status}})
    return await db.purchases.find_one({"id": item_id}, {"_id": 0})


@api.delete("/purchases/{item_id}")
async def delete_purchase(item_id: str, user: dict = Depends(get_current_user)):
    await db.purchases.delete_one({"id": item_id})
    return {"ok": True}


# ----------------------------- Inventory -----------------------------
@api.get("/inventory")
async def list_inventory(branch: Optional[str] = None, type: Optional[str] = None,
                         user: dict = Depends(get_current_user)):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    if type:
        q["type"] = type
    return await db.inventory.find(q, {"_id": 0}).sort("date", -1).to_list(3000)


@api.post("/inventory")
async def create_inventory(body: InventoryLog, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.inventory.insert_one(doc)
    # adjust product stock
    delta = 0
    if body.type == "Masuk":
        delta = body.qty
    elif body.type in ("Keluar", "Rusak"):
        delta = -body.qty
    if delta:
        await db.products.update_one({"id": body.product_id}, {"$inc": {"stock": delta}})
    doc.pop("_id", None)
    return doc


@api.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str, user: dict = Depends(get_current_user)):
    await db.inventory.delete_one({"id": item_id})
    return {"ok": True}


@api.get("/snapshots")
async def list_snapshots(branch: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    return await db.snapshots.find(q, {"_id": 0}).sort("date", -1).to_list(1000)


@api.post("/snapshots")
async def create_snapshot(body: Snapshot, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.snapshots.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ----------------------------- Aggregation helpers -----------------------------
async def _sum(collection, q, field):
    total = 0.0
    async for d in db[collection].find(q, {field: 1, "_id": 0}):
        total += float(d.get(field, 0) or 0)
    return total


async def _branch_filter(branch, start, end):
    q = {}
    if branch and branch != "all":
        q["branch"] = branch
    if start:
        q.setdefault("date", {})["$gte"] = start
    if end:
        q.setdefault("date", {})["$lte"] = end
    return q


async def compute_foodcost(branch, start, end):
    sq = await _branch_filter(branch, start, end)
    net = await _sum("sales", sq, "net")
    purchases = await _sum("purchases", sq, "amount")
    # raw material petty cash also part of purchases
    raw_exp_q = dict(sq)
    raw_exp_q["category"] = {"$in": seed_data.RAW_CATEGORIES}
    purchases += await _sum("expenses", raw_exp_q, "amount")
    # spoilage value
    spoil = 0.0
    spq = dict(sq)
    spq["type"] = "Rusak"
    prod_prices = {p["id"]: p.get("unit_price", 0) async for p in db.products.find({}, {"id": 1, "unit_price": 1, "_id": 0})}
    async for d in db.inventory.find(spq, {"_id": 0}):
        spoil += float(d.get("qty", 0)) * float(prod_prices.get(d.get("product_id"), 0))
    # beginning / ending inventory snapshots
    bq = {}
    if branch and branch != "all":
        bq["branch"] = branch
    beginning = 0.0
    ending = 0.0
    if start:
        snap = await db.snapshots.find_one({**bq, "date": {"$lte": start}}, {"_id": 0}, sort=[("date", -1)])
        if snap:
            beginning = float(snap.get("value", 0))
    if end:
        snap = await db.snapshots.find_one({**bq, "date": {"$lte": end}}, {"_id": 0}, sort=[("date", -1)])
        if snap:
            ending = float(snap.get("value", 0))
    usage = beginning + purchases - ending - spoil
    pct = (usage / net * 100) if net > 0 else 0
    return {
        "beginning": round(beginning, 2), "purchases": round(purchases, 2),
        "ending": round(ending, 2), "spoilage": round(spoil, 2),
        "usage": round(usage, 2), "net_sales": round(net, 2),
        "food_cost_pct": round(pct, 2),
    }


# ----------------------------- Dashboard -----------------------------
@api.get("/dashboard")
async def dashboard(branch: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                    user: dict = Depends(get_current_user)):
    sq = await _branch_filter(branch, start, end)
    total_gross = await _sum("sales", sq, "gross")
    total_net = await _sum("sales", sq, "net")
    total_exp = await _sum("expenses", sq, "amount")
    # channel breakdown
    channels = {}
    async for d in db.sales.find(sq, {"_id": 0}):
        ch = d.get("channel", "Reguler")
        channels[ch] = channels.get(ch, 0) + float(d.get("gross", 0))
    fc = await compute_foodcost(branch, start, end)
    # unpaid vendor debt
    dq = {}
    if branch and branch != "all":
        dq["branch"] = branch
    debt = 0.0
    async for d in db.purchases.find(dq, {"_id": 0}):
        debt += float(d.get("amount", 0)) - float(d.get("paid", 0))
    # low stock
    low = await db.products.find({"$expr": {"$lte": ["$stock", "$min_stock"]}, "min_stock": {"$gt": 0}},
                                 {"_id": 0}).to_list(200)
    # daily sales trend
    trend = {}
    async for d in db.sales.find(sq, {"_id": 0, "date": 1, "net": 1}):
        trend[d["date"]] = trend.get(d["date"], 0) + float(d.get("net", 0))
    trend_list = [{"date": k, "net": round(v, 2)} for k, v in sorted(trend.items())]
    return {
        "total_gross": round(total_gross, 2),
        "total_net": round(total_net, 2),
        "total_expenses": round(total_exp, 2),
        "cash_flow": round(total_net - total_exp, 2),
        "food_cost_pct": fc["food_cost_pct"],
        "channels": [{"channel": k, "gross": round(v, 2)} for k, v in channels.items()],
        "vendor_debt": round(debt, 2),
        "low_stock": low,
        "trend": trend_list,
    }


@api.get("/foodcost")
async def foodcost(branch: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                   user: dict = Depends(get_current_user)):
    res = await compute_foodcost(branch, start, end)
    # per-menu food cost using recipes
    prod = {p["id"]: p async for p in db.products.find({}, {"_id": 0})}
    menus = []
    async for m in db.menus.find({}, {"_id": 0}):
        hpp = 0.0
        for ing in m.get("ingredients", []):
            p = prod.get(ing["product_id"])
            if p:
                hpp += float(p.get("unit_price", 0)) * float(ing.get("qty", 0))
        sell = float(m.get("sell_price", 0))
        menus.append({
            "name": m["name"], "sell_price": sell, "hpp": round(hpp, 2),
            "fc_pct": round(hpp / sell * 100, 2) if sell > 0 else 0,
        })
    res["menus"] = menus
    return res


# ----------------------------- Reports -----------------------------
async def build_report_data(branch, start, end):
    sales = await list_sales_raw(branch, start, end)
    expenses = await list_exp_raw(branch, start, end)
    fc = await compute_foodcost(branch, start, end)
    total_in = sum(s.get("net", 0) for s in sales)
    total_out = sum(e.get("amount", 0) for e in expenses)
    return sales, expenses, fc, total_in, total_out


async def list_sales_raw(branch, start, end):
    q = await _branch_filter(branch, start, end)
    return await db.sales.find(q, {"_id": 0}).sort("date", 1).to_list(5000)


async def list_exp_raw(branch, start, end):
    q = await _branch_filter(branch, start, end)
    return await db.expenses.find(q, {"_id": 0}).sort("date", 1).to_list(5000)


@api.get("/reports/cashflow")
async def report_cashflow(branch: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                          user: dict = Depends(get_current_user)):
    sales, expenses, fc, tin, tout = await build_report_data(branch, start, end)
    # daily ledger
    days = {}
    for s in sales:
        days.setdefault(s["date"], {"in": 0, "out": 0})["in"] += s.get("net", 0)
    for e in expenses:
        days.setdefault(e["date"], {"in": 0, "out": 0})["out"] += e.get("amount", 0)
    ledger = []
    balance = 0
    for d in sorted(days.keys()):
        balance += days[d]["in"] - days[d]["out"]
        ledger.append({"date": d, "in": round(days[d]["in"], 2), "out": round(days[d]["out"], 2),
                       "balance": round(balance, 2)})
    # expense by category
    cat = {}
    for e in expenses:
        cat[e["category"]] = cat.get(e["category"], 0) + e.get("amount", 0)
    return {
        "total_in": round(tin, 2), "total_out": round(tout, 2), "net": round(tin - tout, 2),
        "ledger": ledger, "food_cost": fc,
        "expense_by_category": [{"category": k, "amount": round(v, 2)} for k, v in sorted(cat.items(), key=lambda x: -x[1])],
    }


def _report_sections(sales, expenses, fc, tin, tout):
    ch = {}
    for s in sales:
        ch.setdefault(s["channel"], {"gross": 0, "net": 0})
        ch[s["channel"]]["gross"] += s.get("gross", 0)
        ch[s["channel"]]["net"] += s.get("net", 0)
    cat = {}
    for e in expenses:
        cat[e["category"]] = cat.get(e["category"], 0) + e.get("amount", 0)
    sections = [
        {"name": "Penjualan per Channel", "headers": ["Channel", "Kotor", "Bersih"],
         "rows": [[k, _rp(v["gross"]), _rp(v["net"])] for k, v in ch.items()]},
        {"name": "Pengeluaran per Kategori", "headers": ["Kategori", "Jumlah"],
         "rows": [[k, _rp(v)] for k, v in sorted(cat.items(), key=lambda x: -x[1])]},
        {"name": "Ringkasan Kas", "headers": ["Keterangan", "Nilai"],
         "rows": [["Total Penjualan Bersih", _rp(tin)], ["Total Pengeluaran", _rp(tout)],
                  ["Arus Kas Bersih", _rp(tin - tout)]]},
        {"name": "Ikhtisar Food Cost", "headers": ["Komponen", "Nilai"],
         "rows": [["Persediaan Awal", _rp(fc["beginning"])], ["Pembelian", _rp(fc["purchases"])],
                  ["Persediaan Akhir", _rp(fc["ending"])], ["Barang Rusak", _rp(fc["spoilage"])],
                  ["Bahan Terpakai", _rp(fc["usage"])], ["Penjualan Bersih", _rp(fc["net_sales"])],
                  ["Food Cost %", f"{fc['food_cost_pct']}%"]]},
    ]
    return sections


@api.get("/reports/export")
async def export_report(fmt: str = "excel", branch: Optional[str] = None, start: Optional[str] = None,
                        end: Optional[str] = None, user: dict = Depends(get_current_user)):
    sales, expenses, fc, tin, tout = await build_report_data(branch, start, end)
    sections = _report_sections(sales, expenses, fc, tin, tout)
    meta = {"Cabang": branch or "Semua", "Periode": f"{start or '-'} s/d {end or '-'}",
            "Dicetak": datetime.now().strftime("%d/%m/%Y %H:%M")}
    title = "Laporan Kas & Food Cost - SonicGo"
    if fmt == "pdf":
        buf = build_pdf(title, meta, sections)
        return StreamingResponse(buf, media_type="application/pdf",
                                 headers={"Content-Disposition": "attachment; filename=laporan_sonicgo.pdf"})
    buf = build_excel(title, meta, sections)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=laporan_sonicgo.xlsx"})


@api.post("/seed")
async def seed_endpoint(admin: dict = Depends(require_admin)):
    await seed_data.seed(db, force=True)
    return {"ok": True}


# ----------------------------- Receipt uploads -----------------------------
@api.post("/uploads/receipt")
async def upload_receipt(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in storage.MIME_TYPES:
        raise HTTPException(status_code=400, detail="Format tidak didukung (jpg, png, webp, pdf)")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran file maks 8MB")
    ct = storage.MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    path = f"{storage.APP_NAME}/receipts/{user['id']}/{new_id()}.{ext}"
    try:
        result = await asyncio.to_thread(storage.put_object, path, data, ct)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=502, detail="Gagal mengunggah file")
    await db.files.insert_one({
        "id": new_id(), "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ct, "size": result.get("size"), "is_deleted": False, "created_at": now_iso(),
    })
    return {"path": result["path"], "content_type": ct}


@api.get("/files/{path:path}")
async def serve_file(path: str, request: Request):
    await get_current_user(request)
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    try:
        data, ct = await asyncio.to_thread(storage.get_object, path)
    except Exception as e:
        logger.error(f"Serve failed: {e}")
        raise HTTPException(status_code=502, detail="Gagal memuat file")
    return Response(content=data, media_type=rec.get("content_type", ct))


# ----------------------------- Daily summary email -----------------------------
async def _daily_summary_payload(day: str):
    q = {"date": day}
    total_gross = await _sum("sales", q, "gross")
    total_net = await _sum("sales", q, "net")
    total_exp = await _sum("expenses", q, "amount")
    fc = await compute_foodcost("all", day, day)
    debt = 0.0
    async for d in db.purchases.find({}, {"_id": 0}):
        debt += float(d.get("amount", 0)) - float(d.get("paid", 0))
    low = await db.products.find({"$expr": {"$lte": ["$stock", "$min_stock"]}, "min_stock": {"$gt": 0}},
                                 {"_id": 0}).to_list(50)
    return {
        "total_gross": round(total_gross, 2), "total_net": round(total_net, 2),
        "total_expenses": round(total_exp, 2), "cash_flow": round(total_net - total_exp, 2),
        "food_cost_pct": fc["food_cost_pct"], "vendor_debt": round(debt, 2), "low_stock": low,
    }


async def _run_daily_summary():
    day = datetime.now(timezone.utc).date().isoformat()
    owner = os.environ.get("OWNER_EMAIL")
    if not owner:
        return
    data = await _daily_summary_payload(day)
    html = email_service.build_daily_summary_html(day, data)
    await email_service.send_email(to=owner, subject=f"Ringkasan Harian Sonic Finance — {day}", html=html)


@api.post("/cron/daily-summary")
async def cron_daily_summary(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not token or not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_daily_summary())
    return {"ok": True, "queued": True}


@api.post("/reports/email-summary")
async def email_summary_now(admin: dict = Depends(require_admin)):
    await _run_daily_summary()
    return {"ok": True, "sent_to": os.environ.get("OWNER_EMAIL")}


@api.get("/")
async def root():
    return {"message": "SonicGo API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id")
    # seed admin
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Putri Aqillah", "role": "super_admin", "created_at": now_iso(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password), "role": "super_admin"}})
    await seed_data.seed(db)
    try:
        await asyncio.to_thread(storage.init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    logger.info("Sonic Finance startup complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()
