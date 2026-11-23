// Aggregator Reconciliation (Zomato): engine, reader, matching, approvals, audit and permissions.
// Run: npm run test:recon   (bundled with esbuild, run with Node's built-in test runner; no extra libraries)
// All amounts here are SAMPLE DATA (see sampleZomato.ts), not BTI's real figures.
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toUnits, rupees, applyPct, inrU } from '../src/data/aggregator/money'
import { DEFAULT_ZRULES, calcZomato, zStatus, type ZStatement } from '../src/data/aggregator/zomatoEngine'
import { csvRows, readZomatoSheets } from '../src/lib/readZomato'
import { saveTerms, termsFor, partnerTermsNow, useSettlements, type Settlement } from '../src/data/settlements'
import {
  addMatch, approveAds, autoMatch, bankMatchesNow, checkImport, finalise, importStatement, removeMatch, reopen, revokeAds, weekState, type WeekState,
} from '../src/data/aggregator/recon'
import { allowed, DEFAULT_MATRIX, KIND_RULES, settlementChangeRefused } from '../../backend/src/permissions'
import { sampleCsv, sampleSheets, SAMPLE_PAYOUT } from './sampleZomato'
import type { BankLine } from '../src/data/banking'

const U = (rs: string) => toUnits(rs)!
const read = () => { const r = readZomatoSheets(sampleSheets()); assert.deepEqual(r.errors, []); return r.statement! }
const NO_RULE = { mode: null, value: null } as const
const settlementsNow = () => JSON.parse(localStorage.getItem('prisim.settlements') ?? '[]') as Settlement[]
void useSettlements // (the store is shared; read through localStorage in these tests)

test('money: exact decimals, Indian grouping, brackets, scientific notation', () => {
  assert.equal(toUnits('1,37,047.0459'), 1370470459)
  assert.equal(toUnits('(218.87)'), -2188700)
  assert.equal(toUnits('6E-4'), 6)
  assert.equal(toUnits('-'), null)
  assert.equal(toUnits('abc'), null)
  assert.equal(rupees(1370470459), 137047.05)
  assert.equal(applyPct(U('11200'), '17'), U('1904'))
  assert.equal(inrU(U('137047.0459')), '₹1,37,047.05')
})

test('Excel layout: reads period, restaurant, rows, ads campaigns', () => {
  const st = read()
  assert.equal(st.from, '2026-08-17'); assert.equal(st.to, '2026-08-23')
  assert.equal(st.resId, '90000001'); assert.equal(st.orders, 101)
  assert.equal(st.rows.find((r) => r.key === 'J')!.total, U('7528.8'))
  assert.equal(st.ads.length, 1); assert.equal(st.ads[0].total, U('1180'))
  assert.ok(st.extra.some((r) => /customer compensation/i.test(r.label)))
})

test('CSV import: the same figures as the Excel layout', () => {
  const r = readZomatoSheets([{ name: 'Payout breakup', rows: csvRows(sampleCsv()) }])
  assert.deepEqual(r.errors, [])
  assert.equal(r.statement!.printedNetPayout, U('7528.8'))
  assert.equal(r.statement!.from, '2026-08-17')
})

test('missing column: refused with the column named', () => {
  const rows = SAMPLE_PAYOUT.map((r, i) => (i === 1 ? r.map((c) => (c === 'Total' ? 'Sum' : c)) : r))
  const r = readZomatoSheets([{ name: 'Payout Breakup', rows }])
  assert.equal(r.statement, null)
  assert.match(r.errors.join(' '), /missing the column\(s\): Total/)
})

test('missing rows and non-numbers: refused, nothing guessed', () => {
  const rows = SAMPLE_PAYOUT.filter((r) => r[1] !== '24').map((r) => (r[1] === '12' ? [...r.slice(0, 3), 'abc', '0', '0'] : r))
  const r = readZomatoSheets([{ name: 'Summary', rows: sampleSheets()[0].rows }, { name: 'Payout Breakup', rows }])
  assert.equal(r.statement, null)
  assert.match(r.errors.join(' '), /Rows missing from the Payout breakup: 24/)
  assert.match(r.errors.join(' '), /Row 12 \(delivered\): “abc” is not an amount/)
})

test('the three dynamic values: 24+25+26, 9+10+11, 21+22+23', () => {
  const c = calcZomato(read(), DEFAULT_ZRULES, NO_RULE, null)
  assert.equal(c.dynamic.growthServices.amount, U('1180'))
  assert.equal(c.dynamic.commissionableValue.amount, U('11200'))
  assert.equal(c.dynamic.otherOrderDeductions.amount, U('25'))
  assert.deepEqual(c.dynamic.growthServices.sources.map((s) => s.item), ['24', '25', '26'])
})

test('expected payable: from the statement structure, equal to Zomato’s printed J; every total checked', () => {
  const c = calcZomato(read(), DEFAULT_ZRULES, NO_RULE, null)
  assert.equal(c.statementPayout.amount, U('7528.8'))
  assert.ok(c.payoutCheck.ok)
  assert.ok(c.structure.every((x) => x.ok))
  // A statement whose rows don't add up is caught (row 2 changed, A left as printed).
  const st = read(); st.rows = st.rows.map((r) => (r.key === '2' ? { ...r, delivered: r.delivered + U('100') } : r))
  const bad = calcZomato(st, DEFAULT_ZRULES, NO_RULE, null)
  assert.ok(!bad.structure.find((x) => x.key === 'A')!.ok)
})

test('commission: percentage rule (over / within) and fixed rule; never assumed when not set', () => {
  const st = read()
  const none = calcZomato(st, DEFAULT_ZRULES, NO_RULE, null)
  assert.equal(none.commission.expected, null)
  assert.match(none.issues.join(' '), /Commission rule not configured/)
  const at17 = calcZomato(st, DEFAULT_ZRULES, { mode: 'pct', value: '17' }, U('1180'))
  assert.equal(at17.commission.charged, U('1900')) // 1,904 − 4 cap discount
  assert.equal(at17.commission.expected, U('1904')); assert.equal(at17.commission.over, 0)
  const at16 = calcZomato(st, DEFAULT_ZRULES, { mode: 'pct', value: '16' }, U('1180'))
  assert.equal(at16.commission.over, U('108')) // 1,900 − 1,792
  const fixed = calcZomato(st, DEFAULT_ZRULES, { mode: 'fixed', value: '1800' }, U('1180'))
  assert.equal(fixed.commission.over, U('100'))
  assert.equal(fixed.recoverable, U('100'))
  assert.equal(fixed.payablePerTerms.amount, U('7628.8'))
})

test('advertisement: not approved → whole amount flagged; part approved → the rest flagged', () => {
  const st = read()
  const none = calcZomato(st, DEFAULT_ZRULES, { mode: 'pct', value: '17' }, null)
  assert.match(none.issues.join(' '), /Advertisement ₹1,180.00 is not approved yet/)
  assert.equal(none.recoverable, U('1180'))
  const part = calcZomato(st, DEFAULT_ZRULES, { mode: 'pct', value: '17' }, U('1000'))
  assert.equal(part.ads.unapproved, U('180'))
  const full = calcZomato(st, DEFAULT_ZRULES, { mode: 'pct', value: '17' }, U('1180'))
  assert.equal(full.recoverable, 0); assert.deepEqual(full.issues, [])
})

test('status: pending, partial, reconciled, mismatch (over-received / broken statement), under review', () => {
  const ok = calcZomato(read(), DEFAULT_ZRULES, { mode: 'pct', value: '17' }, U('1180'))
  const tol = DEFAULT_ZRULES.tolerance
  assert.equal(zStatus(ok, 0, tol, false).status, 'pending')
  assert.equal(zStatus(ok, U('5000'), tol, false).status, 'partial')
  assert.equal(zStatus(ok, U('7528.30'), tol, false).status, 'reconciled') // ₹0.50 inside the ₹1 tolerance
  assert.equal(zStatus(ok, U('7600'), tol, false).status, 'mismatch')
  assert.equal(zStatus(ok, U('7528.8'), tol, true).status, 'review')
  const open = calcZomato(read(), DEFAULT_ZRULES, NO_RULE, null) // money in, but commission / ads not settled
  assert.equal(zStatus(open, U('7528.8'), tol, false).status, 'review')
})

test('configuration history: each week uses the terms in force then', () => {
  saveTerms({ partner: 'zomato', branch: '*', effectiveFrom: '2026-01-05', commissionMode: 'pct', commissionPct: 17, adsMode: null, adsValue: null, note: 'contract 2026', by: 'admin@test', at: '2026-01-05T00:00:00Z' })
  saveTerms({ partner: 'zomato', branch: '*', effectiveFrom: '2026-09-07', commissionMode: 'pct', commissionPct: 18, adsMode: null, adsValue: null, note: 'new rate', by: 'admin@test', at: '2026-09-07T00:00:00Z' })
  const all = partnerTermsNow()
  assert.equal(termsFor(all, 'zomato', 'B8', '2026-08-17')!.commissionPct, 17)
  assert.equal(termsFor(all, 'zomato', 'B8', '2026-09-14')!.commissionPct, 18)
  assert.equal(termsFor(all, 'zomato', 'B8', '2025-12-29'), null)
})

const line = (id: string, date: string, deposit: number, narration: string, ref = ''): BankLine => ({ id, ledger: 'HDFC Bank', date, narration, ref, deposit, withdrawal: 0, balance: null, importedBy: 't', importedAt: '' })
const weekOf = (id: string): WeekState => weekState(settlementsNow().find((s) => s.id === id)! as Settlement & { zomato: ZStatement }, partnerTermsNow(), bankMatchesNow())

test('import: saved with its file hash; same file refused; replacing a week detected', () => {
  const st = read()
  const first = checkImport(st, 'B8', 'hash-1', settlementsNow())
  assert.ok(first.ok)
  const s = importStatement({ st, branch: 'B8', hash: 'hash-1', fileName: 'sample.xlsx', source: 'xlsx', by: 'acc@test', replaces: null, all: partnerTermsNow() })
  assert.equal(s.id, 'zomato:B8:2026-08-17')
  assert.equal(s.gross, 11760); assert.equal(s.statementNet, 7528.8)
  const again = checkImport(st, 'B8', 'hash-1', settlementsNow())
  assert.ok(!again.ok); assert.match(again.problems[0], /already imported/)
  const corrected = checkImport(st, 'B8', 'hash-2', settlementsNow())
  assert.ok(corrected.ok); assert.equal(corrected.replaces?.id, s.id)
  assert.equal(s.history?.[0].action, 'imported')
})

test('advertisement approval: recorded with who / when; withdrawn with a reason; history kept', () => {
  const s = settlementsNow().find((x) => x.id === 'zomato:B8:2026-08-17')! as Settlement & { zomato: ZStatement }
  approveAds(s, 'pct', '10', 'admin@test', 'August campaign')
  let now = settlementsNow().find((x) => x.id === s.id)!
  assert.equal(now.adApprovals!.at(-1)!.amount, U('1176')) // 10% of net order value 11,760
  revokeAds(now, 'admin@test', 'wrong base')
  approveAds(settlementsNow().find((x) => x.id === s.id)! as typeof s, 'amount', '1180', 'admin@test')
  now = settlementsNow().find((x) => x.id === s.id)!
  assert.equal(now.adApprovals!.length, 2); assert.ok(now.adApprovals![0].revoked)
  assert.deepEqual(now.history!.map((h) => h.action), ['imported', 'ads approved', 'ads approval withdrawn', 'ads approved'])
})

test('bank matching: partial, then a second credit completes it (several credits for one week); audit kept', () => {
  const lines = [line('l1', '2026-08-26', 5000, 'NEFT CR ZOMATO LIMITED'), line('l2', '2026-08-27', 2528.8, 'NEFT CR ZOMATO LIMITED'), line('l3', '2026-08-26', 999, 'RENT RECEIVED')]
  const id = 'zomato:B8:2026-08-17'
  addMatch(weekOf(id).s, lines[0], U('5000'), 'acc@test', 'manual', lines)
  assert.equal(weekOf(id).status, 'partial')
  assert.equal(weekOf(id).difference, U('2528.8'))
  // the rest arrives: matched on evidence (one Zomato credit for exactly what's still expected)
  const n = autoMatch([weekOf(id)], lines, 'system')
  assert.equal(n, 1)
  const w = weekOf(id)
  assert.equal(w.received, U('7528.8')); assert.equal(w.status, 'reconciled')
  assert.equal(settlementsNow().find((x) => x.id === id)!.received, 7528.8) // the Reconcile page reads this
  assert.ok(w.s.history!.filter((h) => h.action === 'bank matched').length === 2)
  // the rent credit is never touched
  assert.ok(!bankMatchesNow().some((m) => m.bankLineId === 'l3'))
})

test('one credit for several weeks; over-allocating refused; nothing matched without evidence', () => {
  const st2 = read(); st2.from = '2026-08-24'; st2.to = '2026-08-30'
  importStatement({ st: st2, branch: 'B8', hash: 'hash-3', fileName: 'sample2.xlsx', source: 'xlsx', by: 'acc@test', replaces: null, all: partnerTermsNow() })
  const st3 = read(); st3.from = '2026-08-24'; st3.to = '2026-08-30'
  importStatement({ st: st3, branch: 'B4', hash: 'hash-4', fileName: 'sample3.xlsx', source: 'xlsx', by: 'acc@test', replaces: null, all: partnerTermsNow() })
  const both = line('l4', '2026-09-02', 15057.6, 'NEFT CR ZOMATO LIMITED') // two weeks paid in one credit
  const lines = [both]
  // an amount that matches neither week alone is not matched automatically
  assert.equal(autoMatch([weekOf('zomato:B8:2026-08-24'), weekOf('zomato:B4:2026-08-24')], lines, 'system'), 0)
  addMatch(weekOf('zomato:B8:2026-08-24').s, both, U('7528.8'), 'acc@test', 'manual', lines)
  assert.throws(() => addMatch(weekOf('zomato:B4:2026-08-24').s, both, U('8000'), 'acc@test', 'manual', lines), /Only ₹7,528.80 of this credit/)
  addMatch(weekOf('zomato:B4:2026-08-24').s, both, U('7528.8'), 'acc@test', 'manual', lines)
  assert.equal(weekOf('zomato:B8:2026-08-24').received, U('7528.8'))
  assert.equal(weekOf('zomato:B4:2026-08-24').received, U('7528.8'))
})

test('mismatch: more received than expected is never reconciled', () => {
  const id = 'zomato:B4:2026-08-24'
  const extra = line('l5', '2026-09-03', 100, 'NEFT CR ZOMATO LIMITED')
  addMatch(weekOf(id).s, extra, U('100'), 'acc@test', 'manual', [extra])
  assert.equal(weekOf(id).status, 'mismatch')
  const m = bankMatchesNow().find((x) => x.bankLineId === 'l5')!
  removeMatch(weekOf(id).s, m, 'acc@test', [extra], 'wrong week')
  assert.equal(weekOf(id).s.history?.at(-1)?.action, 'bank unmatched')
  assert.match(weekOf(id).s.history!.at(-1)!.detail, /wrong week/)
})

test('finalise: only a reconciled week; locked; reopening needs a reason and keeps a revision', () => {
  const id = 'zomato:B8:2026-08-17'
  finalise(weekOf(id), 'admin@test')
  const w = weekOf(id)
  assert.ok(w.s.finalised); assert.equal(w.s.finalised!.snapshot.received, U('7528.8'))
  assert.throws(() => approveAds(w.s as Settlement & { zomato: ZStatement }, 'amount', '1', 'x'), /finalised/)
  assert.throws(() => addMatch(w.s, line('l6', '2026-08-28', 1, 'ZOMATO'), 1, 'x', 'manual', []), /finalised/)
  assert.throws(() => reopen(w.s, 'admin@test', 'no'), /reason/)
  reopen(w.s, 'admin@test', 'Zomato sent a corrected statement')
  const after = weekOf(id).s
  assert.equal(after.finalised, null); assert.equal(after.revisions!.length, 1)
  assert.equal(after.revisions![0].before.received, U('7528.8'))
  const pending = weekOf('zomato:B4:2026-08-24')
  if (pending.status !== 'reconciled') assert.throws(() => finalise(pending, 'admin@test'), /Only a reconciled week/)
})

test('server: permissions per kind (configuration admin-only, matching by accounts), and the finalised lock', () => {
  const M = DEFAULT_MATRIX
  assert.ok(!allowed(M, 'accountant', KIND_RULES.partnerTerms.write)) // configuration: admins only
  assert.ok(allowed(M, 'admin', KIND_RULES.partnerTerms.write))
  assert.ok(allowed(M, 'accountant', KIND_RULES.bankMatches.write))
  assert.ok(!allowed(M, 'cashier', KIND_RULES.bankMatches.write))
  assert.ok(!allowed(M, 'manager', KIND_RULES.settlements.write))
  const fin = { gross: 100, deductions: [], received: 50, finalised: { at: 't1' }, revisions: [] }
  assert.equal(settlementChangeRefused(fin, { ...fin, note: 'x' }, false), null) // a note on a finalised week is fine
  assert.match(settlementChangeRefused(fin, { ...fin, received: 60 }, true)!, /finalised/)
  assert.match(settlementChangeRefused(fin, { ...fin, finalised: null, revisions: [] }, true)!, /reason/)
  assert.match(settlementChangeRefused(fin, { ...fin, finalised: null, revisions: [{ reason: 'fix' }] }, false)!, /approve/)
  assert.equal(settlementChangeRefused(fin, { ...fin, finalised: null, revisions: [{ reason: 'corrected statement' }] }, true), null)
  assert.equal(settlementChangeRefused(null, { gross: 1 }, false), null)
})
