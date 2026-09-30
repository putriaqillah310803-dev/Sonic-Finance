"""Excel generation for Sonic Finance reports.

Two modes:
1. styled_report_excel(report): a clean styled sheet for a single computed report.
2. fill_template(...): opens the owner's original workbook (report_template.xlsx)
   and fills Cabang/Periode headers + the sales/foodcost figures we track, keeping
   every merge, colour and formula from the original file intact.
"""
import io
import os
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

from exports import build_excel, _rp

TEMPLATE_PATH = Path(__file__).parent / "report_template.xlsx"


def _fmt_cell(val, col):
    if col.get("money"):
        return _rp(val) if isinstance(val, (int, float)) else val
    return val


def styled_report_excel(report):
    headers = [c["label"] for c in report["columns"]]
    cols = report["columns"]
    rows = [[_fmt_cell(v, cols[i] if i < len(cols) else {}) for i, v in enumerate(r)] for r in report["rows"]]
    sections = [{"name": report["title"], "headers": headers, "rows": rows}]
    if report.get("summary"):
        sections.append({
            "name": "Ringkasan",
            "headers": ["Keterangan", "Nilai"],
            "rows": [[k, _rp(v) if isinstance(v, (int, float)) else v] for k, v in report["summary"]],
        })
    return build_excel(report["title"], report["meta"], sections)


def _set(ws, coord, value):
    try:
        ws[coord] = value
    except Exception:
        pass


# Cabang/Periode header cells per sheet (value cells only; labels stay from template).
HEADER_CELLS = {
    "PEMBELIAN KREDIT": ("J7", "J8"),
    "TO-TI": ("D3", "D4"),
    "WEEKLY": ("F5", "F6"),
    "LAP. CF": ("I7", "I6"),
    "IKHTISAR FOOD COST": ("D5", "D6"),
    "LAPORAN KAS PERIODE": ("M3", "M4"),
    "LAP. PENJUALAN REGULER": ("O3", "O4"),
    "LAP. PENJUALAN GRABFOOD": ("O3", "O4"),
    "LAP. PENJUALAN GOFOOD": ("O3", "O4"),
    "LAP. PENJUALAN SHOPEFOOD": ("O3", "O4"),
    "COST ANALYSIS": ("J5", "J6"),
    "LEFT OVER": ("K3", "K4"),
}


def fill_template(cabang, periode_label, cf_rows, kas_days, fc):
    wb = openpyxl.load_workbook(TEMPLATE_PATH)

    # 1) Cabang + Periode headers on every mapped sheet.
    for sheet, (c_cab, c_per) in HEADER_CELLS.items():
        if sheet in wb.sheetnames:
            ws = wb[sheet]
            _set(ws, c_cab, cabang)
            _set(ws, c_per, periode_label)

    # 2) LAP. CF — daily sales receipts (rows 11..20) and daily spending (rows 37..46).
    if "LAP. CF" in wb.sheetnames:
        ws = wb["LAP. CF"]
        for i, r in enumerate(cf_rows[:10]):
            _set(ws, f"D{11 + i}", r["date"])
            _set(ws, f"H{11 + i}", round(r["in"], 2))
            _set(ws, f"D{37 + i}", r["date"])
            _set(ws, f"H{37 + i}", round(r["out"], 2))

    # 3) LAPORAN KAS PERIODE — per-day columns D..M, rows 6 (date), 7 (day), 8 (gross), 15 (net).
    if "LAPORAN KAS PERIODE" in wb.sheetnames:
        ws = wb["LAPORAN KAS PERIODE"]
        tot_g = tot_n = 0
        for i, d in enumerate(kas_days[:10]):
            col = get_column_letter(4 + i)  # D=4
            _set(ws, f"{col}6", d["date"])
            _set(ws, f"{col}7", d["day"])
            _set(ws, f"{col}8", round(d["gross"], 2))
            _set(ws, f"{col}15", round(d["net"], 2))
            tot_g += d["gross"]; tot_n += d["net"]
        _set(ws, "N8", round(tot_g, 2))
        _set(ws, "N15", round(tot_n, 2))

    # 4) IKHTISAR FOOD COST — key input figures (leave % formulas intact).
    if "IKHTISAR FOOD COST" in wb.sheetnames:
        ws = wb["IKHTISAR FOOD COST"]
        _set(ws, "B10", round(fc["beginning"], 2))
        _set(ws, "B19", round(fc["purchases"], 2))
        _set(ws, "B20", 0)
        _set(ws, "B33", round(fc["ending"], 2))
        _set(ws, "B39", round(fc["net_sales"], 2))
        _set(ws, "B44", round(fc["net_sales"], 2))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
