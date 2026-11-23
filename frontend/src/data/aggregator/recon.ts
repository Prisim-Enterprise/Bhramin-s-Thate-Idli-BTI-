// Aggregator Reconciliation: Zomato weekly statements against the bank.
// The figures come from zomatoEngine (pure); this file stores what people do with them:
// imports, advertisement approvals, bank matches, review flags, finalising and reopening, and a history of each.
// Weekly statements are the existing "settlements" records (one per partner, outlet and week); bank credits are the
// lines uploaded in Banking → Bank Reconciliation. Nothing is duplicated.

import { cloudStore } from '../cloudStore'
import type { BankLine } from '../banking'
import {
  addDays, currentAdApproval, partnerTermsNow, saveSettlement, settlementId, termsFor, weekEndOf, weekStart,
  type AdApproval, type FinalSnapshot, type PartnerTerms, type Settlement, type Deduction,
} from '../settlements'
import type { ReceiptFile } from '../ledgerStore'
import { applyPct, inrU, rupees, sum, toPaisa, toUnits, type Units } from './money'
import { DEFAULT_ZRULES, STATUS_LABEL, calcZomato, zStatus, type CommissionRule, type ZCalc, type ZRules, type ZStatement, type ZStatus } from './zomatoEngine'

/* ---------- Bank matches: one credit can pay several weeks, one week can come in several credits ---------- */

export type BankMatch = {
  id: string
  settlementId: string
  bankLineId: string
  amount: Units // the part of the credit allocated to this week
  branch: string
  date: string // the bank credit's date
  evidence: 'utr' | 'amount' | 'manual'
  note?: string
  by: string
  at: string
}
const matches = cloudStore<BankMatch>('prisim.bankMatches', { kind: 'bankMatches', idOf: (m) => m.id })
export const useBankMatches = matches.use
export const bankMatchesNow = () => matches.get()

/** Which outlet each Zomato restaurant ID is: remembered after the first statement. */
export type AggregatorOutlet = { id: string; partner: string; resId: string; branch: string; by: string; at: string }
const outlets = cloudStore<AggregatorOutlet>('prisim.aggregatorOutlets', { kind: 'aggregatorOutlets', idOf: (o) => o.id })
export const useAggregatorOutlets = outlets.use
export function rememberOutlet(partner: string, resId: string, branch: string, by: string) {
  const id = `${partner}:${resId}`
  if (outlets.get().some((o) => o.id === id && o.branch === branch)) return
  outlets.set([{ id, partner, resId, branch, by, at: new Date().toISOString() }, ...outlets.get().filter((o) => o.id !== id)])
}

/* ---------- Working out a week ---------- */

const now = () => new Date().toISOString()
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const event = (s: Settlement, by: string, action: string, detail: string): Settlement['history'] => [...(s.history ?? []), { at: now(), by, action, detail }]

/** The Zomato rules and commission in force for a week (the finalised snapshot's, once finalised). */
export function rulesFor(s: Settlement, all: PartnerTerms[]): { terms: PartnerTerms | null; rules: ZRules; commission: CommissionRule } {
  const t = termsFor(all, s.partner, s.branch, s.date)
  const company = termsFor(all, s.partner, '*', s.date)
  const rules = t?.zRules ?? company?.zRules ?? DEFAULT_ZRULES
  if (s.finalised) return { terms: t, rules, commission: s.finalised.snapshot.commission as CommissionRule }
  const mode = t?.commissionMode ?? (t?.commissionPct != null ? 'pct' : null)
  const commission: CommissionRule = mode === 'fixed' ? { mode, value: t?.commissionAmount ?? null } : mode === 'pct' ? { mode, value: t?.commissionPct != null ? String(t.commissionPct) : null } : { mode: null, value: null }
  return { terms: t, rules, commission }
}

export type WeekState = {
  s: Settlement
  calc: ZCalc
  terms: PartnerTerms | null
  received: Units
  matches: BankMatch[]
  status: ZStatus
  statusLabel: string
  why: string
  difference: Units
}

export function weekState(s: Settlement & { zomato: ZStatement }, all: PartnerTerms[], ms: BankMatch[]): WeekState {
  const { terms, rules, commission } = rulesFor(s, all)
  const approved = s.finalised ? s.finalised.snapshot.adsApproved : currentAdApproval(s)?.amount ?? null
  const calc = calcZomato(s.zomato, rules, commission, approved)
  const mine = ms.filter((m) => m.settlementId === s.id)
  const received = sum(mine.map((m) => m.amount))
  const st = zStatus(calc, received, rules.tolerance, !!s.review)
  return { s, calc, terms, received, matches: mine, status: st.status, statusLabel: STATUS_LABEL[st.status], why: st.why, difference: st.difference }
}

export const isZomatoWeek = (s: Settlement): s is Settlement & { zomato: ZStatement } => s.partner === 'zomato' && !!s.zomato

/* ---------- Import ---------- */

export type ImportCheck = { ok: boolean; problems: string[]; replaces: Settlement | null; id: string | null }

/** Before saving: is this the same file again, a week already finalised, or a week that would be replaced? */
export function checkImport(st: ZStatement, branch: string | null, hash: string, all: Settlement[]): ImportCheck {
  const problems: string[] = []
  const same = all.find((s) => s.import?.fileHash === hash)
  if (same) problems.push(`This file was already imported on ${same.import!.at.slice(0, 10)} by ${same.import!.by} (${same.id}).`)
  const dupPeriod = all.find((s) => s.zomato && s.zomato.resId === st.resId && s.zomato.from === st.from && s.zomato.to === st.to)
  if (!branch) problems.push('Pick the outlet this restaurant ID belongs to.')
  const id = branch ? settlementId('zomato', branch, weekStart(st.from)) : null
  const replaces = (id && all.find((s) => s.id === id)) || dupPeriod || null
  if (replaces?.finalised) problems.push(`The week of ${replaces.date} for this outlet is finalised. Reopen it (with a reason) before importing a corrected statement.`)
  if (st.from && weekStart(st.from) !== st.from) problems.push(`The statement starts on ${st.from}, not a Monday: check the period.`)
  return { ok: !problems.length, problems, replaces, id }
}

/** The figures the weekly Reconcile page, the alerts and the journal posting read, from the full statement. */
function legacyFields(st: ZStatement, calc: ZCalc): Pick<Settlement, 'gross' | 'deductions' | 'statementNet' | 'commissionBase'> {
  const row = (k: string) => st.rows.find((r) => r.key === k)
  const t = (k: string) => row(k)?.total ?? 0, d = (k: string) => row(k)?.delivered ?? 0
  const ded: Omit<Deduction, 'id'>[] = []
  const add = (kind: Deduction['kind'], label: string, u: Units) => { const v = rupees(u); if (Math.abs(v) >= 0.01) ded.push({ kind, label, amount: v }) }
  const adsWithGst = t('24') + t('25') + t('26')
  const adsOnly = Math.round(adsWithGst / 1.18)
  add('commission', 'Base service fee (commission), after 30% cap discount', d('12') - d('15'))
  add('other', 'Long distance enablement fee (after discount)', d('13') - d('14'))
  add('gateway', 'Payment mechanism fee', t('16'))
  add('gst', 'GST 18% on service & payment fees', t('17'))
  add('gst', 'Customer GST paid by Zomato (sec 9(5))', t('20'))
  add('tds', 'TDS 194O + TCS', t('18') + t('19'))
  add('other', 'Customer compensation & other order deductions', t('21'))
  add('other', 'Cash received on self-delivery orders', t('22'))
  add('other', 'Adjustments from previous weeks', t('23'))
  add('ads', 'Ads (before GST)', adsOnly)
  add('gst', 'GST 18% on ads', adsWithGst - adsOnly)
  add('other', 'Hyperpure purchases', t('27'))
  add('other', 'Express order discount reversal', t('28'))
  add('other', 'Addition: cancellation refund', -t('29'))
  add('other', 'Addition: tips for kitchen staff', -t('30'))
  add('other', 'Addition: TDS 194H & other additions', -t('31'))
  add('other', 'Addition: service fee rebate', -t('32'))
  return {
    gross: rupees(d('A')), statementNet: st.printedNetPayout == null ? rupees(calc.statementPayout.amount) : rupees(st.printedNetPayout),
    commissionBase: rupees(d('B')),
    deductions: ded.map((x) => ({ ...x, id: uid() })),
  }
}

export function importStatement(o: { st: ZStatement; branch: string; hash: string; fileName: string; source: 'xlsx' | 'csv' | 'gsheet'; file?: ReceiptFile; by: string; replaces: Settlement | null; all: PartnerTerms[] }): Settlement {
  const week = weekStart(o.st.from)
  const id = settlementId('zomato', o.branch, week)
  const old = o.replaces
  const base: Settlement = old ?? { id, partner: 'zomato', branch: o.branch, date: week, weekEnd: weekEndOf(week), gross: null, deductions: [], received: null, note: '', addedBy: o.by, addedAt: now() }
  const draft: Settlement & { zomato: ZStatement } = { ...base, id, branch: o.branch, date: week, weekEnd: weekEndOf(week), zomato: o.st }
  const calc = weekState(draft, o.all, []).calc
  const s: Settlement = {
    ...draft, ...legacyFields(o.st, calc),
    file: o.file ?? old?.file, readNote: `Zomato settlement report ${o.st.from} to ${o.st.to}, restaurant ${o.st.resId}${o.st.orders ? `, ${o.st.orders} orders` : ''}.`,
    utr: old?.utr ?? o.st.utrs[0]?.utr,
    import: { fileHash: o.hash, fileName: o.fileName, source: o.source, by: o.by, at: now() },
    history: event(base, o.by, old ? 're-imported' : 'imported', `${o.fileName} (${o.source}): payout ${inrU(calc.statementPayout.amount)}${old ? ', replacing the earlier import' : ''}`),
    updatedBy: o.by, updatedAt: now(),
  }
  saveSettlement(s, o.by)
  rememberOutlet('zomato', o.st.resId, o.branch, o.by)
  return s
}

/* ---------- Advertisement approval ---------- */

export function approveAds(s: Settlement & { zomato: ZStatement }, mode: 'pct' | 'amount', value: string, by: string, note?: string) {
  if (s.finalised) throw new Error('This week is finalised.')
  const base = s.zomato.rows.find((r) => r.key === 'A')?.delivered ?? 0
  const amount = mode === 'pct' ? toPaisa(applyPct(base, value)) : toPaisa(toUnits(value) ?? 0)
  const a: AdApproval = { id: uid(), mode, value, amount, base: mode === 'pct' ? base : undefined, by, at: now(), note }
  saveSettlement({ ...s, adApprovals: [...(s.adApprovals ?? []), a], history: event(s, by, 'ads approved', `${mode === 'pct' ? `${value}% of net order value ${inrU(base)} = ` : ''}${inrU(amount)}${note ? ` · ${note}` : ''}`), updatedBy: by, updatedAt: now() }, by)
}

export function revokeAds(s: Settlement, by: string, reason: string) {
  const cur = currentAdApproval(s)
  if (!cur || s.finalised) return
  saveSettlement({ ...s, adApprovals: (s.adApprovals ?? []).map((a) => (a.id === cur.id ? { ...a, revoked: { by, at: now(), reason } } : a)), history: event(s, by, 'ads approval withdrawn', `${inrU(cur.amount)} · ${reason}`), updatedBy: by, updatedAt: now() }, by)
}

/* ---------- Matching with the bank ---------- */

// Who the credit comes from, as it shows on a bank statement.
export const ZOMATO_PAYER = /zomato|eternal\s+l(imi)?te?d/i
const lineUnits = (l: BankLine) => toUnits(String(l.deposit)) ?? 0
export const allocated = (lineId: string, ms: BankMatch[]) => sum(ms.filter((m) => m.bankLineId === lineId).map((m) => m.amount))
export const lineLeft = (l: BankLine, ms: BankMatch[]) => lineUnits(l) - allocated(l.id, ms)
export const looksZomato = (l: BankLine) => l.deposit > 0 && ZOMATO_PAYER.test(`${l.narration} ${l.ref}`)

/** Keep the week's "received" figures (read by the Reconcile page, alerts and journal) in step with its matches. */
function syncReceived(s: Settlement, ms: BankMatch[], lines: BankLine[], by: string, action: string, detail: string) {
  const mine = ms.filter((m) => m.settlementId === s.id).sort((a, b) => a.date.localeCompare(b.date))
  const first = lines.find((l) => l.id === mine[0]?.bankLineId)
  const got = sum(mine.map((m) => m.amount))
  saveSettlement({
    ...s, received: mine.length ? rupees(got) : null, receivedOn: mine[mine.length - 1]?.date, bankLineId: first?.id, receivedFrom: first?.ledger,
    utr: s.utr ?? (first?.ref || undefined), history: event(s, by, action, detail), updatedBy: by, updatedAt: now(),
  }, by)
}

export function addMatch(s: Settlement, l: BankLine, amount: Units, by: string, evidence: BankMatch['evidence'], lines: BankLine[], note?: string) {
  if (s.finalised) throw new Error('This week is finalised.')
  const ms = matches.get()
  const left = lineLeft(l, ms)
  if (amount <= 0) throw new Error('Enter an amount above zero.')
  if (amount > left) throw new Error(`Only ${inrU(left)} of this credit is not yet matched.`)
  const m: BankMatch = { id: uid(), settlementId: s.id, bankLineId: l.id, amount, branch: s.branch, date: l.date, evidence, note, by, at: now() }
  const next = [...ms, m]
  matches.set(next)
  syncReceived(s, next, lines, by, 'bank matched', `${inrU(amount)} of the ${l.date} credit (${l.narration.slice(0, 40)}${l.ref ? ', ' + l.ref : ''}) · ${evidence === 'utr' ? 'UTR matches' : evidence === 'amount' ? 'same amount' : 'by hand'}`)
  return m
}

export function removeMatch(s: Settlement, m: BankMatch, by: string, lines: BankLine[], reason: string) {
  if (s.finalised) throw new Error('This week is finalised.')
  const next = matches.get().filter((x) => x.id !== m.id)
  matches.set(next)
  syncReceived(s, next, lines, by, 'bank unmatched', `${inrU(m.amount)} of the ${m.date} credit · ${reason}`)
}

/**
 * Match only on evidence: a bank line carrying one of the statement's UTRs, or a single Zomato credit for exactly the
 * amount still expected (within the tolerance), dated from the week's end to three weeks after, that no other week
 * could claim equally. Anything less is left for a person to match.
 */
export function autoMatch(weeks: WeekState[], lines: BankLine[], by: string): number {
  let n = 0
  for (const w of weeks) {
    if (w.s.finalised || w.s.review) continue
    const remaining = () => w.calc.statementPayout.amount - sum(matches.get().filter((m) => m.settlementId === w.s.id).map((m) => m.amount))
    const tol = (w.terms?.zRules ?? DEFAULT_ZRULES).tolerance
    if (remaining() <= tol) continue
    const candidates = lines.filter((l) => looksZomato(l) && lineLeft(l, matches.get()) > 0)
    // 1. UTR evidence
    for (const u of w.s.zomato!.utrs) {
      const l = candidates.find((c) => `${c.narration} ${c.ref}`.toUpperCase().includes(u.utr.toUpperCase()))
      if (!l || remaining() <= tol) continue
      const amt = Math.min(lineLeft(l, matches.get()), remaining())
      if (amt > 0) { addMatch(w.s, l, amt, by, 'utr', lines); n++ }
    }
    if (remaining() <= tol) continue
    // 2. One credit for exactly what is still expected, in the window, that no other open week matches as well.
    const end = weekEndOf(w.s.date), last = addDays(end, 21)
    const exact = candidates.filter((l) => Math.abs(lineLeft(l, matches.get()) - remaining()) <= tol && l.date >= end && l.date <= last)
    if (exact.length !== 1) continue
    const l = exact[0]
    const rivals = weeks.filter((o) => o !== w && !o.s.finalised && Math.abs((o.calc.statementPayout.amount - o.received) - lineLeft(l, matches.get())) <= tol && l.date >= weekEndOf(o.s.date) && l.date <= addDays(weekEndOf(o.s.date), 21))
    if (rivals.length) continue
    addMatch(w.s, l, lineLeft(l, matches.get()), by, 'amount', lines); n++
  }
  return n
}

/* ---------- Review, finalise, reopen ---------- */

export function setReview(s: Settlement, on: boolean, by: string, note: string) {
  if (s.finalised) return
  saveSettlement({ ...s, review: on ? { by, at: now(), note } : null, history: event(s, by, on ? 'marked for review' : 'review cleared', note), updatedBy: by, updatedAt: now() }, by)
}

/** Finalise a reconciled week: its terms, figures and matches are kept as they are; later changes need a reopen. */
export function finalise(w: WeekState, by: string) {
  if (w.status !== 'reconciled') throw new Error('Only a reconciled week can be finalised.')
  const snapshot: FinalSnapshot = {
    termsId: w.terms?.id ?? null, commission: rulesFor(w.s, partnerTermsNow()).commission, adsApproved: currentAdApproval(w.s)?.amount ?? null,
    statementPayout: w.calc.statementPayout.amount, payablePerTerms: w.calc.payablePerTerms.amount, recoverable: w.calc.recoverable,
    received: w.received, difference: w.difference, status: w.status, matches: w.matches.map((m) => ({ bankLineId: m.bankLineId, amount: m.amount })),
  }
  saveSettlement({ ...w.s, finalised: { by, at: now(), snapshot }, history: event(w.s, by, 'finalised', `payout ${inrU(snapshot.statementPayout)}, received ${inrU(snapshot.received)}`), updatedBy: by, updatedAt: now() }, by)
}

export function reopen(s: Settlement, by: string, reason: string) {
  if (!s.finalised) return
  if (reason.trim().length < 5) throw new Error('Give a reason for reopening (at least a few words).')
  saveSettlement({
    ...s, finalised: null, revisions: [...(s.revisions ?? []), { at: now(), by, reason: reason.trim(), before: s.finalised.snapshot }],
    history: event(s, by, 'reopened', reason.trim()), updatedBy: by, updatedAt: now(),
  }, by)
}

export { STATUS_LABEL }
