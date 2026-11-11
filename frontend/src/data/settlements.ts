import { cloudStore } from './cloudStore'
import { cashIn, type DayEntry } from './entries'
import type { ReceiptFile } from './ledgerStore'

// Money that comes in through payment partners, and the weekly statements they settle with.
//  - Mobikwik: UPI and card payments at the counter. The Imprest Book has one Mobikwik figure a day;
//    the UPI / card split is typed in here from the Mobikwik report.
//  - Weekly statements: Swiggy, Zomato, Rapido and Mobikwik pay out once a week after taking commission,
//    advertising and other charges. Net receipts = gross − deductions, and must match what reached the bank.

/* ---------- Mobikwik: UPI / card split per outlet and day ---------- */

export type PaySplit = { id: string; branch: string; date: string; upi: number; card: number; addedBy: string; addedAt: string }
const splits = cloudStore<PaySplit>('prisim.paySplits', { kind: 'paySplits', idOf: (s) => s.id })
export const usePaySplits = splits.use
export const splitId = (branch: string, date: string) => `${branch}:${date}`
export function saveSplit(s: Omit<PaySplit, 'id'>) {
  const id = splitId(s.branch, s.date)
  return splits.set([{ ...s, id }, ...splits.get().filter((x) => x.id !== id)])
}

export type PayDay = { date: string; branch: string; cash: number; mobikwik: number; upi: number | null; card: number | null; total: number; split: PaySplit | null }

/** How each day's money came in at the counter: cash, UPI, card. */
export function payDays(entries: DayEntry[], all: PaySplit[]): PayDay[] {
  const byId = new Map(all.map((s) => [s.id, s]))
  return entries.map((e) => {
    const s = byId.get(splitId(e.branch, e.date)) ?? null
    const cash = r2(cashIn(e))
    return { date: e.date, branch: e.branch, cash, mobikwik: e.mobikwik, upi: s ? s.upi : null, card: s ? s.card : null, total: r2(cash + e.mobikwik), split: s }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.branch.localeCompare(b.branch))
}

/* ---------- Weekly statements ---------- */

export const PARTNERS = [
  { id: 'swiggy', name: 'Swiggy', field: 'swiggy' },
  { id: 'zomato', name: 'Zomato', field: 'zomato' },
  { id: 'rapido', name: 'Rapido', field: 'rapido' },
  { id: 'mobikwik', name: 'Mobikwik', field: 'mobikwik' },
] as const
export type PartnerId = (typeof PARTNERS)[number]['id']
export const partnerName = (id: string) => PARTNERS.find((p) => p.id === id)?.name ?? id

export const DEDUCTION_KINDS = {
  commission: 'Commission',
  ads: 'Advertisement',
  gateway: 'Payment gateway / MDR',
  gst: 'GST on charges',
  tds: 'TDS / TCS',
  other: 'Other charges',
} as const
export type DeductionKind = keyof typeof DEDUCTION_KINDS
export type Deduction = { id: string; kind: DeductionKind; label: string; amount: number; approvedBy?: string; approvedAt?: string }

export type Settlement = {
  id: string // partner:branch:weekStart
  partner: PartnerId
  branch: string
  date: string // week start (Monday)
  weekEnd: string // Sunday
  gross: number | null // gross sales as per the partner's statement
  deductions: Deduction[]
  received: number | null // what actually reached the bank
  receivedOn?: string
  utr?: string // bank reference
  note: string
  statementNet?: number | null // net payout as printed on the statement (to cross-check our working)
  file?: ReceiptFile // the uploaded statement
  readNote?: string // what the reader found
  addedBy: string
  addedAt: string
  updatedBy?: string
  updatedAt?: string
}

const settlements = cloudStore<Settlement>('prisim.settlements', { kind: 'settlements', idOf: (s) => s.id })
export const useSettlements = settlements.use
export const settlementId = (partner: string, branch: string, week: string) => `${partner}:${branch}:${week}`
export function saveSettlement(s: Settlement) {
  return settlements.set([s, ...settlements.get().filter((x) => x.id !== s.id)])
}
export function deleteSettlement(id: string) { settlements.set(settlements.get().filter((x) => x.id !== id)) }

/* ---------- Weeks (Monday to Sunday, like the partners' payout weeks) ---------- */

const iso = (d: Date) => d.toLocaleDateString('en-CA')
export function weekStart(date: string) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}
export const addDays = (date: string, n: number) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d) }
export const weekEndOf = (start: string) => addDays(start, 6)

/* ---------- The checks ---------- */

const r2 = (n: number) => Math.round(n * 100) / 100
/** Differences up to a rupee are rounding. */
export const TOLERANCE = 1

export type StatementRow = {
  id: string; partner: PartnerId; branch: string; week: string
  books: number // sales through this partner as per the Imprest Books
  s: Settlement | null
  gross: number | null; commission: number; ads: number; charges: number; deductions: number
  net: number | null // net receipts = gross − all deductions
  received: number | null
  salesDiff: number | null // statement gross − books
  payoutDiff: number | null // our net receipts − the statement's own net payout
  receiptDiff: number | null // received − net receipts
  pending: number // deductions not yet approved
  status: 'no statement' | 'waiting approval' | 'not received' | 'difference' | 'matched'
}

export function statementRow(partner: PartnerId, branch: string, week: string, entries: DayEntry[], s: Settlement | null): StatementRow {
  const field = PARTNERS.find((p) => p.id === partner)!.field
  const end = weekEndOf(week)
  const books = r2(entries.filter((e) => e.branch === branch && e.date >= week && e.date <= end).reduce((t, e) => t + e[field], 0))
  const ded = s?.deductions ?? []
  const sum = (f: (d: Deduction) => boolean) => r2(ded.filter(f).reduce((t, d) => t + d.amount, 0))
  const commission = sum((d) => d.kind === 'commission')
  const ads = sum((d) => d.kind === 'ads')
  const charges = sum((d) => d.kind !== 'commission' && d.kind !== 'ads')
  const deductions = r2(commission + ads + charges)
  const gross = s?.gross ?? null
  const net = gross == null ? null : r2(gross - deductions)
  const received = s?.received ?? null
  const salesDiff = gross == null ? null : r2(gross - books)
  const payoutDiff = net == null || s?.statementNet == null ? null : r2(net - s.statementNet)
  const receiptDiff = net == null || received == null ? null : r2(received - net)
  const pending = ded.filter((d) => d.amount && !d.approvedBy).length
  const status: StatementRow['status'] = !s || gross == null ? 'no statement'
    : pending ? 'waiting approval'
    : received == null ? 'not received'
    : Math.abs(receiptDiff ?? 0) > TOLERANCE || Math.abs(salesDiff ?? 0) > TOLERANCE || Math.abs(payoutDiff ?? 0) > TOLERANCE ? 'difference'
    : 'matched'
  return { id: settlementId(partner, branch, week), partner, branch, week, books, s, gross, commission, ads, charges, deductions, net, received, salesDiff, payoutDiff, receiptDiff, pending, status }
}

/** Every partner × outlet that sold something that week or has a statement for it. */
export function weekRows(week: string, entries: DayEntry[], all: Settlement[], branch = '', partner = ''): StatementRow[] {
  const end = weekEndOf(week)
  const keys = new Set<string>()
  for (const e of entries) {
    if (e.date < week || e.date > end || (branch && e.branch !== branch)) continue
    for (const p of PARTNERS) if ((!partner || p.id === partner) && e[p.field] > 0) keys.add(p.id + '|' + e.branch)
  }
  for (const s of all) if (s.date === week && (!branch || s.branch === branch) && (!partner || s.partner === partner)) keys.add(s.partner + '|' + s.branch)
  const byId = new Map(all.map((s) => [s.id, s]))
  return [...keys].map((k) => {
    const [p, b] = k.split('|') as [PartnerId, string]
    return statementRow(p, b, week, entries, byId.get(settlementId(p, b, week)) ?? null)
  }).sort((a, b) => a.partner.localeCompare(b.partner) || a.branch.localeCompare(b.branch))
}
