"""SonicGo backend integration tests via external ingress URL."""
import os
import io
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "putriaqillah310803@gmail.com"
ADMIN_PASSWORD = "SonicGo2026!"

FIN_EMAIL = "test_finance_user@sonicgo.example.com"
FIN_PASSWORD = "FinancePass2026!"


# ------------ Fixtures ------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("role") == "super_admin"
    assert data.get("email") == ADMIN_EMAIL
    # Cookies present
    assert "access_token" in s.cookies, "access_token cookie not set"
    return s


@pytest.fixture(scope="session")
def finance_session(admin_session):
    """Create (idempotent) a finance user and return its logged-in session."""
    # Clean up existing test finance user
    users = admin_session.get(f"{API}/users", timeout=30).json()
    for u in users:
        if u["email"] == FIN_EMAIL:
            admin_session.delete(f"{API}/users/{u['id']}", timeout=30)
    r = admin_session.post(f"{API}/users", json={
        "email": FIN_EMAIL, "password": FIN_PASSWORD, "name": "Test Finance User",
        "role": "finance_user"
    }, timeout=30)
    assert r.status_code == 200, f"create finance user failed: {r.text}"

    fs = requests.Session()
    r = fs.post(f"{API}/auth/login", json={"email": FIN_EMAIL, "password": FIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return fs


# ------------ Auth ------------
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_refresh(self, admin_session):
        r = admin_session.post(f"{API}/auth/refresh", timeout=30)
        assert r.status_code == 200


# ------------ Dashboard & Seed data ------------
class TestDashboard:
    def test_dashboard_all(self, admin_session):
        r = admin_session.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for key in ("total_gross", "total_net", "total_expenses", "cash_flow",
                    "food_cost_pct", "channels", "low_stock", "trend", "vendor_debt"):
            assert key in d, f"missing {key} in dashboard"
        assert d["total_net"] > 0, "seed data should produce non-zero net sales"

    def test_dashboard_branch_filter(self, admin_session):
        r = admin_session.get(f"{API}/dashboard?branch=SC Marabahan", timeout=30)
        assert r.status_code == 200


# ------------ Sales ------------
class TestSales:
    def test_create_reguler_sale(self, admin_session):
        payload = {"date": "2026-01-15", "channel": "Reguler", "gross": 100000,
                   "branch": "SC Marabahan", "payment_method": "Cash"}
        r = admin_session.post(f"{API}/sales", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["net"] == 100000  # 0% commission
        # verify GET
        rid = d["id"]
        lst = admin_session.get(f"{API}/sales?branch=SC Marabahan", timeout=30).json()
        assert any(x["id"] == rid for x in lst)
        # delete
        assert admin_session.delete(f"{API}/sales/{rid}", timeout=30).status_code == 200

    def test_create_grabfood_sale_commission(self, admin_session):
        payload = {"date": "2026-01-15", "channel": "GrabFood", "gross": 100000,
                   "branch": "SC Marabahan"}
        r = admin_session.post(f"{API}/sales", json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["net"] == 80000  # 20% commission
        admin_session.delete(f"{API}/sales/{r.json()['id']}", timeout=30)


# ------------ Expenses & Purchases ------------
class TestExpensesPurchases:
    def test_create_expense(self, admin_session):
        r = admin_session.post(f"{API}/expenses", json={
            "date": "2026-01-15", "category": "Operasional", "description": "TEST expense",
            "amount": 50000, "branch": "SC Marabahan"
        }, timeout=30)
        assert r.status_code == 200
        eid = r.json()["id"]
        admin_session.delete(f"{API}/expenses/{eid}", timeout=30)

    def test_create_purchase_and_pay(self, admin_session):
        # need a vendor
        vendors = admin_session.get(f"{API}/vendors", timeout=30).json()
        assert vendors, "seed data should include vendors"
        vid = vendors[0]["id"]
        r = admin_session.post(f"{API}/purchases", json={
            "date": "2026-01-15", "vendor_id": vid, "description": "TEST purchase",
            "amount": 200000, "branch": "SC Marabahan"
        }, timeout=30)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["status"] == "unpaid"

        # partial pay
        r = admin_session.post(f"{API}/purchases/{pid}/pay", json={"amount": 100000}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "partial"
        assert r.json()["paid"] == 100000

        # full pay
        r = admin_session.post(f"{API}/purchases/{pid}/pay", json={"amount": 100000}, timeout=30)
        assert r.json()["status"] == "paid"

        admin_session.delete(f"{API}/purchases/{pid}", timeout=30)


# ------------ Inventory ------------
class TestInventory:
    def test_inventory_and_spoilage_adjusts_stock(self, admin_session):
        products = admin_session.get(f"{API}/products", timeout=30).json()
        assert products, "seed products required"
        p = products[0]
        pid = p["id"]
        start_stock = float(p.get("stock", 0))

        # Stock In (Masuk)
        r = admin_session.post(f"{API}/inventory", json={
            "date": "2026-01-15", "product_id": pid, "type": "Masuk", "qty": 10,
            "branch": "SC Marabahan"
        }, timeout=30)
        assert r.status_code == 200
        inv1 = r.json()["id"]

        # Spoilage (Rusak) - reduces stock
        r = admin_session.post(f"{API}/inventory", json={
            "date": "2026-01-15", "product_id": pid, "type": "Rusak", "qty": 3,
            "branch": "SC Marabahan", "reason": "Test spoil"
        }, timeout=30)
        assert r.status_code == 200
        inv2 = r.json()["id"]

        # Verify stock updated
        prods2 = admin_session.get(f"{API}/products", timeout=30).json()
        new_stock = next(x["stock"] for x in prods2 if x["id"] == pid)
        assert abs(new_stock - (start_stock + 10 - 3)) < 0.001

        # Transfer (Keluar branch_to) is treated as Keluar? Actually type=Transfer not defined.
        # Use type="Transfer" with branch_to
        r = admin_session.post(f"{API}/inventory", json={
            "date": "2026-01-15", "product_id": pid, "type": "Transfer", "qty": 1,
            "branch": "SC Marabahan", "branch_to": "SC Banjarmasin"
        }, timeout=30)
        assert r.status_code == 200
        inv3 = r.json()["id"]

        # cleanup
        for i in (inv1, inv2, inv3):
            admin_session.delete(f"{API}/inventory/{i}", timeout=30)

    def test_snapshot(self, admin_session):
        r = admin_session.post(f"{API}/snapshots", json={
            "date": "2026-01-15", "branch": "SC Marabahan", "value": 5000000, "kind": "akhir"
        }, timeout=30)
        assert r.status_code == 200


# ------------ Food cost ------------
class TestFoodCost:
    def test_foodcost(self, admin_session):
        r = admin_session.get(f"{API}/foodcost", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("beginning", "purchases", "ending", "spoilage", "usage", "net_sales",
                  "food_cost_pct", "menus"):
            assert k in d


# ------------ Reports ------------
class TestReports:
    def test_cashflow(self, admin_session):
        r = admin_session.get(f"{API}/reports/cashflow", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "ledger" in d and "expense_by_category" in d and "food_cost" in d

    def test_export_excel(self, admin_session):
        r = admin_session.get(f"{API}/reports/export?fmt=excel", timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 500

    def test_export_pdf(self, admin_session):
        r = admin_session.get(f"{API}/reports/export?fmt=pdf", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").lower().startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ------------ Master data CRUD ------------
class TestMasterData:
    def test_vendor_crud(self, admin_session):
        r = admin_session.post(f"{API}/vendors", json={
            "name": "TEST_Vendor", "category": "Bahan", "phone": "0800"
        }, timeout=30)
        assert r.status_code == 200
        vid = r.json()["id"]
        r = admin_session.put(f"{API}/vendors/{vid}", json={
            "name": "TEST_Vendor2", "category": "Bahan", "phone": "0800"
        }, timeout=30)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Vendor2"
        r = admin_session.delete(f"{API}/vendors/{vid}", timeout=30)
        assert r.status_code == 200


# ------------ Role protection ------------
class TestRoleProtection:
    def test_finance_cannot_create_user(self, finance_session):
        r = finance_session.post(f"{API}/users", json={
            "email": "x@x.com", "password": "x", "name": "x", "role": "finance_user"
        }, timeout=30)
        assert r.status_code == 403

    def test_finance_cannot_seed(self, finance_session):
        r = finance_session.post(f"{API}/seed", timeout=30)
        assert r.status_code == 403

    def test_finance_cannot_list_users(self, finance_session):
        r = finance_session.get(f"{API}/users", timeout=30)
        assert r.status_code == 403

    def test_finance_can_read_dashboard(self, finance_session):
        r = finance_session.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 200


# ------------ Cleanup ------------
def test_zzz_cleanup_finance_user(admin_session):
    users = admin_session.get(f"{API}/users", timeout=30).json()
    for u in users:
        if u["email"] == FIN_EMAIL:
            admin_session.delete(f"{API}/users/{u['id']}", timeout=30)
