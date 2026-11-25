import { cloudStore } from './cloudStore'
import { cashIn, type DayEntry } from './entries'
import { addLedger, addManualVoucher, customLedgersNow, deleteManualVoucher, ledgerKey, manualVouchersNow, updateManualVoucher, type ReceiptFile, type VoucherLine } from './ledgerStore'
import type { GroupId } from './books'
import type { BankLine } from './banking'
import { branchName } from './mock'
import type { Units } from './aggregator/money'
import type { ZRules, ZStatement } from './aggregator/zomatoEngine'

// Money that comes in through payment partners, and the weekly statements they settle with.
//  - Mobikwik: UPI and card payments at the counter. The Imprest Book has one Mobikwik figure a day;
//    the UPI / card split is typed in here from the Mobikwik report.
//  - Weekly statements: Swiggy, Zomato, Rapido and Mobikwik pay out once a week after taking commission,
//    advertising and other charges. Net receipts = gross − deductions, and must match what reached the bank.

/* ---------- Mobikwik: UPI / card split per outlet and day ---------- */

// report / payments / file: filled from Mobikwik's Transactions Report (its own total for the day, to check the Imprest Book).
export type PaySplit = { id: string; branch: string; date: string; upi: number; card: number; report?: number; payments?: number; file?: string; addedBy: string; addedAt: string }
const splits = cloudStore<PaySplit>('prisim.paySplits', { kind: 'paySplits', idOf: (s) => s.id })
export const usePaySplits = splits.use
export const splitId = (branch: string, date: string) => `${branch}:${date}`
export function saveSplit(s: Omit<PaySplit, 'id'>) {
  const id = splitId(s.branch, s.date)
  return splits.set([{ ...s, id }, ...splits.get().filter((x) => x.id !== id)])
}
/** Save many days at once (a Mobikwik report): one write instead of one per day. */
export function saveSplits(list: Omit<PaySplit, 'id'>[]) {
  const ids = new Set(list.map((s) => splitId(s.branch, s.date)))
  return splits.set([...list.map((s) => ({ ...s, id: splitId(s.branch, s.date) })), ...splits.get().filter((x) => !ids.has(x.id))])
}
export const paySplitsNow = () => splits.get()

export type PayDay = { date: string; branch: string; cash: number; mobikwik: number; upi: number | null; card: number | null; total: number; split: PaySplit | null; report: number | null }

/** How each day's money came in at the counter: cash, UPI, card. */
export function payDays(entries: DayEntry[], all: PaySplit[]): PayDay[] {
  const byId = new Map(all.map((s) => [s.id, s]))
  return entries.map((e) => {
    const s = byId.get(splitId(e.branch, e.date)) ?? null
    const cash = r2(cashIn(e))
    return { date: e.date, branch: e.branch, cash, mobikwik: e.mobikwik, upi: s ? s.upi : null, card: s ? s.card : null, total: r2(cash + e.mobikwik), split: s, report: s?.report ?? null }
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
  periodFrom?: string // the statement's own first and last day, when it isn't Monday–Sunday (Swiggy runs Sunday–Saturday)
  periodTo?: string
  gross: number | null // gross sales as per the partner's statement
  deductions: Deduction[]
  received: number | null // what actually reached the bank
  receivedOn?: string
  utr?: string // bank reference
  note: string
  statementNet?: number | null // net payout as printed on the statement (to cross-check our working)
  outletRef?: string // the partner's own ID for this outlet (Swiggy Rest. ID, Zomato Res id): later statements with it go to the same outlet
  commissionBase?: number | null // the amount commission is charged on (Zomato: commissionable value); gross when not given
  bankLineId?: string // the bank statement line the payout was matched to (Banking → Bank Reconciliation)
  receivedFrom?: string // bank ledger the payout reached, when matched from a bank statement
  file?: ReceiptFile // the uploaded statement
  readNote?: string // what the reader found
  // Aggregator Reconciliation (Zomato): the full statement, its import, approvals, finalising and history.
  zomato?: ZStatement
  import?: { fileHash: string; fileName: string; source: 'xlsx' | 'csv' | 'gsheet'; by: string; at: string }
  adApprovals?: AdApproval[]
  review?: { by: string; at: string; note: string } | null // marked "under review" by a person
  finalised?: { by: string; at: string; snapshot: FinalSnapshot } | null
  revisions?: { at: string; by: string; reason: string; before: FinalSnapshot }[] // each time a finalised week was reopened
  history?: { at: string; by: string; action: string; detail: string }[]
  addedBy: string
  addedAt: string
  updatedBy?: string
  updatedAt?: string
}

/** An approval of the week's advertisement: a % of the net order value or a fixed amount, and who approved it. */
export type AdApproval = { id: string; mode: 'pct' | 'amount'; value: string; amount: Units; base?: Units; by: string; at: string; note?: string; revoked?: { by: string; at: string; reason: string } }
export const currentAdApproval = (s: Settlement) => [...(s.adApprovals ?? [])].reverse().find((a) => !a.revoked) ?? null

/** What a finalised week was settled on: the terms version, the figures and the bank matches, as they stood. */
export type FinalSnapshot = {
  termsId: string | null
  commission: { mode: string | null; value: string | null }
  adsApproved: Units | null
  statementPayout: Units
  payablePerTerms: Units
  recoverable: Units
  received: Units
  difference: Units
  status: string
  matches: { bankLineId: string; amount: Units }[]
}

const settlements = cloudStore<Settlement>('prisim.settlements', { kind: 'settlements', idOf: (s) => s.id })
export const useSettlements = settlements.use
export const settlementId = (partner: string, branch: string, week: string) => `${partner}:${branch}:${week}`
export function saveSettlement(s: Settlement, by = s.updatedBy ?? s.addedBy) {
  const ok = settlements.set([s, ...settlements.get().filter((x) => x.id !== s.id)])
  syncSettlementVoucher(s, by)
  return ok
}
export function deleteSettlement(id: string) {
  settlements.set(settlements.get().filter((x) => x.id !== id))
  if (manualVouchersNow().some((v) => v.id === stlVoucherId(id))) deleteManualVoucher(stlVoucherId(id))
}

/* ---------- Partner terms: the agreed commission and the approved advertisement budget ---------- */

// Commission is fixed by the contract; advertisement is approved by management as a % of sales or a cost per week.
// Set for all outlets of a partner (branch '*'), or for one outlet when it differs.
// Terms are kept as versions, each from a date: a week is always checked with the terms in force then, so a new
// rate never changes weeks already done. (Terms saved before versions existed count as in force from the start.)
export type PartnerTerms = {
  id: string // partner:branch@effectiveFrom ('*' = all outlets); older records: partner:branch
  partner: PartnerId
  branch: string
  effectiveFrom?: string // yyyy-mm-dd, the first week these apply to
  commissionMode?: 'pct' | 'fixed' | null // how commission is agreed (unset with a % = 'pct')
  commissionPct: number | null // agreed commission, % of the commissionable value
  commissionAmount?: string | null // agreed fixed commission per week (₹, as typed)
  adsMode: 'pct' | 'amount' | null // approved advertisement: % of the week's sales, or ₹ per week
  adsValue: number | null
  zRules?: ZRules // Zomato: which statement rows make each value (defaults follow the statement)
  note?: string // why the terms changed (contract, email …)
  by: string
  at: string
}
const terms = cloudStore<PartnerTerms>('prisim.partnerTerms', { kind: 'partnerTerms', idOf: (t) => t.id })
export const usePartnerTerms = terms.use
export const partnerTermsNow = () => terms.get()
export const FROM_START = '2000-01-01'
export const effectiveOf = (t: PartnerTerms) => t.effectiveFrom ?? FROM_START
export const termsId = (partner: string, branch: string, from = FROM_START) => `${partner}:${branch}@${from}`
/** Save terms as the version from `effectiveFrom` (default: this week's Monday). Empty terms remove that version. */
export function saveTerms(t: Omit<PartnerTerms, 'id'>) {
  const from = t.effectiveFrom ?? weekStart(new Date().toLocaleDateString('en-CA'))
  const id = termsId(t.partner, t.branch, from)
  const legacy = `${t.partner}:${t.branch}`
  const empty = t.commissionPct == null && !t.commissionAmount && (t.adsMode == null || t.adsValue == null) && !t.zRules
  // A record from before versions, for the same outlet and start, is replaced rather than kept twice.
  terms.set([...(empty ? [] : [{ ...t, effectiveFrom: from, id }]), ...terms.get().filter((x) => x.id !== id && !(x.id === legacy && from === FROM_START))])
}
export function deleteTermsVersion(id: string) { terms.set(terms.get().filter((x) => x.id !== id)) }
/** Versions for one partner and outlet, newest first. */
export const versionsOf = (all: PartnerTerms[], partner: string, branch: string) =>
  all.filter((t) => t.partner === partner && t.branch === branch).sort((a, b) => effectiveOf(b).localeCompare(effectiveOf(a)))
/** The terms in force for an outlet on a date: its own version, otherwise the partner's terms for all outlets. */
export function termsFor(all: PartnerTerms[], partner: string, branch: string, onDate = '9999-12-31'): PartnerTerms | null {
  const live = (b: string) => versionsOf(all, partner, b).find((t) => effectiveOf(t) <= onDate) ?? null
  return live(branch) ?? live('*')
}

/* ---------- Posting an approved statement to the books ---------- */

// When every deduction is approved, one Journal on the last day of the week takes them out of the partner's ledger:
//   Dr Commission, Advertisement, Payment Charges, Other Charges (expenses) · Dr Input GST (GST on the partner's fees)
//   Dr GST paid by the partner u/s 9(5) · Dr TDS Receivable · Cr Other Income (money added back, like a cancellation refund)
//   Cr "<Partner> - <Outlet>" (the ledger the day entries debit with the partner's sales)
// The partner's ledger is then left with exactly what they pay into the bank. Removing an approval takes the Journal out again.
export const stlVoucherId = (id: string) => 'stl-' + id.replace(/[^a-z0-9-]+/gi, '-')
export const partnerLedger = (partner: string, branch: string) => `${partnerName(partner)} - ${branchName(branch)}`

export function settlementLines(s: Settlement): { ledger: string; group: GroupId; dr: number; cr: number }[] {
  const P = partnerName(s.partner)
  const sum = (f: (d: Deduction) => boolean) => r2(s.deductions.filter(f).reduce((t, d) => t + d.amount, 0))
  const is95 = (d: Deduction) => /9\s*\(\s*5\s*\)/.test(d.label)
  const out: { ledger: string; group: GroupId; dr: number; cr: number }[] = []
  const put = (ledger: string, group: GroupId, v: number) => { if (v > 0.004) out.push({ ledger, group, dr: v, cr: 0 }); else if (v < -0.004) out.push({ ledger, group, dr: 0, cr: -v }) }
  put(P + ' Commission', 'indirectExp', sum((d) => d.kind === 'commission'))
  put(P + ' Advertisement', 'indirectExp', sum((d) => d.kind === 'ads'))
  put(P + ' Payment Charges', 'indirectExp', sum((d) => d.kind === 'gateway'))
  put('Input GST', 'duties', sum((d) => d.kind === 'gst' && !is95(d)))
  put('GST paid by ' + P + ' u/s 9(5)', 'duties', sum((d) => d.kind === 'gst' && is95(d)))
  put('TDS Receivable', 'loansAdvances', sum((d) => d.kind === 'tds'))
  put(P + ' Other Charges', 'indirectExp', sum((d) => d.kind === 'other' && d.amount > 0))
  put(P + ' Other Income', 'indirectInc', sum((d) => d.kind === 'other' && d.amount < 0))
  const net = r2(out.reduce((t, l) => t + l.dr - l.cr, 0))
  put(partnerLedger(s.partner, s.branch), 'debtors', -net)
  return out
}

/** Post, re-post or take out the Journal for a statement, so the books follow its approvals. */
export function syncSettlementVoucher(s: Settlement, by: string) {
  const id = stlVoucherId(s.id)
  const had = manualVouchersNow().find((v) => v.id === id)
  const ready = s.gross != null && s.deductions.some((d) => d.amount) && s.deductions.every((d) => !d.amount || d.approvedBy)
  if (!ready) { if (had) deleteManualVoucher(id); return }
  const posting = settlementLines(s)
  const have = new Set(customLedgersNow().map((l) => ledgerKey(l.name)))
  const now = new Date().toISOString()
  for (const l of posting) if (!have.has(ledgerKey(l.ledger))) { addLedger({ name: l.ledger, group: l.group, opening: 0, addedBy: by, addedAt: now }); have.add(ledgerKey(l.ledger)) }
  const lines: VoucherLine[] = posting.map((l) => ({ ledger: l.ledger, dr: l.dr, cr: l.cr }))
  const P = partnerName(s.partner)
  const v = {
    id, type: 'Journal' as const, date: weekEndOf(s.date), branch: s.branch, amount: r2(lines.reduce((t, l) => t + l.dr, 0)), lines,
    drLedger: lines.find((l) => l.dr)?.ledger, crLedger: partnerLedger(s.partner, s.branch), settlementId: s.id,
    narration: `${P} weekly statement ${s.date} to ${weekEndOf(s.date)}: commission, advertisement and charges kept by ${P}${s.utr ? ' (UTR ' + s.utr + ')' : ''}`,
    addedBy: had?.addedBy ?? by, addedAt: had?.addedAt ?? now, ...(had ? { updatedBy: by, updatedAt: now } : {}),
  }
  if (had && JSON.stringify(had.lines) === JSON.stringify(v.lines) && had.date === v.date && had.narration === v.narration) return
  if (had) updateManualVoucher(v); else addManualVoucher(v)
}

/* ---------- The payout in the bank ---------- */

// Who the credit comes from, as it shows on a bank statement (Swiggy pays as Bundl Technologies, Rapido as Roppen).
export const PAYER: Record<string, RegExp> = {
  // Swiggy payouts for outlets with an Indifi loan come through Indifi's escrow account ("NEFT-IDFB-…-Indifi").
  swiggy: /swiggy|bundl|indifi/i, zomato: /zomato|eternal\s+l(imi)?te?d/i, rapido: /rapido|roppen/i, mobikwik: /mobikwik/i,
}

/**
 * The bank credit that is this statement's payout: from the partner, the same amount as our net receipts (within ₹1),
 * on or after the week's last day and within three weeks. A UTR on the statement that appears in the bank line wins.
 * Returns nothing when there is no clear single match.
 */
export function payoutCredit(s: Settlement, net: number | null, lines: BankLine[], taken: Set<string>): BankLine | null {
  const open = lines.filter((l) => !l.ignored && l.deposit > 0 && !taken.has(l.id))
  // The statement's UTR in a bank credit is proof on its own, whatever name the bank prints for the payer.
  if (s.utr && s.utr.length >= 8) { const u = open.find((l) => (l.narration + ' ' + l.ref).toUpperCase().includes(s.utr!.toUpperCase())); if (u) return u }
  const from = open.filter((l) => !!PAYER[s.partner]?.test(l.narration + ' ' + l.ref))
  if (net == null || net <= 0) return null
  const end = s.periodTo ?? weekEndOf(s.date), last = addDays(end, 21)
  const near = from.filter((l) => Math.abs(l.deposit - net) <= TOLERANCE && l.date >= end && l.date <= last)
  return near.length === 1 ? near[0] : null
}

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
  commissionBase: number | null // what the commission is charged on
  commissionPct: number | null // commission charged, % of its base
  agreedPct: number | null // commission agreed in the partner terms
  commissionExtra: number | null // commission charged above the agreed % (only overcharges count)
  adsPct: number | null // advertisement, % of the statement's sales
  adsLimit: number | null // approved advertisement for the week
  adsOver: number | null // advertisement above the approved budget
  status: 'no statement' | 'waiting approval' | 'not received' | 'difference' | 'matched'
}

export function statementRow(partner: PartnerId, branch: string, week: string, entries: DayEntry[], s: Settlement | null, allTerms: PartnerTerms[] = []): StatementRow {
  const field = PARTNERS.find((p) => p.id === partner)!.field
  // Sales in the books for the statement's own days (its printed period), else Monday to Sunday.
  const from = s?.periodFrom ?? week, end = s?.periodTo ?? weekEndOf(week)
  const books = r2(entries.filter((e) => e.branch === branch && e.date >= from && e.date <= end).reduce((t, e) => t + e[field], 0))
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
  // Commission is fixed by contract; advertisement must stay within what was approved.
  const t = termsFor(allTerms, partner, branch, week)
  const commissionBase = gross == null ? null : (s?.commissionBase ?? gross)
  const commissionPct = commissionBase ? r2(commission / commissionBase * 100) : null
  const fixed = t?.commissionMode === 'fixed' && t.commissionAmount ? Number(t.commissionAmount) : null
  const agreedPct = fixed == null ? (t?.commissionPct ?? null) : null
  const agreedAmount = fixed ?? (agreedPct == null || commissionBase == null ? null : commissionBase * agreedPct / 100)
  const commissionExtra = agreedAmount == null || !commission ? null : r2(Math.max(0, commission - agreedAmount))
  const adsPct = gross ? r2(ads / gross * 100) : null
  const adsLimit = !t?.adsMode || t.adsValue == null ? null : t.adsMode === 'pct' ? (gross == null ? null : r2(gross * t.adsValue / 100)) : t.adsValue
  const adsOver = adsLimit == null || gross == null ? null : r2(Math.max(0, ads - adsLimit))
  const overTerms = (commissionExtra ?? 0) > TOLERANCE || (adsOver ?? 0) > TOLERANCE
  const status: StatementRow['status'] = !s || gross == null ? 'no statement'
    : pending ? 'waiting approval'
    : received == null ? (overTerms ? 'difference' : 'not received')
    : Math.abs(receiptDiff ?? 0) > TOLERANCE || Math.abs(salesDiff ?? 0) > TOLERANCE || Math.abs(payoutDiff ?? 0) > TOLERANCE || overTerms ? 'difference'
    : 'matched'
  return {
    id: settlementId(partner, branch, week), partner, branch, week, books, s, gross, commission, ads, charges, deductions, net, received, salesDiff, payoutDiff, receiptDiff, pending, status,
    commissionBase, commissionPct, agreedPct, commissionExtra, adsPct, adsLimit, adsOver,
  }
}

/* ---------- Alerts: a statement that doesn't match ---------- */

export type ReconcileAlert = {
  id: string // changes when the figures change, so a new difference alerts again
  rowId: string; partner: PartnerId; branch: string; week: string
  problems: string[]
}

/** Every statement where something doesn't tally: sales vs books, our net vs the statement, or money received vs net. */
export function reconcileAlerts(entries: DayEntry[], all: Settlement[], allTerms: PartnerTerms[] = []): ReconcileAlert[] {
  const inr = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  const off = (n: number | null): n is number => n != null && Math.abs(n) > TOLERANCE
  const out: ReconcileAlert[] = []
  for (const s of all) {
    const r = statementRow(s.partner, s.branch, s.date, entries, s, allTerms)
    const problems: string[] = []
    if (off(r.commissionExtra)) problems.push(`Commission ${r.commissionPct}% charged vs ${r.agreedPct != null ? r.agreedPct + "% agreed" : "the agreed amount"}: ${inr(r.commissionExtra)} extra`)
    if (off(r.adsOver)) problems.push(`Advertisement ${inr(r.ads)} is ${inr(r.adsOver)} over the approved ${inr(r.adsLimit ?? 0)}`)
    if (off(r.salesDiff)) problems.push(`Statement sales ${r.salesDiff > 0 ? 'more' : 'less'} than the Imprest Book by ${inr(r.salesDiff)}`)
    if (off(r.payoutDiff)) problems.push(`Our net receipts differ from the statement's net payout by ${inr(r.payoutDiff)}`)
    if (off(r.receiptDiff)) problems.push(r.receiptDiff < 0 ? `Received ${inr(r.receiptDiff)} less than net receipts` : `Received ${inr(r.receiptDiff)} more than net receipts`)
    if (problems.length) out.push({ id: `${r.id}|${r.salesDiff ?? ''}|${r.payoutDiff ?? ''}|${r.receiptDiff ?? ''}|${r.commissionExtra ?? ''}|${r.adsOver ?? ''}`, rowId: r.id, partner: s.partner, branch: s.branch, week: s.date, problems })
  }
  return out.sort((a, b) => b.week.localeCompare(a.week) || a.partner.localeCompare(b.partner))
}

/** Every partner × outlet that sold something that week or has a statement for it. */
export function weekRows(week: string, entries: DayEntry[], all: Settlement[], branch = '', partner = '', allTerms: PartnerTerms[] = []): StatementRow[] {
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
    return statementRow(p, b, week, entries, byId.get(settlementId(p, b, week)) ?? null, allTerms)
  }).sort((a, b) => a.partner.localeCompare(b.partner) || a.branch.localeCompare(b.branch))
}
