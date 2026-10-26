# Prisim RMIS – Frontend

Restaurant MIS frontend: an **Admin** area (accounting + kitchen management) and the **Prisim Control Panel** (sales, expenses, OCR, purchases, deductions, salary, login & role permissions).

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Stack: React 18, TypeScript, Vite, Tailwind CSS 4, React Router, Recharts, lucide icons.

## Portals

| URL | Portal | What's in it |
|---|---|---|
| `/` | Sign in | Pick a role (demo) and which portal to open |
| `/admin` | **Centre Kitchen Dashboard** | Dashboard, branch dashboards, accounting reports, OCR bills, indents, storage, POs. |
| `/control` | **Prisim Control Panel** | Restaurants, sales, expenses, OCR status, purchases, deductions, salary, users, roles, integrations |

The two portals are separate: each has its own layout and sidebar, and you choose one at sign-in. The Centre Kitchen Dashboard also includes all Control Panel pages.

## Structure

```
src/
  data/mock.ts          sample data, roles, default permissions, payroll maths  ← swap for API calls
  context/AppContext    current role, permission matrix, OCR switches, deduction rules (saved in localStorage)
  components/           Layout (sidebar, top bar) and shared UI
  pages/Login.tsx       sign-in / portal chooser
  pages/admin/          Dashboard, Branch dashboards, OCR Bill Inbox, Food Costing (Tally style),
                        Branch Indents, Storage, Purchase Orders
  pages/control/        Control overview, Restaurants & Branches, Sales, Expenses, OCR Status,
                        Purchases & Vendors, Deductions, Salary, Users & Login, Role Permissions,
                        Integrations & AI
```

## Flows

- **Accounting:** bill from kitchen manager → OCR → review/edit lines → post as *credited bill* or *other purchase expense* → feeds the Tally-style food costing & gross margin report.
- **Kitchen:** branch indent → storage check per item → issue if in stock, otherwise purchase order → vendor item cost + basket expense → bill to accounting.
- **Roles:** Admin, Accountant, Kitchen Manager, Cashier, Manager (per branch), Auditor (view only). Edit the matrix under Control Panel → Role Permissions; the sidebar and pages follow it. Pick the role on the sign-in page to preview it.

All data is sample data held in the browser. There is no backend or real login yet.
