// App data. All records start empty; they will come from the backend once it is connected.
// Settings (roles, permissions, bill types, deduction rules, integration list) and the branch list stay here.

export type RoleId = 'admin' | 'accountant' | 'kitchen' | 'cashier' | 'manager' | 'auditor'

export const ROLES: { id: RoleId; name: string; desc: string }[] = [
  { id: 'admin', name: 'Admin', desc: 'Full access across all branches' },
  { id: 'accountant', name: 'Accountant', desc: 'Bills, OCR, ledgers, food costing' },
  { id: 'kitchen', name: 'Kitchen Manager', desc: 'Indents, storage, purchase orders' },
  { id: 'cashier', name: 'Cashier', desc: 'Sales entry and day close' },
  { id: 'manager', name: 'Manager (per branch)', desc: 'Runs a single branch' },
  { id: 'auditor', name: 'Auditor', desc: 'View only, all modules' },
]

export const MODULES = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'sales', name: 'Sales' },
  { id: 'expenses', name: 'Expenses' },
  { id: 'ocr', name: 'OCR & Bills' },
  { id: 'accounts', name: 'Accounts / Ledger' },
  { id: 'purchase', name: 'Purchases' },
  { id: 'indent', name: 'Indents & Storage' },
  { id: 'deductions', name: 'Deductions' },
  { id: 'salary', name: 'Salary' },
  { id: 'users', name: 'Login & Roles' },
  { id: 'settings', name: 'Control Panel Settings' },
] as const
export type ModuleId = (typeof MODULES)[number]['id']
export const ACTIONS = ['view', 'create', 'edit', 'approve', 'delete'] as const
export type Action = (typeof ACTIONS)[number]
export type PermissionMatrix = Record<RoleId, Record<ModuleId, Action[]>>

const all: Action[] = ['view', 'create', 'edit', 'approve', 'delete']
const ro: Action[] = ['view']
const none: Action[] = []
const fill = (v: Action[]) =>
  Object.fromEntries(MODULES.map((m) => [m.id, [...v]])) as Record<ModuleId, Action[]>

export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  admin: fill(all),
  auditor: fill(ro),
  accountant: {
    ...fill(none),
    dashboard: ro, sales: ro, expenses: ['view', 'create', 'edit'], ocr: ['view', 'create', 'edit', 'approve'],
    accounts: ['view', 'create', 'edit', 'approve'], purchase: ['view', 'approve'], deductions: ['view', 'create', 'edit'],
    salary: ['view', 'create', 'edit'],
  },
  kitchen: {
    ...fill(none),
    dashboard: ro, ocr: ['view', 'create'], purchase: ['view', 'create', 'edit'], indent: ['view', 'create', 'edit', 'approve'],
  },
  cashier: { ...fill(none), dashboard: ro, sales: ['view', 'create'], expenses: ['view', 'create'] },
  manager: {
    ...fill(none),
    dashboard: ro, sales: ['view', 'create', 'edit'], expenses: ['view', 'create', 'approve'], ocr: ro,
    purchase: ['view', 'create'], indent: ['view', 'create'], salary: ro,
  },
}

export const RESTAURANTS = [
  { id: 'R1', name: "Brahmins' Thatte Idli", gstin: '', branches: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'] },
]

// Branch list (outlet names as used in Tally).
// status stays 'not_connected' until the backend reports whether each branch is online.
export type BranchStatus = 'online' | 'offline' | 'not_connected'
export type Branch = {
  id: string; name: string; city: string; restaurant: string; manager: string
  ocr: boolean; sales: number; foodCost: number; status: BranchStatus
}
const branch = (id: string, name: string): Branch =>
  ({ id, name, city: 'Bengaluru', restaurant: 'R1', manager: '', ocr: true, sales: 0, foodCost: 0, status: 'not_connected' })

export const BRANCHES: Branch[] = [
  branch('CK', 'Central Kitchen'),
  branch('B1', 'Chandra Layout'),
  branch('B2', 'Kodigehalli'),
  branch('B3', 'Karle Tech Park'),
  branch('B4', 'Malleshwaram'),
  branch('B5', 'Rajajinagar Metro'),
  branch('B6', 'Sahakaranagar'),
  branch('B7', 'Sultan Palya'),
  branch('B8', 'Vidyaranyapura'),
  branch('B9', 'Vyalikaval'),
]

// Daily sales for the current week, per outlet (all zero until sales are connected).
export type DaySales = { day: string } & Record<string, number | string>
export const SALES_TREND: DaySales[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
  day, ...Object.fromEntries(BRANCHES.filter((b) => b.id !== 'CK').map((b) => [b.id, 0])),
}))

export type OcrStatus = 'queued' | 'processing' | 'extracted' | 'verified' | 'failed'
// original = the item name as written on the bill (e.g. Kannada), shown under the English name for checking.
export type BillLine = { item: string; qty: number; unit: string; rate: number; gst: number; original?: string }

// What kind of writing the bill has. OCR uses a different reader for each.
export type BillScript = 'en-hand' | 'kn-hand' | 'en-typed'
export const BILL_SCRIPTS: Record<BillScript, { label: string; short: string; hint: string }> = {
  'en-typed': { label: 'English – typed / printed', short: 'English typed', hint: 'Computer or machine-printed bills. Fastest and most accurate.' },
  'en-hand': { label: 'English – handwritten', short: 'English handwritten', hint: 'Bills written by hand in English. Check numbers carefully when reviewing.' },
  'kn-hand': { label: 'Kannada – handwritten', short: 'Kannada handwritten', hint: 'Bills written by hand in Kannada. Item names are translated to English; the Kannada stays visible for checking.' },
}
export type Bill = {
  id: string; vendor: string; branch: string; uploadedBy: string; date: string
  uploadedAt?: string // when it was uploaded (ISO date and time)
  status: OcrStatus; confidence: number; type: 'credit' | 'other'; script: BillScript; lines: BillLine[]
}
export const BILLS: Bill[] = []

export type Recipe = { dish: string; category: string; price: number; cost: number; sold: number }
export const RECIPES: Recipe[] = []

export type IndentStatus = 'pending' | 'issued' | 'po_raised' | 'partial'
export type Indent = {
  id: string; branch: string; date: string; requestedBy: string; status: IndentStatus
  items: { item: string; qty: number; unit: string }[]
}
export const INDENTS: Indent[] = []

export type StockItem = { item: string; category: string; unit: string; qty: number; reorder: number; avgCost: number }
export const STOCK: StockItem[] = []

export type Vendor = { id: string; name: string; category: string; terms: string; gstin: string }
export const VENDORS: Vendor[] = []

export type PurchaseOrder = {
  id: string; indent: string; vendor: string; date: string; status: string; basket: number
  lines: { item: string; qty: number; unit: string; rate: number }[]
}
export const PURCHASE_ORDERS: PurchaseOrder[] = []

export type Employee = {
  id: string; name: string; role: RoleId; branch: string; basic: number; hra: number; allow: number
  email: string; active: boolean; lastLogin: string
}
export const EMPLOYEES: Employee[] = []

export type Expense = { id: string; date: string; branch: string; category: string; desc: string; amount: number; status: string }
export const EXPENSES: Expense[] = []

export const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const branchName = (id: string) =>
  id === 'HO' ? 'Head Office' : BRANCHES.find((b) => b.id === id)?.name ?? id

// Payroll deduction rules (Indian statutory defaults). Editable in Control Panel → Deductions.
export type DeductionRules = {
  pfPct: number          // Employee PF, % of basic
  pfCap: number          // PF wage ceiling on basic
  esiPct: number         // Employee ESI, % of gross
  esiLimit: number       // ESI applies only when gross ≤ this
  ptAmount: number       // Professional tax per month
  tdsPct: number         // Flat TDS estimate, % of gross
  mealPerDay: number     // Staff meal recovery per working day
}
export const DEFAULT_DEDUCTIONS: DeductionRules = {
  pfPct: 12, pfCap: 15000, esiPct: 0.75, esiLimit: 21000, ptAmount: 200, tdsPct: 0, mealPerDay: 0,
}

// Salary advances to recover this month, by employee id.
export const ADVANCES: Record<string, number> = {}

export function computePay(e: Employee, r: DeductionRules, days = 26) {
  const gross = e.basic + e.hra + e.allow
  const pf = Math.round(Math.min(e.basic, r.pfCap) * (r.pfPct / 100))
  const esi = gross <= r.esiLimit ? Math.ceil(gross * (r.esiPct / 100)) : 0
  const pt = gross > 15000 ? r.ptAmount : 0
  const tds = Math.round(gross * (r.tdsPct / 100))
  const meal = r.mealPerDay * days
  const advance = ADVANCES[e.id] ?? 0
  const deductions = pf + esi + pt + tds + meal + advance
  return { gross, pf, esi, pt, tds, meal, advance, deductions, net: gross - deductions }
}

// ---------- Profit & Loss ----------
// Monthly running costs per outlet (₹). Sales are shown excluding GST.
export type BranchCosts = {
  salaries: number; rent: number; utilities: number; gas: number; repairs: number
  marketing: number; housekeeping: number; misc: number; depreciation: number
}
export const BRANCH_COSTS: Record<string, BranchCosts> = {}
// Central kitchen + head office costs, shared across outlets by their share of sales.
export const CENTRAL_COSTS = { salaries: 0, rent: 0, utilities: 0 }
// Share of sales that come through Swiggy / Zomato, and their average fee. Set from real data.
export const AGGREGATOR_SHARE = 0
export const AGGREGATOR_COMMISSION = 0
// Last month's sales and food cost % per outlet, for comparison.
export const LAST_MONTH: Record<string, { sales: number; foodCost: number }> = {}
// Earlier months (all outlets), for the trend chart.
export const PNL_HISTORY: { month: string; revenue: number; net: number }[] = []

// ---------- Report data ----------
// How counter customers paid (share of those sales).
export const PAYMENT_SPLIT: { mode: string; share: number }[] = []

// This month's purchases per vendor.
export type VendorSpend = { vendor: string; category: string; bought: number; paid: number; terms: string; dueBy: string }
export const VENDOR_SPEND: VendorSpend[] = []

// Items whose buying price changed compared with last month.
export const PRICE_CHANGES: { item: string; unit: string; before: number; now: number }[] = []

// ---------- Branch details & integrations ----------
// Address, phone and opening hours for each location. Blank until entered.
export const BRANCH_INFO: Record<string, { address: string; area: string; pincode: string; phone: string; hours: string }> =
  Object.fromEntries(BRANCHES.map((b) => [b.id, { address: '', area: b.name, pincode: '', phone: '', hours: '' }]))

export type IntegrationId = 'swiggy' | 'zomato' | 'ondc' | 'pos' | 'whatsapp' | 'forecast' | 'costwatch' | 'askai'
export const INTEGRATIONS: { id: IntegrationId; name: string; group: 'Online orders' | 'Billing' | 'AI' | 'Alerts'; desc: string; outletOnly?: boolean; needsId?: string }[] = [
  { id: 'swiggy', name: 'Swiggy', group: 'Online orders', desc: 'Orders, menu sync and payouts', outletOnly: true, needsId: 'Swiggy store ID' },
  { id: 'zomato', name: 'Zomato', group: 'Online orders', desc: 'Orders, menu sync and payouts', outletOnly: true, needsId: 'Zomato restaurant ID' },
  { id: 'ondc', name: 'ONDC', group: 'Online orders', desc: 'Orders from ONDC apps (Paytm, Magicpin…)', outletOnly: true, needsId: 'ONDC seller ID' },
  { id: 'pos', name: 'POS (Petpooja)', group: 'Billing', desc: 'Counter bills and item sales every 5 min', outletOnly: true, needsId: 'POS outlet code' },
  { id: 'forecast', name: 'AI demand forecast', group: 'AI', desc: "Suggests tomorrow's indent quantities" },
  { id: 'costwatch', name: 'AI food cost watch', group: 'AI', desc: 'Flags dishes whose cost jumps suddenly' },
  { id: 'askai', name: 'Ask Prisim (AI chat)', group: 'AI', desc: 'Ask about sales and costs in plain English' },
  { id: 'whatsapp', name: 'WhatsApp alerts', group: 'Alerts', desc: 'Low stock and approval alerts to the manager' },
]

export type BranchIntegration = { on: boolean; ref?: string; lastSync?: string; issue?: string }
// Nothing is connected yet: every branch starts with all integrations off.
export const BRANCH_INTEGRATIONS: Record<string, Partial<Record<IntegrationId, BranchIntegration>>> =
  Object.fromEntries(BRANCHES.map((b) => [b.id, {}]))

// Connections that apply to the whole business, not one branch.
export const COMPANY_INTEGRATIONS = [
  { id: 'tally', name: 'Tally Prime export', desc: 'Send vouchers and ledgers every night', on: false },
  { id: 'bank', name: 'Bank feed', desc: 'Match bank payments to bills', on: false },
  { id: 'ocr', name: 'Bill OCR engine', desc: 'Reads uploaded vendor bills', on: false },
]
