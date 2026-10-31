# Prisim Control Panel

All settings and access controls live here. It runs inside the frontend app at **`/control`**
(locally http://localhost:5173/control, live https://bhramin-s-thate-idli-bti.vercel.app/control).

- Admins only. Other roles are refused, even if they open the address directly.
- Admins switch between it and the Centre Kitchen Dashboard from the sidebar or the account menu.
- The screens are in `frontend/src/pages/control/`.

## What's in it

| Section | Pages |
|---|---|
| Setup | Control Overview, Restaurants & Branches, Branch Integrations |
| Money | Sales, Expenses, Bill Reading (Sarvam usage and daily limit), Purchases & Vendors, Deductions, Salary |
| Access & System | Users & Login, Role Permissions, Integrations & AI |

The Centre Kitchen Dashboard keeps only day-to-day work: Dashboard, Branch Dashboards, Accounting and Kitchen Manager.

## If it becomes its own app later

Use the same Supabase project for sign-in, the same Cloudflare API, and a new Vercel project with Root Directory `control-panel`.

## Access & tracking (added Oct 2026)

- **Users & Login** – real logins (Supabase). Create a login with a temporary password, set role and branch
  ("all branches" or one branch only), turn a login off (blocked by the API at once), set a new password.
  Needs the Worker secret `SUPABASE_SECRET_KEY` (`npx wrangler secret put SUPABASE_SECRET_KEY` in `backend/`).
- **Role Permissions** – saved on the server (`settings` table) and enforced by the API for every save/delete/upload.
- **Activity** – the API's audit log: who saved, deleted, uploaded, read a bill or changed a setting, per login.
- **Data Flow** – diagram from each role or login → screens → where data is kept → the reports it feeds,
  live connection status, and one strip per login.

Reports (Profit & Loss, Expenses, Purchases, Food Cost, Deductions) are worked out from day entries
(Imprest Book PDFs) and bills posted from the OCR Bill Inbox – see `frontend/src/data/analytics.ts`.
