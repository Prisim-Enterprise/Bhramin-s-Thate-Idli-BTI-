import { branchName } from './mock'
import { cashIn, type DayEntry, type PayoutType } from './entries'
import { groupOf, ledgerKey, sides, type CustomLedger, type ManualVoucher, type ReceiptFile } from './ledgerStore'

// Tally-style account books built from day entries.
// Each day entry becomes vouchers, exactly as the accountant posts them in Tally:
//  - one sales Journal: apps/UPI and cash on the debit side, sales, GST, container charges on the credit side
//  - one Journal per amount paid out: the expense/purchase/salary ledger debited, the branch imprest credited

export const VCH_TYPES = ['Contra', 'Payment', 'Receipt', 'Sales', 'Purchase', 'Journal', 'Debit Note', 'Credit Note'] as const
export type VchType = (typeof VCH_TYPES)[number]

// Tally's 28 predefined groups (15 primary + 13 sub-groups), in the order Tally lists them.
export const GROUPS = {
  capital: 'Capital Account',
  reserves: 'Reserves & Surplus',
  loans: 'Loans (Liability)',
  bankOD: 'Bank OD A/c',
  securedLoans: 'Secured Loans',
  unsecuredLoans: 'Unsecured Loans',
  liabilities: 'Current Liabilities',
  duties: 'Duties & Taxes',
  provisions: 'Provisions',
  creditors: 'Sundry Creditors',
  fixedAssets: 'Fixed Assets',
  investments: 'Investments',
  currentAssets: 'Current Assets',
  bank: 'Bank Accounts',
  cash: 'Cash-in-Hand',
  deposits: 'Deposits (Asset)',
  loansAdvances: 'Loans & Advances (Asset)',
  stockInHand: 'Stock-in-Hand',
  debtors: 'Sundry Debtors',
  branchDiv: 'Branch / Divisions',
  miscExp: 'Misc. Expenses (ASSET)',
  suspense: 'Suspense A/c',
  sales: 'Sales Accounts',
  purchase: 'Purchase Accounts',
  directInc: 'Direct Incomes',
  directExp: 'Direct Expenses',
  indirectInc: 'Indirect Incomes',
  indirectExp: 'Indirect Expenses',
} as const
export type GroupId = keyof typeof GROUPS
export type Nature = 'Assets' | 'Liabilities' | 'Income' | 'Expenses'

/** Where each group sits, as in Tally: its parent group (none = primary) and its nature. */
export const GROUP_INFO: Record<GroupId, { parent: GroupId | null; nature: Nature }> = {
  capital: { parent: null, nature: 'Liabilities' },
  reserves: { parent: 'capital', nature: 'Liabilities' },
  loans: { parent: null, nature: 'Liabilities' },
  bankOD: { parent: 'loans', nature: 'Liabilities' },
  securedLoans: { parent: 'loans', nature: 'Liabilities' },
  unsecuredLoans: { parent: 'loans', nature: 'Liabilities' },
  liabilities: { parent: null, nature: 'Liabilities' },
  duties: { parent: 'liabilities', nature: 'Liabilities' },
  provisions: { parent: 'liabilities', nature: 'Liabilities' },
  creditors: { parent: 'liabilities', nature: 'Liabilities' },
  fixedAssets: { parent: null, nature: 'Assets' },
  investments: { parent: null, nature: 'Assets' },
  currentAssets: { parent: null, nature: 'Assets' },
  bank: { parent: 'currentAssets', nature: 'Assets' },
  cash: { parent: 'currentAssets', nature: 'Assets' },
  deposits: { parent: 'currentAssets', nature: 'Assets' },
  loansAdvances: { parent: 'currentAssets', nature: 'Assets' },
  stockInHand: { parent: 'currentAssets', nature: 'Assets' },
  debtors: { parent: 'currentAssets', nature: 'Assets' },
  branchDiv: { parent: null, nature: 'Liabilities' },
  miscExp: { parent: null, nature: 'Assets' },
  suspense: { parent: null, nature: 'Liabilities' },
  sales: { parent: null, nature: 'Income' },
  purchase: { parent: null, nature: 'Expenses' },
  directInc: { parent: null, nature: 'Income' },
  directExp: { parent: null, nature: 'Expenses' },
  indirectInc: { parent: null, nature: 'Income' },
  indirectExp: { parent: null, nature: 'Expenses' },
}
/** Groups that go to Profit & Loss (the rest go to the Balance Sheet). */
export const isPnlGroup = (g: GroupId) => GROUP_INFO[g].nature === 'Income' || GROUP_INFO[g].nature === 'Expenses'

export type Posting = { ledger: string; group: GroupId; dr: number; cr: number }
export type Voucher = {
  id: string
  no: number // running number across all vouchers
  typeNo: number // Tally's voucher number: counted separately for each voucher type
  cancelled?: boolean // kept in the registers with its number, but posts nothing
  party?: string // party ledger of an invoice-style voucher
  refNo?: string // supplier invoice / reference number
  date: string
  branch: string
  type: VchType
  postings: Posting[]
  entryId?: string // from a day entry
  manualId?: string // posted from an uploaded receipt or bill
  billId?: string // posted from the OCR Bill Inbox
  narration?: string
  receipt?: ReceiptFile
  addedBy?: string
  addedAt?: string
}

const PAYOUT_GROUP: Record<PayoutType, GroupId> = { expense: 'indirectExp', purchase: 'purchase', salary: 'liabilities' }

export const BANK_LEDGER = 'Bank Account'
export const imprestLedger = (branch: string) => `${branchName(branch)} - Imprest`

function dr(ledger: string, group: GroupId, amount: number): Posting { return { ledger, group, dr: amount, cr: 0 } }
function cr(ledger: string, group: GroupId, amount: number): Posting { return { ledger, group, dr: 0, cr: amount } }

/** All vouchers from day entries and receipt payments, oldest first, numbered in order. */
export function buildVouchers(entries: DayEntry[], manual: ManualVoucher[] = [], custom: CustomLedger[] = []): Voucher[] {
  const out: Omit<Voucher, 'no' | 'typeNo'>[] = []
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.addedAt ?? '').localeCompare(b.addedAt ?? ''))

  for (const e of sorted) {
    const b = branchName(e.branch)
    const imp = imprestLedger(e.branch)
    const cash = cashIn(e)

    const sales: Posting[] = [
      dr(`Mobikwik - ${b}`, 'debtors', e.mobikwik),
      dr('Rapido', 'debtors', e.rapido),
      dr(`Swiggy - ${b}`, 'debtors', e.swiggy),
      dr(`Zomato - ${b}`, 'debtors', e.zomato),
      dr('Discount (Settlement)', 'indirectExp', e.discount),
      cash >= 0 ? dr(imp, 'cash', cash) : cr(imp, 'cash', -cash),
      cr(`Sales - ${b}`, 'sales', e.sales),
      cr('Output GST @ 5%', 'duties', Math.round((e.cgst + e.sgst) * 100) / 100), // CGST + SGST shown as one GST
      cr('Container Charges', 'indirectInc', e.container),
      e.roundOff >= 0 ? cr('Round Off', 'indirectInc', e.roundOff) : dr('Round Off', 'indirectInc', -e.roundOff),
    ].filter((p) => p.dr || p.cr)
    if (sales.length) out.push({ id: e.id + ':s', date: e.date, branch: e.branch, type: 'Journal', postings: sales, entryId: e.id, addedBy: e.addedBy, addedAt: e.addedAt })

    e.payouts.forEach((p, i) => {
      if (!p.amount) return
      out.push({
        id: `${e.id}:p${i}`, date: e.date, branch: e.branch, type: 'Journal', entryId: e.id, addedBy: e.addedBy, addedAt: e.addedAt,
        postings: [dr(p.ledger, PAYOUT_GROUP[p.type], p.amount), cr(imp, 'cash', p.amount)],
      })
    })
  }
  for (const m of manual) {
    const s = sides(m, imprestLedger)
    out.push({
      id: 'm:' + m.id, manualId: m.id, billId: m.billId, date: m.date, branch: m.branch, type: m.type, narration: m.narration, receipt: m.receipt,
      addedBy: m.addedBy, addedAt: m.addedAt, cancelled: m.cancelled || undefined, party: m.inv?.party ?? (m.billId ? m.crLedger : undefined), refNo: m.refNo,
      // A cancelled voucher keeps its number in the registers but posts nothing, as in Tally.
      postings: m.cancelled ? [] : m.lines?.length
        ? m.lines.filter((l) => l.dr || l.cr).map((l) => ({ ledger: l.ledger, group: groupOf(l.ledger, custom), dr: l.dr, cr: l.cr }))
        : [dr(s.dr, groupOf(s.dr, custom), m.amount), cr(s.cr, groupOf(s.cr, custom), m.amount)],
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || (a.addedAt ?? '').localeCompare(b.addedAt ?? ''))
  // Tally numbers each voucher type on its own (Payment 1, 2, 3 …; Sales 1, 2 …), in date order.
  const perType = new Map<string, number>()
  const typeNos = out.map((v) => { const n = (perType.get(v.type) ?? 0) + 1; perType.set(v.type, n); return n })
  // One spelling per ledger, so a bill or day posted later under "Sri Hanuman Traders" lands in "SRI HANUMAN TRADERS".
  // A ledger created by hand keeps its own spelling; otherwise the first one used wins.
  const name = new Map<string, string>()
  for (const c of custom) name.set(ledgerKey(c.name), c.name)
  for (const v of out) for (const p of v.postings) if (!name.has(ledgerKey(p.ledger))) name.set(ledgerKey(p.ledger), p.ledger)
  const same = (l: string) => name.get(ledgerKey(l)) ?? l
  return out.map((v, i) => ({ ...v, no: i + 1, typeNo: typeNos[i], postings: v.postings.map((p) => ({ ...p, ledger: same(p.ledger) })) }))
}

/** The main line of a voucher, as Tally shows it in registers. */
export function particulars(v: Voucher): string {
  if (v.postings.some((p) => p.group === 'sales')) return '(as per details)'
  return v.postings.find((p) => p.dr)?.ledger ?? v.postings[0]?.ledger ?? ''
}

export const voucherAmount = (v: Voucher) => v.postings.reduce((s, p) => s + p.dr, 0)

/** Every ledger with its group and Dr/Cr totals. */
export function ledgerTotals(vouchers: Voucher[]) {
  const map = new Map<string, { ledger: string; group: GroupId; dr: number; cr: number }>()
  for (const v of vouchers) for (const p of v.postings) {
    const t = map.get(p.ledger) ?? { ledger: p.ledger, group: p.group, dr: 0, cr: 0 }
    t.dr += p.dr
    t.cr += p.cr
    map.set(p.ledger, t)
  }
  return [...map.values()].sort((a, b) => a.ledger.localeCompare(b.ledger))
}

/** "1,234.00 Dr" style closing balance. */
export function drCr(n: number) {
  const v = Math.abs(Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n === 0 ? '0.00' : `${v} ${n > 0 ? 'Dr' : 'Cr'}`
}

export const amt = (n: number) => (n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
