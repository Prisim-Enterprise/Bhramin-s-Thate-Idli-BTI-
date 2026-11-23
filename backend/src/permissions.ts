// Roles and the default permission matrix. Keep in step with frontend/src/data/mock.ts.
// An admin can change the matrix in the Control Panel; it is then stored in the settings table.

export type Role = 'admin' | 'accountant' | 'kitchen' | 'cashier' | 'manager' | 'auditor'
export const ROLES: Role[] = ['admin', 'accountant', 'kitchen', 'cashier', 'manager', 'auditor']

export const MODULES = ['dashboard', 'sales', 'expenses', 'ocr', 'accounts', 'purchase', 'indent', 'deductions', 'salary', 'users', 'settings'] as const
export type ModuleId = (typeof MODULES)[number]
export const ACTIONS = ['view', 'create', 'edit', 'approve', 'delete'] as const
export type Action = (typeof ACTIONS)[number]
export type Matrix = Record<Role, Record<ModuleId, Action[]>>

const all: Action[] = [...ACTIONS]
const ro: Action[] = ['view']
const fill = (v: Action[]) => Object.fromEntries(MODULES.map((m) => [m, [...v]])) as Record<ModuleId, Action[]>

export const DEFAULT_MATRIX: Matrix = {
  admin: fill(all),
  auditor: fill(ro),
  accountant: {
    ...fill([]),
    dashboard: ro, sales: ro, expenses: ['view', 'create', 'edit'], ocr: ['view', 'create', 'edit', 'approve'],
    accounts: ['view', 'create', 'edit', 'approve'], purchase: ['view', 'approve'], deductions: ['view', 'create', 'edit'],
    salary: ['view', 'create', 'edit'],
  },
  kitchen: {
    ...fill([]),
    dashboard: ro, ocr: ['view', 'create'], purchase: ['view', 'create', 'edit'], indent: ['view', 'create', 'edit', 'approve'],
  },
  cashier: { ...fill([]), dashboard: ro, sales: ['view', 'create'], expenses: ['view', 'create'] },
  manager: {
    ...fill([]),
    dashboard: ro, sales: ['view', 'create', 'edit'], expenses: ['view', 'create', 'approve'], ocr: ro,
    purchase: ['view', 'create'], indent: ['view', 'create'], salary: ro,
  },
}

/** A matrix sent by the Control Panel, cleaned up. Admin always keeps full access. */
export function cleanMatrix(input: unknown): Matrix | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, Record<string, unknown>>
  const out = {} as Matrix
  for (const r of ROLES) {
    out[r] = {} as Record<ModuleId, Action[]>
    for (const m of MODULES) {
      const v = src[r]?.[m]
      const list = Array.isArray(v) ? (v.filter((a) => (ACTIONS as readonly string[]).includes(a as string)) as Action[]) : []
      // Anything beyond view needs view.
      out[r][m] = list.length && !list.includes('view') ? ['view', ...list] : [...new Set(list)]
    }
  }
  out.admin = fill(all)
  return out
}

// Which Control Panel modules decide who may change each kind of record.
// write = create or edit on any of them; remove = delete or edit.
export const KIND_RULES: Record<string, { write: [ModuleId, Action[]][]; remove: [ModuleId, Action[]][] }> = {
  dayEntries: { write: [['accounts', ['create', 'edit']], ['sales', ['create', 'edit']]], remove: [['accounts', ['delete', 'edit']]] },
  bills: { write: [['ocr', ['create', 'edit']]], remove: [['ocr', ['delete', 'edit']]] },
  // Posting a checked bill writes a voucher (and a vendor ledger), so bill approvers may too.
  ledgers: { write: [['accounts', ['create', 'edit', 'approve']], ['ocr', ['approve']]], remove: [['accounts', ['delete', 'edit']]] },
  // Branch managers report petty expenses as journals (Expenses: create); a login tied to one branch stays limited to it.
  // Approving a partner's weekly statement posts (or, when an approval is taken back, removes) its Journal: accounts approvers too.
  manualVouchers: { write: [['accounts', ['create', 'edit', 'approve']], ['ocr', ['approve']], ['expenses', ['create', 'edit']]], remove: [['accounts', ['delete', 'edit', 'approve']], ['ocr', ['approve']], ['expenses', ['edit']]] },
  // Closing stock counted at outlets (Inventory → Closing Stock Tracker).
  closingStock: { write: [['indent', ['create', 'edit']], ['purchase', ['create', 'edit']]], remove: [['indent', ['delete', 'edit']]] },
  // Centre Kitchen: goods received and goods issued to outlets (kept under branch CK).
  stockMoves: { write: [['indent', ['approve', 'edit']]], remove: [['indent', ['delete', 'edit']]] },
  // Requests from outlets to the Centre Kitchen (kept under the asking outlet's branch).
  indents: { write: [['indent', ['create', 'edit', 'approve']]], remove: [['indent', ['delete', 'edit']]] },
  // Mobikwik: UPI / card split of each day's Mobikwik takings (kept under the outlet's branch).
  paySplits: { write: [['accounts', ['create', 'edit']], ['sales', ['edit']]], remove: [['accounts', ['delete', 'edit']]] },
  // Weekly partner statements (Swiggy, Zomato, Rapido, Mobikwik): deductions approved, receipts matched.
  settlements: { write: [['accounts', ['create', 'edit', 'approve']]], remove: [['accounts', ['delete', 'edit']]] },
  // The company master (Gateway of Tally → Company Creation / Alteration): one record.
  company: { write: [['accounts', ['create', 'edit']]], remove: [['accounts', ['delete']]] },
  // Bank reconciliation: bank dates on vouchers, and the bank statement lines uploaded to match against.
  bankRecos: { write: [['accounts', ['create', 'edit', 'approve']]], remove: [['accounts', ['edit', 'delete']]] },
  bankLines: { write: [['accounts', ['create', 'edit']]], remove: [['accounts', ['delete', 'edit']]] },
  // Opening BRS: cheques and deposits from before the books started that the bank hadn't cleared.
  bankOpening: { write: [['accounts', ['create', 'edit']]], remove: [['accounts', ['delete', 'edit']]] },
  // Partner terms: commission agreed with Swiggy / Zomato / … and the approved advertisement budget (set by approvers).
  // Partner terms and Zomato calculation rules (versioned by date): admins only (Control Panel settings).
  partnerTerms: { write: [['settings', ['edit']]], remove: [['settings', ['edit', 'delete']]] },
  // Aggregator Reconciliation: bank credits matched to weekly statements (many to many), and restaurant ID → outlet.
  bankMatches: { write: [['accounts', ['edit', 'approve']]], remove: [['accounts', ['edit', 'approve']]] },
  aggregatorOutlets: { write: [['accounts', ['create', 'edit']]], remove: [['settings', ['edit']]] },
}

/**
 * A finalised weekly statement is locked. Changing it is allowed only when the money and approvals stay exactly as
 * finalised (e.g. a note), or when it is reopened: the finalised mark removed and a revision with a reason added,
 * by someone who may approve accounts. Returns the reason it is refused, or null.
 */
export function settlementChangeRefused(existing: Record<string, unknown> | null, incoming: Record<string, unknown>, canApprove: boolean): string | null {
  const fin = existing?.finalised as { at?: string } | null | undefined
  if (!fin) return null
  const LOCKED = ['gross', 'deductions', 'statementNet', 'commissionBase', 'zomato', 'adApprovals', 'received', 'branch', 'date', 'partner']
  const same = (k: string) => JSON.stringify(existing?.[k] ?? null) === JSON.stringify(incoming[k] ?? null)
  const stillFinal = (incoming.finalised as { at?: string } | null | undefined)?.at === fin.at
  if (stillFinal) return LOCKED.every(same) ? null : 'This week is finalised. Reopen it with a reason before changing its figures.'
  const before = Array.isArray(existing?.revisions) ? (existing!.revisions as unknown[]).length : 0
  const after = Array.isArray(incoming.revisions) ? (incoming.revisions as { reason?: string }[]) : []
  if (!canApprove) return 'Only someone who can approve accounts can reopen a finalised week.'
  if (after.length !== before + 1 || !(after[after.length - 1]?.reason ?? '').trim()) return 'Reopening a finalised week needs a reason (a new revision).'
  if (!LOCKED.every(same)) return 'Reopen the week first, then change it.'
  return null
}
// Uploading files (bills, receipts) and reading handwritten bills.
export const FILE_RULE: [ModuleId, Action[]][] = [['ocr', ['create']], ['accounts', ['create']]]

export function allowed(matrix: Matrix, role: Role, rule: [ModuleId, Action[]][]): boolean {
  if (role === 'admin') return true
  return rule.some(([m, acts]) => acts.some((a) => matrix[role]?.[m]?.includes(a)))
}
