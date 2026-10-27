# Prisim Control Panel

A separate dashboard for Prisim (not started yet).

It will cover sales, expenses, OCR status, purchases, deductions, salary, logins and role permissions.

## Starting point

The current Control Panel screens live in the frontend app, under `frontend/src/pages/control/`.
The Centre Kitchen Dashboard also uses them under **Setup & Access**, so copy what you need here
instead of moving them.

## Notes

- Use the same Supabase project for sign-in as the frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` in a local `.env`).
- When this becomes its own app, create a new Vercel project with Root Directory `control-panel`.
