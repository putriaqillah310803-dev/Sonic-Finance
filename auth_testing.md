# SonicGo Auth Testing

## Roles
- super_admin: full access + user management + master data + seed
- finance_user: data entry (sales, expenses, purchases, inventory) + reports (no user mgmt)

## Credentials
- Super Admin: putriaqillah310803@gmail.com / SonicGo2026!

## Auth endpoints (all under /api)
- POST /auth/login  {email, password}  -> sets httpOnly cookies, returns user
- GET  /auth/me     -> current user
- POST /auth/logout -> clears cookies
- POST /auth/refresh

## Quick test
```
curl -c cookies.txt -X POST $URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"putriaqillah310803@gmail.com","password":"SonicGo2026!"}'
curl -b cookies.txt $URL/api/auth/me
```
Cookies are SameSite=none Secure; frontend uses axios withCredentials.
