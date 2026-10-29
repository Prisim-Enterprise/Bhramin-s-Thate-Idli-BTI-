import { branchName } from './mock'
import { cashIn, type DayEntry, type PayoutType } from './entries'
import { groupOf, sides, type CustomLedger, type ManualVoucher, type ReceiptFile } from './ledgerStore'

// Tally-style account books built from day entries.
// Each day entry becomes vouchers, exactly as the accountant posts them in Tally:
//  - one sales Journal: apps/UPI and cash on the debit side, sales, GST, container charges on the credit side
//  - one Journal per amount paid out: the expense/purchase/salary ledger debited, the branch imprest credited

export const VCH_TYPES = ['Contra', 'Payment', 'Receipt', 'Sales', 'Purchase', 'Journal', 'Debit Note', 'Credit Note'] as const
export type VchType = (typeof VCH_TYPES)[number]

export const GROUPS = {
  cash: 'Cash-in-Hand',
  bank: 'Bank Accounts',
  debtors: 'Sundry Debtors',
  creditors: 'Sundry Creditors',
  sales: 'Sales Accounts',
  duties: 'Duties & Taxes',
  indirectInc: 'Indirect Incomes',
  directExp: 'Direct Expenses',
  indirectExp: 'Indirect Expenses',
  purchase: 'Purchase Accounts',
  liabilities: 'Current Liabilities',
} as const
export type GroupId = keyof typeof GROUPS

export type Posting = { ledger: string; group: GroupId; dr: number; cr: number }
export type Voucher = {
  id: string
  no: number
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
  const out: Omit<Voucher, 'no'>[] = []
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
      cr('Output CGST @ 2.5%', 'duties', e.cgst),
      cr('Output SGST @ 2.5%', 'duties', e.sgst),
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
      addedBy: m.addedBy, addedAt: m.addedAt,
      postings: m.lines?.length
        ? m.lines.filter((l) => l.dr || l.cr).map((l) => ({ ledger: l.ledger, group: groupOf(l.ledger, custom), dr: l.dr, cr: l.cr }))
        : [dr(s.dr, groupOf(s.dr, custom), m.amount), cr(s.cr, groupOf(s.cr, custom), m.amount)],
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || (a.addedAt ?? '').localeCompare(b.addedAt ?? ''))
  return out.map((v, i) => ({ ...v, no: i + 1 }))
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
