"""Tests for Sonic Finance new features: receipt uploads + daily summary email."""
import io
import os
import time
import struct
import zlib
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "putriaqillah310803@gmail.com"
ADMIN_PASSWORD = "SonicGo2026!"
FIN_EMAIL = "test_finance_user@sonicgo.example.com"
FIN_PASSWORD = "FinancePass2026!"
CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")


def _make_png(w=8, h=8) -> bytes:
    """Minimal valid PNG."""
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def finance_session(admin_session):
    users = admin_session.get(f"{API}/users", timeout=30).json()
    if not any(u["email"] == FIN_EMAIL for u in users):
        admin_session.post(f"{API}/users", json={
            "email": FIN_EMAIL, "password": FIN_PASSWORD,
            "name": "Test Finance", "role": "finance_user"
        }, timeout=30)
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": FIN_EMAIL, "password": FIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --------------- Receipt upload ---------------
class TestReceiptUpload:
    def test_upload_requires_auth(self):
        r = requests.post(f"{API}/uploads/receipt",
                          files={"file": ("t.png", _make_png(), "image/png")}, timeout=30)
        assert r.status_code == 401

    def test_upload_rejects_bad_ext(self, admin_session):
        r = admin_session.post(f"{API}/uploads/receipt",
                               files={"file": ("hack.exe", b"MZ\x00\x00", "application/octet-stream")},
                               timeout=30)
        assert r.status_code == 400
        assert "didukung" in r.text.lower() or "format" in r.text.lower()

    def test_upload_and_serve_png(self, admin_session):
        png = _make_png()
        r = admin_session.post(f"{API}/uploads/receipt",
                               files={"file": ("receipt.png", png, "image/png")}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "path" in body
        assert body["content_type"] == "image/png"
        path = body["path"]

        # serve requires auth
        r_noauth = requests.get(f"{API}/files/{path}", timeout=30)
        assert r_noauth.status_code == 401

        # serve OK with auth
        r2 = admin_session.get(f"{API}/files/{path}", timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/png")
        # bytes match
        assert r2.content[:8] == b"\x89PNG\r\n\x1a\n"

        # unknown path -> 404
        r3 = admin_session.get(f"{API}/files/sonic-finance/receipts/does-not-exist.png", timeout=30)
        assert r3.status_code == 404

        # Attach to expense
        exp = admin_session.post(f"{API}/expenses", json={
            "date": "2026-01-16", "category": "Operasional",
            "description": "TEST receipt attached", "amount": 12345,
            "branch": "SC Marabahan", "receipt_path": path,
        }, timeout=30)
        assert exp.status_code == 200
        eid = exp.json()["id"]
        got = admin_session.get(f"{API}/expenses", timeout=30).json()
        row = next(x for x in got if x["id"] == eid)
        assert row["receipt_path"] == path
        admin_session.delete(f"{API}/expenses/{eid}", timeout=30)


# --------------- Cron daily summary ---------------
class TestCronDailySummary:
    def test_cron_requires_bearer(self):
        r = requests.post(f"{API}/cron/daily-summary", timeout=30)
        assert r.status_code == 401

    def test_cron_wrong_secret(self):
        r = requests.post(f"{API}/cron/daily-summary",
                          headers={"Authorization": "Bearer wrong-secret"}, timeout=30)
        assert r.status_code == 401

    def test_cron_correct_secret(self):
        assert CRON_SECRET, "WEBHOOK_CRON_SECRET not loaded from backend/.env"
        r = requests.post(f"{API}/cron/daily-summary",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("queued") is True


# --------------- Admin email summary now ---------------
class TestAdminEmailSummary:
    def test_finance_forbidden(self, finance_session):
        r = finance_session.post(f"{API}/reports/email-summary", timeout=30)
        assert r.status_code == 403

    def test_admin_sends(self, admin_session):
        r = admin_session.post(f"{API}/reports/email-summary", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
