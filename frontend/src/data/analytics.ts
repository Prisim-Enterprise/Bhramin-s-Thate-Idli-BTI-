import { useMemo, useState } from 'react'
import { BRANCHES, type Bill } from './mock'
import { cashIn, inMonth, useEntries, type DayEntry, type PayoutType } from './entries'
import { groupOf, ledgerKey, reportOf, sides, useCustomLedgers, useManualVouchers, type CustomLedger, type ManualVoucher } from './ledgerStore'
import { imprestLedger } from './books'
import { billSums, lineBase, useBills } from './billStore'

// Every report works its numbers out here, from what has actually been saved:
//  - day entries (typed in, or read from Imprest Book PDFs)
//  - bills posted from the OCR Bill Inbox, and other vouchers in Account Books
// Nothing is typed into a report by hand, so the reports always agree with Account Books.

export const FOOD_COST_TARGET = 32 // ingredients should cost ₹32 or less of every ₹100 of food sold

export type MoneyLine = {
  key: string
  date: string
  branch: string
  ledger: string
  amount: number
  type: PayoutType
  from: 'Day entry' | 'Bill' | 'Voucher'
  vendor?: string
  billId?: string
}

export type Data = { entries: DayEntry[]; manual: ManualVoucher[]; custom: CustomLedger[]; bills: Bill[] }
export type Scope = { month?: string; branch?: string } // month = yyyy-mm; branch id. Empty = all.

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0))
const byKey = <T,>(xs: T[], key: (x: T) => string, val: (x: T) => number) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), r2((m.get(key(x)) ?? 0) + val(x)))
  return [...m].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)
}

/** One spelling per ledger (as in Account Books): a ledger created by hand keeps its name, otherwise the first one used. */
function spelling(d: Data) {
  const name = new Map<string, string>()
  const see = (n: string) => { if (n && !name.has(ledgerKey(n))) name.set(ledgerKey(n), n) }
  d.custom.forEach((c) => see(c.name))
  d.manual.forEach((m) => (m.lines ?? []).forEach((l) => see(l.ledger)))
  d.manual.forEach((m) => { const x = sides(m, imprestLedger); see(x.dr); see(x.cr) })
  d.entries.forEach((e) => e.payouts.forEach((p) => see(p.ledger)))
  return (n: string) => name.get(ledgerKey(n)) ?? n
}

/** Freight, hamali and other transport inward are part of what ingredients cost (as in the MIS format). */
export const isTransportInward = (ledger: string) => /freight|hamali|transport inward|cartage|loading|unloading/i.test(ledger)
const asPurchase = <T extends string>(ledger: string, type: T): T | 'purchase' => (type === 'expense' && isTransportInward(ledger) ? 'purchase' : type)

/** Every Dr / Cr line of a voucher, whether it has two ledgers or many. */
export const allLines = (m: ManualVoucher) => {
  const x = sides(m, imprestLedger)
  return m.lines?.length ? m.lines : [{ ledger: x.dr, dr: m.amount, cr: 0 }, { ledger: x.cr, dr: 0, cr: m.amount }]
}

/** Expense, purchase and salary lines from day entries and Account Books. */
export function moneyLines(d: Data, s: Scope = {}): MoneyLine[] {
  const same = spelling(d)
  const okBranch = (b: string) => !s.branch || b === s.branch
  const entries = inMonth(d.entries, s.month).filter((e) => okBranch(e.branch))
  const manual = d.manual.filter((m) => (!s.month || m.date.startsWith(s.month)) && okBranch(m.branch))
  const billOf = new Map(d.bills.map((b) => [b.id, b]))
  return [
    ...entries.flatMap((e) => e.payouts.filter((p) => p.amount).map((p, i) => ({
      key: `${e.id}:${i}`, date: e.date, branch: e.branch, ledger: same(p.ledger), amount: p.amount, type: asPurchase(p.ledger, p.type), from: 'Day entry' as const,
    }))),
    ...manual.flatMap((m) => allLines(m).flatMap((l, i) => {
      const kind = reportOf(groupOf(l.ledger, d.custom))
      const type = kind && asPurchase(l.ledger, kind)
      // A credit to a purchase or expense ledger (a Debit Note, a refund) takes the cost back down.
      // Salary stays debit-only: crediting Salary Payable is the provision, not a refund.
      const amount = type === 'salary' ? l.dr : r2(l.dr - l.cr)
      if (!type || !amount) return []
      const bill = m.billId ? billOf.get(m.billId) : undefined
      return [{
        key: `${m.id}:${i}`, date: m.date, branch: m.branch, ledger: same(l.ledger), amount, type,
        from: m.billId ? ('Bill' as const) : ('Voucher' as const),
        vendor: bill?.vendor || m.inv?.party || (m.type === 'Purchase' ? sides(m, imprestLedger).cr : undefined), billId: m.billId,
      }]
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

/** Sales side of the day entries. */
function salesOf(entries: DayEntry[]) {
  return {
    days: entries.length,
    food: sum(entries, (e) => e.sales), // excludes GST
    gst: sum(entries, (e) => e.cgst + e.sgst),
    container: sum(entries, (e) => e.container),
    roundOff: sum(entries, (e) => e.roundOff),
    discount: sum(entries, (e) => e.discount),
    swiggy: sum(entries, (e) => e.swiggy),
    zomato: sum(entries, (e) => e.zomato),
    mobikwik: sum(entries, (e) => e.mobikwik),
    rapido: sum(entries, (e) => e.rapido),
    cash: sum(entries, cashIn),
  }
}

/**
 * Income booked in Account Books by voucher rather than through the Imprest Book. Credit adds, debit takes away.
 *  - kind 'sales': Sales vouchers and Credit Notes (Sales Accounts, Direct Incomes)
 *  - kind 'other': round off on bills, interest, scrap sales … (Indirect Incomes)
 */
export function voucherIncome(d: Data, s: Scope, kind: 'sales' | 'other' | 'all' = 'other') {
  const same = spelling(d)
  const want = (g: string) => (kind !== 'other' && (g === 'sales' || g === 'directInc')) || (kind !== 'sales' && g === 'indirectInc')
  const out: { ledger: string; v: number }[] = []
  for (const m of d.manual) {
    if (m.cancelled || (s.month && !m.date.startsWith(s.month)) || (s.branch && m.branch !== s.branch)) continue
    for (const l of allLines(m)) {
      if (want(groupOf(l.ledger, d.custom)) && (l.cr || l.dr)) out.push({ ledger: same(l.ledger), v: r2(l.cr - l.dr) })
    }
  }
  return out
}

/** Profit & loss for a month and branch (or everything). */
export function profitLoss(d: Data, s: Scope = {}) {
  const entries = inMonth(d.entries, s.month).filter((e) => !s.branch || e.branch === s.branch)
  const lines = moneyLines(d, s)
  const sales = salesOf(entries)
  // Sales vouchers (and Credit Notes) entered in the Gateway count as sales, beside the Imprest Book.
  const salesVch = voucherIncome(d, s, 'sales')
  const voucherSales = sum(salesVch, (l) => l.v)
  const income = r2(sales.food + sales.container + sales.roundOff - sales.discount + voucherSales)
  const purchases = lines.filter((l) => l.type === 'purchase')
  const expenses = lines.filter((l) => l.type === 'expense')
  const salaries = lines.filter((l) => l.type === 'salary')
  const food = sum(purchases, (l) => l.amount)
  const gross = r2(income - food)
  const running = sum(expenses, (l) => l.amount)
  const staff = sum(salaries, (l) => l.amount)
  const other = voucherIncome(d, s)
  const otherIncome = sum(other, (l) => l.v)
  const net = r2(gross - running - staff + otherIncome)
  return {
    sales, income, food, gross, running, staff, net, otherIncome, voucherSales,
    voucherSalesByLedger: byKey(salesVch, (l) => l.ledger, (l) => l.v).filter((x) => Math.abs(x.v) >= 0.005),
    otherIncomeByLedger: byKey(other, (l) => l.ledger, (l) => l.v).filter((x) => Math.abs(x.v) >= 0.005),
    foodPct: sales.food ? (food / sales.food) * 100 : null,
    purchasesByLedger: byKey(purchases, (l) => l.ledger, (l) => l.amount),
    expensesByLedger: byKey(expenses, (l) => l.ledger, (l) => l.amount),
    salariesByLedger: byKey(salaries, (l) => l.ledger, (l) => l.amount),
    lines,
  }
}
export type PnL = ReturnType<typeof profitLoss>

/** The same P&L for each branch that has any figures. */
export function byBranch(d: Data, s: Scope = {}) {
  return BRANCHES.map((b) => ({ b, p: profitLoss(d, { ...s, branch: b.id }) }))
    .filter(({ p }) => p.sales.days || p.lines.length)
}

/** Daily totals, for the trend charts. */
export function daily(d: Data, s: Scope = {}) {
  const entries = inMonth(d.entries, s.month).filter((e) => !s.branch || e.branch === s.branch)
  const lines = moneyLines(d, s)
  const days = [...new Set([...entries.map((e) => e.date), ...lines.map((l) => l.date)])].sort()
  return days.map((day) => {
    const food = sum(entries.filter((e) => e.date === day), (e) => e.sales)
    const bought = sum(lines.filter((l) => l.date === day && l.type === 'purchase'), (l) => l.amount)
    const spent = sum(lines.filter((l) => l.date === day && l.type !== 'purchase'), (l) => l.amount)
    return { day, label: new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), food, bought, spent }
  })
}

/* ---------- Purchases: vendors, what we owe, items and prices ---------- */

export function purchases(d: Data, s: Scope = {}) {
  const lines = moneyLines(d, s).filter((l) => l.type === 'purchase')
  const inScope = (b: Bill) => (!s.month || b.date.startsWith(s.month)) && (!s.branch || b.branch === s.branch)
  // A bill counts as posted only while its voucher is still in Account Books.
  const vouchers = new Set(d.manual.map((m) => m.id))
  const isPosted = (b: Bill) => !!b.voucherId && vouchers.has(b.voucherId)
  const posted = d.bills.filter((b) => isPosted(b) && inScope(b))
  const waiting = d.bills.filter((b) => !isPosted(b) && inScope(b))

  // What we owe each vendor: credit bills (vendor credited) less payments to them (vendor debited), all time.
  const same = spelling(d)
  const owed = new Map<string, number>()
  for (const m of d.manual) {
    const ls = m.lines?.length ? m.lines : [{ ledger: sides(m, imprestLedger).dr, dr: m.amount, cr: 0 }, { ledger: sides(m, imprestLedger).cr, dr: 0, cr: m.amount }]
    for (const l of ls) if (groupOf(l.ledger, d.custom) === 'creditors') { const v = same(l.ledger); owed.set(v, r2((owed.get(v) ?? 0) + l.cr - l.dr)) }
  }

  // Spend per vendor in scope (from posted bills; cash purchases in day entries have no vendor).
  const vendorOf = (b: Bill) => (b.vendor.trim() ? same(b.vendor.trim()) : 'Unknown vendor')
  const vendors = byKey(posted, vendorOf, (b) => sum(b.lines, lineBase))
    .map(({ k, v }) => ({
      vendor: k, bought: v, bills: posted.filter((b) => vendorOf(b) === k).length,
      credit: posted.some((b) => vendorOf(b) === k && b.type === 'credit'), owed: owed.get(k) ?? 0,
    }))

  // Item prices across all posted bills, to spot rises.
  type Seen = { date: string; rate: number; unit: string; vendor: string }
  const seen = new Map<string, { name: string; list: Seen[] }>()
  for (const b of d.bills.filter(isPosted)) for (const l of b.lines) {
    if (!l.rate || !l.item.trim()) continue
    const k = l.item.trim().toLowerCase().replace(/\s+/g, ' ') + '|' + (l.unit || '').toLowerCase()
    const e = seen.get(k) ?? { name: l.item.trim(), list: [] }
    e.list.push({ date: b.date, rate: l.rate, unit: l.unit, vendor: b.vendor })
    seen.set(k, e)
  }
  const prices = [...seen.values()]
    .map(({ name, list }) => {
      const sorted = list.sort((a, b) => a.date.localeCompare(b.date))
      const now = sorted[sorted.length - 1]
      const before = [...sorted].reverse().find((x) => x.date < now.date)
      return before ? { item: name, unit: now.unit, before: before.rate, now: now.rate, pct: ((now.rate - before.rate) / before.rate) * 100, since: before.date, vendor: now.vendor } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.pct - a.pct)

  // Items we spent the most on.
  const items = byKey(posted.flatMap((b) => b.lines.map((l) => ({ l, b }))), ({ l }) => l.item.trim() || 'Item', ({ l }) => lineBase(l)).slice(0, 12)

  return {
    total: sum(lines, (l) => l.amount),
    fromBills: sum(lines.filter((l) => l.from === 'Bill'), (l) => l.amount),
    fromEntries: sum(lines.filter((l) => l.from === 'Day entry'), (l) => l.amount),
    byLedger: byKey(lines, (l) => l.ledger, (l) => l.amount),
    byBranch: byKey(lines, (l) => l.branch, (l) => l.amount),
    vendors,
    owedTotal: r2([...owed.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0)),
    owedList: [...owed].filter(([, v]) => v > 0.5).map(([vendor, v]) => ({ vendor, v })).sort((a, b) => b.v - a.v),
    prices,
    items,
    gstPaid: sum(posted, (b) => { const t = billSums(b); return t.cgst + t.sgst + t.igst }),
    posted: posted.length,
    waiting: waiting.length,
    lines,
  }
}

/* ---------- Months and the hook every report uses ---------- */

const monthName = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
export const periodLabel = (s: Scope) => (s.month ? monthName(s.month) : 'All months')

/** Months that have any saved figures, newest first. */
export function monthsWithData(d: Data): string[] {
  const all = [...d.entries.map((e) => e.date), ...d.manual.map((m) => m.date), ...d.bills.filter((b) => b.voucherId).map((b) => b.date)]
  return [...new Set(all.filter(Boolean).map((x) => x.slice(0, 7)))].sort().reverse()
}

/** Saved data plus a month/branch picker, for a report page. */
export function useReportData() {
  const entries = useEntries()
  // A cancelled voucher stays in the registers but counts nowhere.
  const manualAll = useManualVouchers()
  const manual = useMemo(() => manualAll.filter((m) => !m.cancelled), [manualAll])
  const custom = useCustomLedgers()
  const bills = useBills()
  const d = useMemo<Data>(() => ({ entries, manual, custom, bills }), [entries, manual, custom, bills])
  const months = useMemo(() => monthsWithData(d), [d])
  const [picked, setMonth] = useState<string | null>(null)
  const [branch, setBranch] = useState('')
  // Until someone picks, show the latest month that has figures.
  const month = picked ?? months[0] ?? ''
  const scope: Scope = { month: month || undefined, branch: branch || undefined }
  return { d, months, month, setMonth, branch, setBranch, scope, label: periodLabel(scope), hasData: months.length > 0 }
}
export { monthName }
