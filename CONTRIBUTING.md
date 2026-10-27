# Working together on BTI

How two people share the work on this repository without overwriting each other.

**The short version:** every task gets its own branch → open a Pull Request → the other person checks it → merge into `main` → Vercel puts it live.

---

## 1. Who owns what

Split by **area**, not by file, so you rarely edit the same files.

| Person | Owns | Folder |
|---|---|---|
| **Person A** | Screens (frontend) | `frontend/` |
| **Person B** | Server, database, file reading, Tally export (backend) | `backend/` |

When the backend is not busy yet, split the frontend by section instead:

| Area | Folder |
|---|---|
| Accounting reports, OCR bills, uploads | `frontend/src/pages/admin/reports/`, `OcrBills.tsx`, `components/BookUpload.tsx` |
| Kitchen (indents, stock, purchase orders) | `frontend/src/pages/admin/Indents.tsx`, `Storage.tsx`, `PurchaseOrders.tsx` |
| Setup, users, roles, Control Panel | `frontend/src/pages/control/`, `BranchesIntegrations.tsx` |

### Shared files – tell the other person before editing

These are used by every page, so two people changing them at once causes conflicts:

- `frontend/src/data/mock.ts` – data and types
- `frontend/src/App.tsx` – page routes
- `frontend/src/components/Layout.tsx` – sidebar and menus
- `frontend/src/components/ui.tsx` – shared buttons, cards, tables

Send a quick message ("editing Layout.tsx for the next hour") and merge those changes quickly.

---

## 2. First-time setup (co-worker)

1. Get **write access** to the repo: an owner of the `Prisim-Enterprise` GitHub organization adds you under *Repository → Settings → Collaborators and teams*.
2. Install [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) (version 20 or newer).
3. Download the code and run it:

```
git clone https://github.com/Prisim-Enterprise/Bhramin-s-Thate-Idli-BTI-.git
cd Bhramin-s-Thate-Idli-BTI-/frontend
npm install
npm run dev
```

4. Open http://localhost:5173

---

## 3. The rules

1. **`main` is the live site.** Whatever is on `main` is deployed to Vercel. Never push straight to `main`.
2. **One task = one branch.** Name it after the task: `feature/statements-inbox`, `fix/sales-report-total`, `backend/login-api`.
3. **Keep branches small and short.** Merge within 1–2 days. Big, long branches cause painful conflicts.
4. **Every change goes through a Pull Request (PR)** and the other person approves it.
5. **Build before you push.** Run `npm run build` in `frontend/`. If it fails, fix it first.

---

## 4. Daily routine

### Start a task

```
git checkout main
git pull                          # get the latest from GitHub
git checkout -b feature/my-task   # new branch for this task
```

### While working

```
git add -A
git commit -m "Add upload button to Statements inbox"
git push -u origin feature/my-task     # first push of the branch
git push                               # later pushes
```

Commit often with a short sentence saying **what** changed.

### Stay up to date (do this every morning)

```
git checkout main
git pull
git checkout feature/my-task
git merge main
```

If Git reports a **conflict**, open the listed files, keep the right lines (remove the `<<<<<<<`, `=======`, `>>>>>>>` markers), then:

```
git add -A
git commit -m "Merge main into my branch"
```

### Finish a task

1. Push your branch.
2. On GitHub, click **Compare & pull request**.
3. Write what changed and how to test it. Add `Closes #12` if it finishes issue #12.
4. Vercel adds a **preview link** to the PR – the reviewer clicks it to see the change working.
5. The other person reviews and clicks **Approve**.
6. Click **Squash and merge**, then **Delete branch**.
7. Vercel updates the live site automatically within a minute or two.

---

## 5. Reviewing the other person's PR

- Open the Vercel preview link and try the change.
- Check the **Files changed** tab: does it touch shared files? Anything unexpected?
- Approve, or leave a comment saying exactly what to change.
- Aim to review within the same day so nobody is blocked.

---

## 6. Tracking who does what

Use **GitHub Issues** plus a **Project board** on the repo:

| Column | Meaning |
|---|---|
| To do | Agreed, not started |
| In progress | Someone is on it (assign yourself) |
| In review | PR open, waiting for the other person |
| Done | Merged and live |

- One issue per task, with a clear title ("Read Mobikwik settlement report").
- Assign it to yourself before starting, so you never both build the same thing.
- A 10-minute check-in each day: what I finished, what I'm doing next, anything blocking me.

---

## 7. Suggested first split

| Person A – frontend | Person B – backend |
|---|---|
| Statements inbox screen (upload bank, Mobikwik, Swiggy, Zomato files) | Set up the backend: API server, database, real login |
| Review screen for an uploaded Imprest Book | Read bank statement and Mobikwik report files |
| "Approve → Export to Tally" screen | Build Tally import file from approved entries |
| Real login screen (connect to backend login) | Ledger name mapping (Tally ledger list → app) |
| Replace sample data in `mock.ts` with API calls, page by page | Matching: POS vs Swiggy/Zomato/Mobikwik vs bank |

Agree on the **API shape first** (which URLs, what data they return) and write it down in `backend/README.md`, so frontend and backend can be built at the same time.

---

## 8. One-time GitHub and Vercel settings (repo owner)

- **Protect `main`:** *Settings → Branches → Add rule* for `main`: require a pull request and 1 approval before merging.
- **Vercel:** project connected to this repo, Root Directory `frontend`, Production Branch `main`. Every PR then gets its own preview link.
- **Secrets:** never commit passwords, API keys or bank details. Use Vercel *Environment Variables* and a local `.env` file (already ignored by Git).
