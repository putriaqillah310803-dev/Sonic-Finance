# SonicGo — Sonic Chicken F&B ERP

## Original Problem Statement
Internal web app "SonicGo" to manage Sonic Chicken F&B operations: Finance, Sales, Inventory, and Food Cost — replacing manual Excel. Integrated lite-ERP dashboard with smooth data entry, automatic calculations, and clear reporting.

## User Choices
- Auth: Email + password. Two roles: super_admin (owner, manages all users + master data) and finance_user (data entry + reports).
- Food Cost: period/inventory method AND per-menu recipe method.
- Multi-branch supported.
- Extra features: low stock alerts, Excel/PDF export, vendor debt (credit purchases).
- Seeded sample data derived from the uploaded SC Marabahan July 2026 report.

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes prefixed `/api`. JWT httpOnly cookie auth (SameSite=None, Secure), bcrypt hashing, role dependency `require_admin`.
- Frontend: React 19 + React Router + Tailwind + shadcn/ui + recharts + sonner. Axios `withCredentials`. Global context for auth, language (ID/EN), and active branch.
- Exports: openpyxl (Excel) + reportlab (PDF).
- Owner/super admin: putriaqillah310803@gmail.com (seeded on startup, password in backend/.env).

## Data Models
Users, Branches, Vendors, Products (ingredients w/ unit, unit_price/HPP, stock, min_stock), Menus (recipe ingredients), Sales (channel, gross, net, commission), Expenses (petty cash LPKK), Purchases (vendor credit/debt w/ paid+status), InventoryLog (Masuk/Keluar/Transfer/Rusak), Snapshots (inventory value awal/akhir).

## Implemented (2026-06)
- Secure login + role-based access; user management (admin only).
- Dashboard: KPI cards (Total Sales, Expenses, Cash Flow, Food Cost %), channel breakdown chart, daily sales trend, low stock alerts. Period + branch filters.
- Sales entry with channel commission auto-calc + net preview; list/delete.
- Expenses (petty cash) + Credit vendor purchases (tabs).
- Inventory: stock count, spoilage, TO-TI inter-branch transfer, inventory value snapshots.
- Vendor Debt: summary cards, table, record partial/full payment.
- Food Cost: period formula breakdown + per-menu recipe food cost.
- Reports: cash flow ledger, expense-by-category, Excel + PDF export.
- Master Data (admin): vendors/products/branches CRUD. Mutations admin-only; reads open to all authenticated.
- Bilingual ID/EN toggle across app. Multi-branch reactive filter. Sample data seeded.
- Verified: 22/22 backend tests pass; all core frontend flows verified by testing agent.

## Backlog / Remaining
- P1: Enforce per-branch stock tracking (Transfer currently no-op on global product stock).
- P1: Menu/recipe editor UI in Master Data (backend supports menus CRUD; only seeded currently).
- P2: Brute-force lockout on login; DialogDescription a11y on modals.
- P2: Split server.py into routers as features stabilize.
- P2: Receipt/invoice attachment upload for expenses/purchases.

## Test Credentials
- super_admin: putriaqillah310803@gmail.com / SonicGo2026!
- (test) finance_user left by testing agent: test_ui_finance@sonicgo.example.com / FinancePw2026!
