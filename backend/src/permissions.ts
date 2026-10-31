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
  ledgers: { write: [['accounts', ['create', 'edit']], ['ocr', ['approve']]], remove: [['accounts', ['delete', 'edit']]] },
  // Branch managers report petty expenses as journals (Expenses: create); a login tied to one branch stays limited to it.
  manualVouchers: { write: [['accounts', ['create', 'edit']], ['ocr', ['approve']], ['expenses', ['create', 'edit']]], remove: [['accounts', ['delete', 'edit']], ['ocr', ['approve']], ['expenses', ['edit']]] },
  // Closing stock counted at outlets (Inventory → Closing Stock Tracker).
  closingStock: { write: [['indent', ['create', 'edit']], ['purchase', ['create', 'edit']]], remove: [['indent', ['delete', 'edit']]] },
}
// Uploading files (bills, receipts) and reading handwritten bills.
export const FILE_RULE: [ModuleId, Action[]][] = [['ocr', ['create']], ['accounts', ['create']]]

export function allowed(matrix: Matrix, role: Role, rule: [ModuleId, Action[]][]): boolean {
  if (role === 'admin') return true
  return rule.some(([m, acts]) => acts.some((a) => matrix[role]?.[m]?.includes(a)))
}
