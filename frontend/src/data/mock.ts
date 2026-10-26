// Sample data for the frontend. Replace with API calls once the backend is ready.

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
  { id: 'R1', name: "Brahmins' Thatte Idli", gstin: '29AABCP1234F1Z5', branches: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'] },
]

export const BRANCHES = [
  { id: 'CK', name: 'Central Kitchen', city: 'Bengaluru', restaurant: 'R1', manager: 'Ravi Kumar', ocr: true, sales: 0, foodCost: 0, status: 'online' },
  { id: 'B1', name: 'Indiranagar', city: 'Bengaluru', restaurant: 'R1', manager: 'Anita Rao', ocr: true, sales: 645200, foodCost: 31.2, status: 'online' },
  { id: 'B2', name: 'Koramangala', city: 'Bengaluru', restaurant: 'R1', manager: 'Suresh M', ocr: true, sales: 778400, foodCost: 29.8, status: 'online' },
  { id: 'B3', name: 'Whitefield', city: 'Bengaluru', restaurant: 'R1', manager: 'Deepa N', ocr: false, sales: 498900, foodCost: 34.6, status: 'offline' },
  { id: 'B4', name: 'Jayanagar', city: 'Bengaluru', restaurant: 'R1', manager: 'Imran Sheikh', ocr: true, sales: 592300, foodCost: 30.4, status: 'online' },
  { id: 'B5', name: 'HSR Layout', city: 'Bengaluru', restaurant: 'R1', manager: 'Kavya P', ocr: true, sales: 451700, foodCost: 32.9, status: 'online' },
  { id: 'B6', name: 'Malleshwaram', city: 'Bengaluru', restaurant: 'R1', manager: 'Shruthi K', ocr: true, sales: 702600, foodCost: 30.1, status: 'online' },
  { id: 'B7', name: 'Basavanagudi', city: 'Bengaluru', restaurant: 'R1', manager: 'Prasanna R', ocr: true, sales: 556800, foodCost: 31.6, status: 'online' },
  { id: 'B8', name: 'Rajajinagar', city: 'Bengaluru', restaurant: 'R1', manager: 'Naveen S', ocr: true, sales: 418300, foodCost: 33.8, status: 'online' },
]

export const SALES_TREND = [
  { day: 'Mon', B1: 24100, B2: 29800, B3: 18200, B4: 22100, B5: 16400, B6: 26200, B7: 20400, B8: 15600 },
  { day: 'Tue', B1: 22800, B2: 28100, B3: 17900, B4: 21500, B5: 15800, B6: 25100, B7: 19800, B8: 15100 },
  { day: 'Wed', B1: 25600, B2: 31200, B3: 19400, B4: 23900, B5: 17600, B6: 27900, B7: 21600, B8: 16300 },
  { day: 'Thu', B1: 26300, B2: 32800, B3: 20100, B4: 24200, B5: 18900, B6: 28600, B7: 22100, B8: 16900 },
  { day: 'Fri', B1: 29900, B2: 36400, B3: 23600, B4: 27800, B5: 21200, B6: 32400, B7: 25300, B8: 19100 },
  { day: 'Sat', B1: 31400, B2: 39100, B3: 24800, B4: 29600, B5: 22300, B6: 34800, B7: 26900, B8: 20400 },
  { day: 'Sun', B1: 24400, B2: 23900, B3: 18800, B4: 19800, B5: 17400, B6: 27300, B7: 21000, B8: 16200 },
]

export type OcrStatus = 'queued' | 'processing' | 'extracted' | 'verified' | 'failed'
export type BillLine = { item: string; qty: number; unit: string; rate: number; gst: number }
export type Bill = {
  id: string; vendor: string; branch: string; uploadedBy: string; date: string
  status: OcrStatus; confidence: number; type: 'credit' | 'other'; lines: BillLine[]
}

export const BILLS: Bill[] = [
  { id: 'BL-1042', vendor: 'Fresh Farms Pvt Ltd', branch: 'CK', uploadedBy: 'Ravi Kumar', date: '2026-10-26', status: 'extracted', confidence: 94, type: 'credit',
    lines: [
      { item: 'Tomato', qty: 40, unit: 'kg', rate: 32, gst: 0 },
      { item: 'Onion', qty: 60, unit: 'kg', rate: 28, gst: 0 },
      { item: 'Coriander', qty: 5, unit: 'kg', rate: 80, gst: 0 },
    ] },
  { id: 'BL-1041', vendor: 'Metro Cash & Carry', branch: 'B2', uploadedBy: 'Suresh M', date: '2026-10-26', status: 'processing', confidence: 0, type: 'credit',
    lines: [] },
  { id: 'BL-1040', vendor: 'Amul Distributors', branch: 'CK', uploadedBy: 'Ravi Kumar', date: '2026-10-25', status: 'verified', confidence: 98, type: 'credit',
    lines: [
      { item: 'Paneer', qty: 25, unit: 'kg', rate: 340, gst: 5 },
      { item: 'Butter', qty: 10, unit: 'kg', rate: 520, gst: 12 },
      { item: 'Fresh Cream', qty: 12, unit: 'ltr', rate: 210, gst: 5 },
    ] },
  { id: 'BL-1039', vendor: 'City Gas Agency', branch: 'B1', uploadedBy: 'Anita Rao', date: '2026-10-25', status: 'verified', confidence: 96, type: 'other',
    lines: [{ item: 'LPG Cylinder 19kg', qty: 4, unit: 'nos', rate: 1780, gst: 18 }] },
  { id: 'BL-1038', vendor: 'Sri Balaji Meats', branch: 'CK', uploadedBy: 'Ravi Kumar', date: '2026-10-25', status: 'failed', confidence: 41, type: 'credit',
    lines: [] },
  { id: 'BL-1037', vendor: 'CleanPro Supplies', branch: 'B4', uploadedBy: 'Imran Sheikh', date: '2026-10-24', status: 'queued', confidence: 0, type: 'other',
    lines: [] },
]

export const RECIPES = [
  { dish: 'Paneer Butter Masala', category: 'Main Course', price: 320, cost: 96, sold: 412 },
  { dish: 'Chicken Biryani', category: 'Rice', price: 340, cost: 118, sold: 588 },
  { dish: 'Dal Makhani', category: 'Main Course', price: 260, cost: 58, sold: 356 },
  { dish: 'Veg Fried Rice', category: 'Rice', price: 220, cost: 54, sold: 241 },
  { dish: 'Butter Naan', category: 'Breads', price: 60, cost: 11, sold: 1320 },
  { dish: 'Mutton Rogan Josh', category: 'Main Course', price: 450, cost: 192, sold: 168 },
  { dish: 'Gulab Jamun', category: 'Dessert', price: 120, cost: 26, sold: 304 },
  { dish: 'Masala Chaas', category: 'Beverage', price: 80, cost: 14, sold: 466 },
]

export type IndentStatus = 'pending' | 'issued' | 'po_raised' | 'partial'
export const INDENTS = [
  { id: 'IND-311', branch: 'B1', date: '2026-10-26', requestedBy: 'Anita Rao', status: 'pending' as IndentStatus,
    items: [ { item: 'Paneer', qty: 8, unit: 'kg' }, { item: 'Basmati Rice', qty: 25, unit: 'kg' }, { item: 'Saffron', qty: 0.05, unit: 'kg' } ] },
  { id: 'IND-310', branch: 'B2', date: '2026-10-26', requestedBy: 'Suresh M', status: 'pending' as IndentStatus,
    items: [ { item: 'Chicken', qty: 30, unit: 'kg' }, { item: 'Onion', qty: 40, unit: 'kg' }, { item: 'Fresh Cream', qty: 6, unit: 'ltr' } ] },
  { id: 'IND-309', branch: 'B4', date: '2026-10-25', requestedBy: 'Imran Sheikh', status: 'po_raised' as IndentStatus,
    items: [ { item: 'Mutton', qty: 15, unit: 'kg' } ] },
  { id: 'IND-308', branch: 'B5', date: '2026-10-25', requestedBy: 'Kavya P', status: 'issued' as IndentStatus,
    items: [ { item: 'Tomato', qty: 20, unit: 'kg' }, { item: 'Butter', qty: 4, unit: 'kg' } ] },
  { id: 'IND-307', branch: 'B3', date: '2026-10-24', requestedBy: 'Deepa N', status: 'partial' as IndentStatus,
    items: [ { item: 'Basmati Rice', qty: 30, unit: 'kg' }, { item: 'Mutton', qty: 10, unit: 'kg' } ] },
]

export const STOCK = [
  { item: 'Tomato', category: 'Vegetables', unit: 'kg', qty: 72, reorder: 30, avgCost: 31 },
  { item: 'Onion', category: 'Vegetables', unit: 'kg', qty: 95, reorder: 40, avgCost: 27 },
  { item: 'Coriander', category: 'Vegetables', unit: 'kg', qty: 3, reorder: 4, avgCost: 78 },
  { item: 'Paneer', category: 'Dairy', unit: 'kg', qty: 22, reorder: 10, avgCost: 338 },
  { item: 'Butter', category: 'Dairy', unit: 'kg', qty: 9, reorder: 5, avgCost: 518 },
  { item: 'Fresh Cream', category: 'Dairy', unit: 'ltr', qty: 4, reorder: 8, avgCost: 208 },
  { item: 'Chicken', category: 'Meat', unit: 'kg', qty: 18, reorder: 25, avgCost: 210 },
  { item: 'Mutton', category: 'Meat', unit: 'kg', qty: 0, reorder: 8, avgCost: 720 },
  { item: 'Basmati Rice', category: 'Grains', unit: 'kg', qty: 140, reorder: 50, avgCost: 96 },
  { item: 'Saffron', category: 'Spices', unit: 'kg', qty: 0, reorder: 0.05, avgCost: 210000 },
]

export const VENDORS = [
  { id: 'V1', name: 'Fresh Farms Pvt Ltd', category: 'Vegetables', terms: '15 days credit', gstin: '29AAFCF2211Q1Z8' },
  { id: 'V2', name: 'Amul Distributors', category: 'Dairy', terms: '7 days credit', gstin: '29AABCA9988M1Z1' },
  { id: 'V3', name: 'Sri Balaji Meats', category: 'Meat', terms: 'Cash on delivery', gstin: '29BBPPS4455L1Z3' },
  { id: 'V4', name: 'Metro Cash & Carry', category: 'Grocery', terms: '30 days credit', gstin: '29AACCM1100H1Z9' },
  { id: 'V5', name: 'Kashmir Spice Co', category: 'Spices', terms: 'Advance', gstin: '01AAKCK7766P1Z4' },
]

export const PURCHASE_ORDERS = [
  { id: 'PO-2207', indent: 'IND-309', vendor: 'Sri Balaji Meats', date: '2026-10-25', status: 'sent', basket: 450,
    lines: [{ item: 'Mutton', qty: 15, unit: 'kg', rate: 720 }] },
  { id: 'PO-2206', indent: 'IND-307', vendor: 'Sri Balaji Meats', date: '2026-10-24', status: 'received', basket: 300,
    lines: [{ item: 'Mutton', qty: 10, unit: 'kg', rate: 715 }] },
  { id: 'PO-2205', indent: '—', vendor: 'Amul Distributors', date: '2026-10-24', status: 'billed', basket: 200,
    lines: [{ item: 'Paneer', qty: 25, unit: 'kg', rate: 340 }, { item: 'Butter', qty: 10, unit: 'kg', rate: 520 }] },
]

export const EMPLOYEES = [
  { id: 'E01', name: 'Ravi Kumar', role: 'kitchen' as RoleId, branch: 'CK', basic: 32000, hra: 12800, allow: 4000, email: 'ravi@prisim.in', active: true, lastLogin: '2026-10-26 09:12' },
  { id: 'E02', name: 'Anita Rao', role: 'manager' as RoleId, branch: 'B1', basic: 38000, hra: 15200, allow: 5000, email: 'anita@prisim.in', active: true, lastLogin: '2026-10-26 10:03' },
  { id: 'E03', name: 'Suresh M', role: 'manager' as RoleId, branch: 'B2', basic: 36000, hra: 14400, allow: 5000, email: 'suresh@prisim.in', active: true, lastLogin: '2026-10-26 08:47' },
  { id: 'E04', name: 'Meera Iyer', role: 'accountant' as RoleId, branch: 'HO', basic: 42000, hra: 16800, allow: 3000, email: 'meera@prisim.in', active: true, lastLogin: '2026-10-26 09:30' },
  { id: 'E05', name: 'Arjun Shetty', role: 'cashier' as RoleId, branch: 'B1', basic: 18000, hra: 7200, allow: 1500, email: 'arjun@prisim.in', active: true, lastLogin: '2026-10-26 11:15' },
  { id: 'E06', name: 'Fatima Khan', role: 'cashier' as RoleId, branch: 'B4', basic: 18000, hra: 7200, allow: 1500, email: 'fatima@prisim.in', active: false, lastLogin: '2026-10-12 19:40' },
  { id: 'E07', name: 'Vikram Desai', role: 'auditor' as RoleId, branch: 'HO', basic: 0, hra: 0, allow: 0, email: 'vikram@auditfirm.in', active: true, lastLogin: '2026-10-22 16:20' },
  { id: 'E08', name: 'Allen', role: 'admin' as RoleId, branch: 'HO', basic: 0, hra: 0, allow: 0, email: 'admin@prisim.in', active: true, lastLogin: '2026-10-26 11:42' },
]

export const EXPENSES = [
  { id: 'EX-581', date: '2026-10-26', branch: 'B1', category: 'Utilities', desc: 'Electricity bill – Oct', amount: 38400, status: 'pending' },
  { id: 'EX-580', date: '2026-10-25', branch: 'B2', category: 'Repairs', desc: 'Exhaust fan motor', amount: 6200, status: 'approved' },
  { id: 'EX-579', date: '2026-10-25', branch: 'CK', category: 'Fuel', desc: 'LPG cylinders ×4', amount: 8401, status: 'approved' },
  { id: 'EX-578', date: '2026-10-24', branch: 'B4', category: 'Housekeeping', desc: 'Cleaning supplies', amount: 3150, status: 'pending' },
  { id: 'EX-577', date: '2026-10-24', branch: 'B3', category: 'Marketing', desc: 'Zomato ads top-up', amount: 15000, status: 'rejected' },
]

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

export const ADVANCES: Record<string, number> = { E05: 2000, E03: 5000 }

export function computePay(e: (typeof EMPLOYEES)[number], r: DeductionRules, days = 26) {
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
export const BRANCH_COSTS: Record<string, BranchCosts> = {
  B1: { salaries: 150000, rent: 65000, utilities: 38400, gas: 24000, repairs: 4000, marketing: 8000, housekeeping: 6000, misc: 5000, depreciation: 15000 },
  B2: { salaries: 175000, rent: 85000, utilities: 42000, gas: 28000, repairs: 6200, marketing: 10000, housekeeping: 7000, misc: 6000, depreciation: 18000 },
  B3: { salaries: 120000, rent: 55000, utilities: 31000, gas: 20000, repairs: 3000, marketing: 15000, housekeeping: 5000, misc: 4000, depreciation: 12000 },
  B4: { salaries: 135000, rent: 60000, utilities: 34000, gas: 23000, repairs: 2500, marketing: 7000, housekeeping: 3150, misc: 4500, depreciation: 14000 },
  B5: { salaries: 105000, rent: 45000, utilities: 28000, gas: 18000, repairs: 2000, marketing: 6000, housekeeping: 4000, misc: 3500, depreciation: 10000 },
  B6: { salaries: 160000, rent: 75000, utilities: 39000, gas: 25000, repairs: 3500, marketing: 9000, housekeeping: 6000, misc: 5000, depreciation: 16000 },
  B7: { salaries: 140000, rent: 60000, utilities: 34000, gas: 22000, repairs: 3000, marketing: 7000, housekeeping: 5000, misc: 4500, depreciation: 14000 },
  B8: { salaries: 115000, rent: 50000, utilities: 29000, gas: 18500, repairs: 2500, marketing: 8000, housekeeping: 4000, misc: 4000, depreciation: 11000 },
}
// Central kitchen + head office costs, shared across outlets by their share of sales.
export const CENTRAL_COSTS = { salaries: 110600, rent: 60000, utilities: 30000 }
// Sales mix and aggregator fees.
export const AGGREGATOR_SHARE = 0.3      // 30% of sales come via Swiggy / Zomato
export const AGGREGATOR_COMMISSION = 0.23 // average fee on those orders
// Last month's sales and food cost % per outlet, for comparison.
export const LAST_MONTH: Record<string, { sales: number; foodCost: number }> = {
  B1: { sales: 612900, foodCost: 31.8 }, B2: { sales: 756100, foodCost: 30.1 }, B3: { sales: 521400, foodCost: 33.9 },
  B4: { sales: 548700, foodCost: 30.9 }, B5: { sales: 440200, foodCost: 33.4 },
  B6: { sales: 671200, foodCost: 30.4 }, B7: { sales: 538900, foodCost: 31.2 }, B8: { sales: 431700, foodCost: 33.1 },
}
// Earlier months (all outlets), for the trend chart.
export const PNL_HISTORY = [
  { month: 'May', revenue: 4212000, net: 186000 },
  { month: 'Jun', revenue: 4068000, net: 151000 },
  { month: 'Jul', revenue: 3771000, net: 97000 },
  { month: 'Aug', revenue: 4298000, net: 206000 },
]

// ---------- Report data ----------
// How dine-in / takeaway customers paid (share of those sales).
export const PAYMENT_SPLIT = [
  { mode: 'UPI', share: 0.46 },
  { mode: 'Card', share: 0.32 },
  { mode: 'Cash', share: 0.22 },
]

// This month's purchases per vendor.
export const VENDOR_SPEND = [
  { vendor: 'Amul Distributors', category: 'Dairy', bought: 443000, paid: 380000, terms: '7 days credit', dueBy: '2026-11-02' },
  { vendor: 'Fresh Farms Pvt Ltd', category: 'Vegetables', bought: 384000, paid: 288000, terms: '15 days credit', dueBy: '2026-11-10' },
  { vendor: 'Sri Balaji Meats', category: 'Meat', bought: 298000, paid: 298000, terms: 'Cash on delivery', dueBy: '' },
  { vendor: 'Metro Cash & Carry', category: 'Grocery', bought: 254000, paid: 102000, terms: '30 days credit', dueBy: '2026-11-25' },
  { vendor: 'Kashmir Spice Co', category: 'Spices', bought: 105000, paid: 105000, terms: 'Advance', dueBy: '' },
]

// Items whose buying price changed compared with last month.
export const PRICE_CHANGES = [
  { item: 'Tomato', unit: 'kg', before: 26, now: 32 },
  { item: 'Paneer', unit: 'kg', before: 320, now: 340 },
  { item: 'Mutton', unit: 'kg', before: 690, now: 720 },
  { item: 'Onion', unit: 'kg', before: 31, now: 28 },
  { item: 'Butter', unit: 'kg', before: 520, now: 520 },
]

// ---------- Branch details & integrations ----------
export const BRANCH_INFO: Record<string, { address: string; area: string; pincode: string; phone: string; hours: string }> = {
  CK: { address: '14, 2nd Cross, Peenya Industrial Area', area: 'Peenya', pincode: '560058', phone: '+91 98450 11001', hours: '4:00 AM – 10:00 PM' },
  B1: { address: '100 Feet Road, HAL 2nd Stage', area: 'Indiranagar', pincode: '560038', phone: '+91 98450 11002', hours: '6:30 AM – 10:30 PM' },
  B2: { address: '80 Feet Road, 4th Block', area: 'Koramangala', pincode: '560034', phone: '+91 98450 11003', hours: '6:30 AM – 11:00 PM' },
  B3: { address: 'ITPL Main Road, Hoodi', area: 'Whitefield', pincode: '560066', phone: '+91 98450 11004', hours: '7:00 AM – 10:00 PM' },
  B4: { address: '11th Main, 4th Block', area: 'Jayanagar', pincode: '560011', phone: '+91 98450 11005', hours: '6:00 AM – 10:00 PM' },
  B5: { address: '27th Main, Sector 1', area: 'HSR Layout', pincode: '560102', phone: '+91 98450 11006', hours: '6:30 AM – 10:30 PM' },
  B6: { address: '8th Cross, Sampige Road', area: 'Malleshwaram', pincode: '560003', phone: '+91 98450 11007', hours: '6:00 AM – 10:30 PM' },
  B7: { address: 'DVG Road, Gandhi Bazaar', area: 'Basavanagudi', pincode: '560004', phone: '+91 98450 11008', hours: '6:00 AM – 10:00 PM' },
  B8: { address: '17th Main, 3rd Block', area: 'Rajajinagar', pincode: '560010', phone: '+91 98450 11009', hours: '6:30 AM – 10:00 PM' },
}

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
export const BRANCH_INTEGRATIONS: Record<string, Partial<Record<IntegrationId, BranchIntegration>>> = {
  CK: { forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B1: { swiggy: { on: true, ref: 'SWG-482910', lastSync: '2 min ago' }, zomato: { on: true, ref: 'ZOM-19283', lastSync: '1 min ago' }, ondc: { on: false }, pos: { on: true, ref: 'PP-IND-01', lastSync: '3 min ago' }, forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B2: { swiggy: { on: true, ref: 'SWG-482911', lastSync: '1 min ago' }, zomato: { on: true, ref: 'ZOM-19284', lastSync: '2 min ago' }, ondc: { on: true, ref: 'ONDC-BTI-02', lastSync: '6 min ago' }, pos: { on: true, ref: 'PP-KOR-02', lastSync: '1 min ago' }, forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B3: { swiggy: { on: true, ref: 'SWG-482912', lastSync: '2 hours ago', issue: 'Outlet offline — orders paused' }, zomato: { on: true, ref: 'ZOM-19285', lastSync: '2 hours ago', issue: 'Outlet offline — orders paused' }, ondc: { on: false }, pos: { on: true, ref: 'PP-WHF-03', lastSync: '2 hours ago', issue: 'POS not reachable' }, forecast: { on: true }, costwatch: { on: false }, askai: { on: false }, whatsapp: { on: true } },
  B4: { swiggy: { on: true, ref: 'SWG-482913', lastSync: '4 min ago' }, zomato: { on: false, ref: 'ZOM-19286', issue: 'Menu pending approval on Zomato' }, ondc: { on: false }, pos: { on: true, ref: 'PP-JAY-04', lastSync: '2 min ago' }, forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: false } },
  B5: { swiggy: { on: true, ref: 'SWG-482914', lastSync: '3 min ago' }, zomato: { on: true, ref: 'ZOM-19287', lastSync: '5 min ago' }, ondc: { on: false }, pos: { on: true, ref: 'PP-HSR-05', lastSync: '2 min ago' }, forecast: { on: false }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B6: { swiggy: { on: true, ref: 'SWG-482915', lastSync: '1 min ago' }, zomato: { on: true, ref: 'ZOM-19288', lastSync: '2 min ago' }, ondc: { on: true, ref: 'ONDC-BTI-06', lastSync: '4 min ago' }, pos: { on: true, ref: 'PP-MAL-06', lastSync: '1 min ago' }, forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B7: { swiggy: { on: true, ref: 'SWG-482916', lastSync: '3 min ago' }, zomato: { on: true, ref: 'ZOM-19289', lastSync: '2 min ago' }, ondc: { on: false }, pos: { on: true, ref: 'PP-BSV-07', lastSync: '2 min ago' }, forecast: { on: true }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
  B8: { swiggy: { on: true, ref: 'SWG-482917', lastSync: '5 min ago' }, zomato: { on: false }, ondc: { on: false }, pos: { on: true, ref: 'PP-RJN-08', lastSync: '3 min ago' }, forecast: { on: false }, costwatch: { on: true }, askai: { on: false }, whatsapp: { on: true } },
}

// Connections that apply to the whole business, not one branch.
export const COMPANY_INTEGRATIONS = [
  { id: 'tally', name: 'Tally Prime export', desc: 'Send vouchers and ledgers every night', on: false },
  { id: 'bank', name: 'Bank feed (HDFC)', desc: 'Match bank payments to bills', on: false },
  { id: 'ocr', name: 'Bill OCR engine', desc: 'Prisim Vision v2 reads uploaded vendor bills', on: true },
]
