// Zomato weekly settlement: the calculation engine. Pure functions, no screens, no storage.
// Every figure is traced to the statement rows it comes from, so a reader can follow each rupee.
//
// Zomato's "Payout breakup" sheet numbers its rows 1–32 and totals them in lettered rows A–J:
//   A Net order value          = 1 + 2 + 3 − 4 − 5 + 6 − 7 + 8
//   B Total commissionable value = 9 + 10 + 11                     (what commission is charged on; not a deduction)
//   C Service + payment fees   = 12 + 13 − 14 − 15 + 16
//   D Government charges       = 17 + 18 + 19 + 20
//   E Other order-level deductions = 21 + 22 + 23                  (Zomato's label says "16 + 17 + 18": its own sub-numbering)
//   F Investment in growth services = 24 + 25 + 26                 (ads, incl. 18% GST)
//   G Hyperpure = 27 · H Other deductions = 28
//   I Additions = 29 + 30 + 31 + 32                                (cancellation refunds, tips, 194H, rebates)
//   J Net payout = A − C − D − E − F − G − H + I
// The net order value of cancelled orders (A, cancelled column) is shown by Zomato but not paid: a cancelled order
// pays only its refund (row 29). So the payout = (A − C − D − E − F − G − H) on delivered orders, minus any charges on
// cancelled orders, plus I. This matches Zomato's printed J; the engine checks it every week.

import { applyPct, inrU, pct, sum, toPaisa, toUnits, type Units } from './money'

export type Col = 'delivered' | 'cancelled' | 'total'
export type ZRow = { key: string; label: string; delivered: Units; cancelled: Units; total: Units }
export type ZAd = { type: string; resId: string; ref: string; period: string; status: string; total: Units; adjusted: Units; outstanding: Units }
export type ZUtr = { utr: string; amount: Units; date?: string; orders: number }

/** What was read from one weekly statement. Amounts in units (₹0.0001). */
export type ZStatement = {
  aggregator: 'zomato'
  resId: string
  resName: string
  address: string
  legalEntity?: string
  gstin?: string
  from: string // yyyy-mm-dd
  to: string
  orders?: number
  rows: ZRow[] // numbered rows '1'…'32' and lettered totals 'A'…'J'
  extra: ZRow[] // named sub-rows (customer compensation, amount settled, pending …)
  ads: ZAd[] // ad campaigns (Addition/Deductions details)
  utrs: ZUtr[] // bank UTRs on settled orders (Order Level)
  printedNetPayout: Units | null
  settled: Units | null
  pending: Units | null
}

/** One term of a formula: a statement row, added or taken away, from one column. */
export type Term = { item: string; sign: 1 | -1; col: Col }
const t = (item: string, sign: 1 | -1 = 1, col: Col = 'delivered'): Term => ({ item, sign, col })

/** Which statement rows make up each value. Versioned with the partner terms; the defaults follow Zomato's statement. */
export type ZRules = {
  commissionableValue: Term[]
  growthServices: Term[]
  otherOrderDeductions: Term[]
  commissionCharged: Term[]
  tolerance: Units // differences up to this are rounding (default ₹1)
}
export const DEFAULT_ZRULES: ZRules = {
  commissionableValue: [t('9'), t('10'), t('11')],
  growthServices: [t('24', 1, 'total'), t('25', 1, 'total'), t('26', 1, 'total')],
  otherOrderDeductions: [t('21', 1, 'total'), t('22', 1, 'total'), t('23', 1, 'total')],
  commissionCharged: [t('12'), t('15', -1)],
  tolerance: 10_000,
}

/** Commission as agreed with Zomato: a % of the commissionable value, or a fixed amount for the week. Not set = unknown. */
export type CommissionRule = { mode: 'pct' | 'fixed' | null; value: string | null } // value = decimal string ("17", "25000")

export type Source = { item: string; label: string; col: Col; sign: 1 | -1; amount: Units }
export type Line = { key: string; label: string; formula: string; amount: Units; sources: Source[] }
export type Check = { key: string; label: string; formula: string; computed: Units; printed: Units | null; ok: boolean }

export type ZCalc = {
  dynamic: { commissionableValue: Line; growthServices: Line; otherOrderDeductions: Line }
  commissionCharged: Line
  structure: Check[] // each lettered total recomputed from its rows
  statementPayout: Line // what Zomato should pay, worked out from the statement's own structure
  printedPayout: Units | null
  payoutCheck: Check
  commission: { charged: Units; expected: Units | null; over: Units | null; ratePct: number | null; rule: string }
  ads: { charged: Units; approved: Units | null; unapproved: Units | null }
  recoverable: Units // commission above the agreed rule + ads not approved
  payablePerTerms: Line // the statement payout plus what is recoverable: what Zomato owes under BTI's terms
  issues: string[]
}

const row = (s: ZStatement, key: string) => s.rows.find((r) => r.key === key)
const val = (s: ZStatement, x: Term) => (row(s, x.item)?.[x.col] ?? 0) * x.sign
const COLS: Record<Col, string> = { delivered: 'delivered', cancelled: 'cancelled', total: 'total' }

export function line(s: ZStatement, key: string, label: string, terms: Term[]): Line {
  const sources = terms.map((x) => ({ item: x.item, label: row(s, x.item)?.label ?? `row ${x.item} (not on statement)`, col: x.col, sign: x.sign, amount: val(s, x) }))
  return {
    key, label, amount: sum(sources.map((x) => x.amount)), sources,
    formula: terms.map((x, i) => `${i ? (x.sign > 0 ? '+ ' : '− ') : x.sign < 0 ? '− ' : ''}item ${x.item}${x.col !== 'delivered' ? ` (${COLS[x.col]})` : ''}`).join(' '),
  }
}

// Lettered totals and the rows that make them, as Zomato builds them.
const STRUCTURE: { key: string; label: string; terms: [string, 1 | -1][] }[] = [
  { key: 'A', label: 'Net order value', terms: [['1', 1], ['2', 1], ['3', 1], ['4', -1], ['5', -1], ['6', 1], ['7', -1], ['8', 1]] },
  { key: 'B', label: 'Total commissionable value', terms: [['9', 1], ['10', 1], ['11', 1]] },
  { key: 'C', label: 'Service fees & payment mechanism fees', terms: [['12', 1], ['13', 1], ['14', -1], ['15', -1], ['16', 1]] },
  { key: 'D', label: 'Government charges', terms: [['17', 1], ['18', 1], ['19', 1], ['20', 1]] },
  { key: 'E', label: 'Other order-level deductions', terms: [['21', 1], ['22', 1], ['23', 1]] },
  { key: 'F', label: 'Investment in growth services', terms: [['24', 1], ['25', 1], ['26', 1]] },
  { key: 'I', label: 'Total additions', terms: [['29', 1], ['30', 1], ['31', 1], ['32', 1]] },
]

export function calcZomato(s: ZStatement, rules: ZRules, commission: CommissionRule, approvedAds: Units | null): ZCalc {
  const issues: string[] = []
  const tol = rules.tolerance
  // Lettered totals recomputed from their rows (delivered column, and total for additions), against what is printed.
  const structure: Check[] = STRUCTURE.map(({ key, label, terms }) => {
    const col: Col = key === 'I' || key === 'F' || key === 'E' ? 'total' : 'delivered'
    const computed = sum(terms.map(([item, sign]) => (row(s, item)?.[col] ?? 0) * sign))
    const printed = row(s, key)?.[col] ?? null
    return { key, label, formula: terms.map(([item, sign], i) => `${i ? (sign > 0 ? '+ ' : '− ') : ''}${item}`).join(' ') + (col === 'total' ? ' (total)' : ' (delivered)'), computed, printed, ok: printed == null || Math.abs(computed - printed) <= 100 }
  })
  for (const c of structure) if (!c.ok) issues.push(`Statement row ${c.key} (${c.label}) is ${inrU(c.printed ?? 0)}, but its rows add up to ${inrU(c.computed)}.`)

  // The payout, from the statement's own structure.
  const d = (k: string) => row(s, k)?.delivered ?? 0
  const tt = (k: string) => row(s, k)?.total ?? 0
  const payoutSources: Source[] = [
    { item: 'A', label: 'Net order value, delivered orders', col: 'delivered', sign: 1, amount: d('A') },
    ...(['C', 'D', 'E', 'F', 'G', 'H'] as const).map((k) => ({ item: k, label: row(s, k)?.label ?? k, col: 'total' as Col, sign: -1 as const, amount: -tt(k) })),
    { item: 'I', label: row(s, 'I')?.label ?? 'Total additions', col: 'total', sign: 1, amount: tt('I') },
  ]
  const statementPayout: Line = { key: 'payout', label: 'Net payout worked out from the statement', formula: 'A (delivered) − C − D − E − F − G − H + I', amount: sum(payoutSources.map((x) => x.amount)), sources: payoutSources }
  const printedPayout = s.printedNetPayout
  const payoutCheck: Check = { key: 'J', label: 'Net payout', formula: 'A − C − D − E − F − G − H + I', computed: statementPayout.amount, printed: printedPayout, ok: printedPayout == null || Math.abs(statementPayout.amount - printedPayout) <= 100 }
  if (!payoutCheck.ok) issues.push(`Zomato's printed net payout ${inrU(printedPayout ?? 0)} doesn't match its own rows (${inrU(statementPayout.amount)}).`)

  const dynamic = {
    commissionableValue: line(s, 'commissionable', 'Total commissionable value', rules.commissionableValue),
    growthServices: line(s, 'growth', 'Investment in growth services (ads, incl. GST)', rules.growthServices),
    otherOrderDeductions: line(s, 'other-order', 'Other order-level deductions', rules.otherOrderDeductions),
  }
  const commissionCharged = line(s, 'commission', 'Commission charged (base service fee, after cap discount)', rules.commissionCharged)

  // Commission against the agreed rule. Never assumed: no rule = not checked.
  let expected: Units | null = null, rule = 'Not set: configure the agreed commission'
  if (commission.mode === 'pct' && commission.value) { expected = applyPct(dynamic.commissionableValue.amount, commission.value); rule = `${commission.value}% of the commissionable value` }
  if (commission.mode === 'fixed' && commission.value) { expected = toPaisa(toUnits(commission.value) ?? 0); rule = `Fixed ${inrU(expected)} for the week` }
  const over = expected == null ? null : Math.max(0, commissionCharged.amount - expected)
  if (expected == null) issues.push('Commission rule not configured, so commission is not checked.')
  else if ((over ?? 0) > tol) issues.push(`Commission ${inrU(commissionCharged.amount)} is ${inrU(over ?? 0)} more than agreed (${rule}).`)

  // Advertisement: only an approved amount may be kept by Zomato.
  const adsCharged = dynamic.growthServices.amount
  const unapproved = approvedAds == null ? (adsCharged > 0 ? adsCharged : 0) : Math.max(0, adsCharged - approvedAds)
  if (adsCharged > 0 && approvedAds == null) issues.push(`Advertisement ${inrU(adsCharged)} is not approved yet.`)
  else if (unapproved > tol) issues.push(`Advertisement ${inrU(adsCharged)} is ${inrU(unapproved)} more than the approved ${inrU(approvedAds ?? 0)}.`)

  const recoverable = (over && over > tol ? over : 0) + (unapproved > tol ? unapproved : 0)
  const payablePerTerms: Line = {
    key: 'per-terms', label: 'Payable under BTI terms', formula: 'Statement payout + commission above the agreed rule + advertisement not approved',
    amount: statementPayout.amount + recoverable,
    sources: [
      { item: 'payout', label: 'Statement payout (worked out)', col: 'total', sign: 1, amount: statementPayout.amount },
      { item: 'commission', label: 'Commission above the agreed rule', col: 'total', sign: 1, amount: over && over > tol ? over : 0 },
      { item: 'ads', label: 'Advertisement not approved', col: 'total', sign: 1, amount: unapproved > tol ? unapproved : 0 },
    ],
  }
  return {
    dynamic, commissionCharged, structure, statementPayout, printedPayout, payoutCheck,
    commission: { charged: commissionCharged.amount, expected, over, ratePct: pct(commissionCharged.amount, dynamic.commissionableValue.amount), rule },
    ads: { charged: adsCharged, approved: approvedAds, unapproved: approvedAds == null && !adsCharged ? null : unapproved },
    recoverable, payablePerTerms, issues,
  }
}

/* ---------- Settlement status against the bank ---------- */

export type ZStatus = 'pending' | 'partial' | 'reconciled' | 'mismatch' | 'review'
export const STATUS_LABEL: Record<ZStatus, string> = { pending: 'Pending', partial: 'Partially received', reconciled: 'Reconciled', mismatch: 'Mismatch', review: 'Under review' }

/**
 * Pending: nothing in the bank yet · Partially received: some of it · Mismatch: more than expected arrived, or the
 * statement doesn't add up · Under review: marked by a person, or the money is in but commission / ads need a look ·
 * Reconciled: the money matches within the tolerance and nothing is open. Never reconciled on a difference.
 */
export function zStatus(calc: ZCalc, received: Units, tol: Units, manualReview: boolean): { status: ZStatus; difference: Units; why: string } {
  const expected = calc.statementPayout.amount
  const difference = expected - received
  const broken = calc.structure.some((c) => !c.ok) || !calc.payoutCheck.ok
  if (manualReview) return { status: 'review', difference, why: 'Marked for review' }
  if (broken) return { status: 'mismatch', difference, why: 'The statement does not add up' }
  if (received > expected + tol) return { status: 'mismatch', difference, why: `Received ${inrU(-difference)} more than expected` }
  if (received <= 0) return { status: 'pending', difference, why: 'Not yet in the bank' }
  if (difference > tol) return { status: 'partial', difference, why: `${inrU(difference)} still to come` }
  const open = calc.issues.length > 0
  return open ? { status: 'review', difference, why: calc.issues[0] } : { status: 'reconciled', difference, why: 'Matches the bank' }
}
