import { cloudStore } from './cloudStore'
import { ledgerKey } from './ledgerStore'
import type { VchType, Voucher } from './books'
import type { StatementLine } from '../lib/readBankStatement'

// Bank reconciliation, as in Tally (Banking → Bank Reconciliation):
//  - each bank entry in the books gets a Bank Date once it shows on the bank statement
//  - an uploaded statement is matched to the books automatically (same amount and direction, close dates)
//  - what's left over: entries not yet in the bank, and statement lines not yet in the books

export type BankReco = { id: string; voucherId: string; ledger: string; bankDate: string; lineId?: string; by: string; at: string }
export type BankLine = StatementLine & { id: string; ledger: string; file?: string; importedBy: string; importedAt: string; ignored?: boolean }

const recos = cloudStore<BankReco>('prisim.bankRecos', { kind: 'bankRecos', idOf: (r) => r.id })
const lines = cloudStore<BankLine>('prisim.bankLines', { kind: 'bankLines', idOf: (l) => l.id })
export const useBankRecos = recos.use
export const useBankLines = lines.use
export const bankLinesNow = () => lines.get()

/** Opening BRS (Tally): cheques issued or deposited before the books start that the bank hadn't cleared by then.
 *  They are already inside the bank ledger's opening balance, so they only show in the reconciliation. */
export type OpeningItem = { id: string; ledger: string; date: string; particulars: string; instrumentNo?: string; dir: 'dep' | 'wd'; amount: number; by: string; at: string }
const opening = cloudStore<OpeningItem>('prisim.bankOpening', { kind: 'bankOpening', idOf: (o) => o.id })
export const useBankOpening = opening.use
export function addOpeningItem(o: Omit<OpeningItem, 'id' | 'at'>) {
  opening.set([...opening.get(), { ...o, id: `ob-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() }])
}
export function deleteOpeningItem(id: string) {
  opening.set(opening.get().filter((o) => o.id !== id))
  recos.set(recos.get().filter((r) => r.voucherId !== id))
}

const r2 = (n: number) => Math.round(n * 100) / 100
const hash = (s: string) => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h.toString(36) }
export const recoId = (voucherId: string, ledger: string) => `${voucherId}|${ledgerKey(ledger)}`
/** The same statement line uploaded twice gets the same id, so it isn't added twice. */
export const lineId = (ledger: string, l: StatementLine) => `${ledgerKey(ledger)}|${l.date}|${hash(`${l.withdrawal}|${l.deposit}|${l.balance ?? ''}|${l.narration}|${l.ref}`)}`
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

/* ---------- Bank entries in the books ---------- */

export type BankEntry = { v: Voucher; amount: number; dir: 'dep' | 'wd'; reco?: BankReco; opening?: boolean }

/** Opening BRS items as bank entries, so they get a bank date and can be matched like any voucher. */
export function openingEntries(items: OpeningItem[], ledger: string, all: BankReco[]): BankEntry[] {
  const k = ledgerKey(ledger)
  const byId = new Map(all.map((r) => [r.id, r]))
  return items.filter((o) => ledgerKey(o.ledger) === k).map((o) => ({
    v: { id: o.id, no: 0, typeNo: 0, date: o.date, branch: '', type: 'Opening BRS' as VchType, postings: [], party: o.particulars, refNo: o.instrumentNo, narration: o.particulars },
    amount: o.amount, dir: o.dir, reco: byId.get(recoId(o.id, ledger)), opening: true,
  }))
}

/** Tally's rule: the bank can't clear an entry before the day it was made. */
export function bankDateError(entryDate: string, bankDate: string) {
  return bankDate && bankDate < entryDate ? 'The bank date cannot be before the voucher date.' : null
}

/** Ledger to suggest for a statement line that isn't in the books: bank charges and interest are the usual ones. */
export function guessBankLedger(l: { narration: string; deposit: number }) {
  const t = l.narration.toLowerCase()
  if (!l.deposit && /charge|chrg|chg|fee|commission|sms|amc|min(imum)? bal|gst on|service tax|penal|debit card|annual/.test(t)) return 'Bank Charges'
  if (l.deposit && /\bint(erest)?\b|\bint\.? ?(cr|pd|paid)\b|sb int/.test(t)) return 'Bank Interest Received'
  return ''
}


/** Every posting to this bank ledger: a debit is money in (deposit), a credit is money out (withdrawal). */
export function bankEntries(vouchers: Voucher[], ledger: string, all: BankReco[]): BankEntry[] {
  const k = ledgerKey(ledger)
  const byId = new Map(all.map((r) => [r.id, r]))
  const out: BankEntry[] = []
  for (const v of vouchers) {
    if (v.cancelled) continue
    const ps = v.postings.filter((p) => ledgerKey(p.ledger) === k)
    const net = r2(ps.reduce((t, p) => t + p.dr - p.cr, 0))
    if (!net) continue
    out.push({ v, amount: Math.abs(net), dir: net > 0 ? 'dep' : 'wd', reco: byId.get(recoId(v.id, ledger)) })
  }
  return out
}

/* ---------- The reconciliation statement ---------- */

const linesInUse = (entries: BankEntry[]) => new Set(entries.map((e) => e.reco?.lineId).filter(Boolean) as string[])

export function reconcile(entries: BankEntry[], stmt: BankLine[], all: BankReco[], opening: number, asOn: string) {
  const upto = entries.filter((e) => e.v.date <= asOn)
  const books = r2(opening + upto.filter((e) => !e.opening).reduce((t, e) => t + (e.dir === 'dep' ? e.amount : -e.amount), 0))
  const open = upto.filter((e) => !e.reco || e.reco.bankDate > asOn)
  const notInBankDep = r2(open.filter((e) => e.dir === 'dep').reduce((t, e) => t + e.amount, 0))
  const notInBankWd = r2(open.filter((e) => e.dir === 'wd').reduce((t, e) => t + e.amount, 0))
  const asPerBank = r2(books - notInBankDep + notInBankWd)
  // Only lines matched to an entry that still exists: a deleted or cancelled voucher frees its statement line.
  const matched = linesInUse(entries)
  const inScope = stmt.filter((l) => l.date <= asOn)
  const extra = inScope.filter((l) => !l.ignored && !matched.has(l.id))
  const notInBooksDep = r2(extra.reduce((t, l) => t + l.deposit, 0))
  const notInBooksWd = r2(extra.reduce((t, l) => t + l.withdrawal, 0))
  const withBal = inScope.filter((l) => l.balance != null)
  const statementClosing = withBal.length ? withBal[withBal.length - 1].balance! : null
  const expected = r2(asPerBank + notInBooksDep - notInBooksWd)
  return {
    books, notInBankDep, notInBankWd, asPerBank, notInBooksDep, notInBooksWd, open: open.length, extra,
    statementClosing, expected, difference: statementClosing == null ? null : r2(statementClosing - expected),
  }
}

/* ---------- Matching ---------- */

/**
 * Match statement lines to book entries: same direction, same amount to the paisa, statement date from 3 days
 * before to 15 days after the voucher date (cheques take time). Nearest date wins; a reference or party name in
 * the narration breaks a tie. Each line and each entry is used once.
 */
export function autoMatch(entries: BankEntry[], stmt: BankLine[], all: BankReco[]) {
  const usedLines = linesInUse(entries)
  const pool = entries.filter((e) => !e.reco)
  const found: { e: BankEntry; l: BankLine }[] = []
  for (const l of [...stmt].sort((a, b) => a.date.localeCompare(b.date))) {
    if (l.ignored || usedLines.has(l.id)) continue
    const dir = l.deposit ? 'dep' : 'wd'
    const amt = l.deposit || l.withdrawal
    const text = `${l.narration} ${l.ref}`.toLowerCase()
    const score = (e: BankEntry) => Math.abs(days(l.date, e.v.date)) * 10 - ([e.v.refNo, e.v.party, e.v.narration].some((x) => x && x.length > 3 && text.includes(x.toLowerCase().slice(0, 12))) ? 5 : 0)
    const best = pool
      .filter((e) => e.dir === dir && Math.abs(e.amount - amt) < 0.005 && days(l.date, e.v.date) >= -3 && days(l.date, e.v.date) <= 15)
      .sort((a, b) => score(a) - score(b))[0]
    if (!best) continue
    found.push({ e: best, l })
    pool.splice(pool.indexOf(best), 1)
  }
  return found
}

/* ---------- Saving ---------- */

export function saveMatches(ledger: string, found: { e: BankEntry; l: BankLine }[], by: string) {
  if (!found.length) return
  const at = new Date().toISOString()
  const add = found.map(({ e, l }) => ({ id: recoId(e.v.id, ledger), voucherId: e.v.id, ledger, bankDate: l.date, lineId: l.id, by, at }))
  const ids = new Set(add.map((r) => r.id))
  recos.set([...recos.get().filter((r) => !ids.has(r.id)), ...add])
}

/** Type or clear a voucher's bank date by hand (as in Tally's Bank Date column). */
export function setBankDate(voucherId: string, ledger: string, bankDate: string | null, by: string, lineIdOf?: string) {
  const id = recoId(voucherId, ledger)
  const rest = recos.get().filter((r) => r.id !== id)
  recos.set(bankDate ? [...rest, { id, voucherId, ledger, bankDate, lineId: lineIdOf, by, at: new Date().toISOString() }] : rest)
}

/** Add a statement's lines for this bank. Lines already uploaded are skipped. */
export function importLines(ledger: string, stmt: StatementLine[], file: string, by: string) {
  const have = new Set(lines.get().map((l) => l.id))
  // The same line on two overlapping statements can be printed differently (a description cut by a page break),
  // so a line with its running balance is also known by date, amounts and balance: that balance makes it unique.
  const fp = (l: Pick<StatementLine, 'date' | 'withdrawal' | 'deposit' | 'balance'>) => l.balance == null ? null : `${ledgerKey(ledger)}|${l.date}|${l.withdrawal}|${l.deposit}|${l.balance}`
  const haveFp = new Set(lines.get().filter((l) => ledgerKey(l.ledger) === ledgerKey(ledger)).map(fp).filter(Boolean) as string[])
  const at = new Date().toISOString()
  const fresh = stmt.map((l) => ({ ...l, id: lineId(ledger, l), ledger, file, importedBy: by, importedAt: at }))
    .filter((l) => !have.has(l.id) && !(fp(l) && haveFp.has(fp(l)!)))
  // Two identical lines on the same day (two equal charges) both stay.
  const seen = new Map<string, number>()
  for (const l of fresh) { const n = (seen.get(l.id) ?? 0) + 1; seen.set(l.id, n); if (n > 1) l.id += '#' + n }
  if (fresh.length) lines.set([...lines.get(), ...fresh])
  return { added: fresh.length, skipped: stmt.length - fresh.length }
}

export function ignoreLine(id: string, ignored: boolean) {
  lines.set(lines.get().map((l) => (l.id === id ? { ...l, ignored: ignored || undefined } : l)))
}
export function deleteLine(id: string) {
  lines.set(lines.get().filter((l) => l.id !== id))
  recos.set(recos.get().map((r) => (r.lineId === id ? { ...r, lineId: undefined } : r)))
}
