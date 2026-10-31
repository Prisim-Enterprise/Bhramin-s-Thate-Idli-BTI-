import { imprestLedger } from './books'
import { inMonth, guessType } from './entries'
import { debitLines, groupOf, ledgerKey, reportOf, sides, type ReceiptFile } from './ledgerStore'
import type { Data, Scope } from './analytics'

// Petty expenses: small running costs paid from a branch's cash (imprest), reported by the branch manager.
// They come from two places:
//  - petty expense journals entered by managers (Dr expense ledger, Cr <Branch> - Imprest)
//  - expense lines in the day's Imprest Book (uploaded PDF or typed day entry)

export type PettyLine = {
  key: string
  date: string
  branch: string
  ledger: string
  amount: number
  note: string
  by: string // email of the person who entered it
  at: string // when it was entered (ISO)
  from: 'Petty journal' | 'Imprest Book'
  voucherId?: string
  receipt?: ReceiptFile
}

export function pettyLines(d: Data, s: Scope = {}): PettyLine[] {
  const okBranch = (b: string) => !s.branch || b === s.branch
  const out: PettyLine[] = []
  for (const e of inMonth(d.entries, s.month)) {
    if (!okBranch(e.branch)) continue
    e.payouts.forEach((p, i) => {
      if (p.type !== 'expense' || !p.amount) return
      out.push({ key: `${e.id}:${i}`, date: e.date, branch: e.branch, ledger: p.ledger, amount: p.amount, note: '',
        by: e.addedBy ?? '', at: e.addedAt ?? e.savedAt, from: 'Imprest Book' })
    })
  }
  for (const m of d.manual) {
    if ((s.month && !m.date.startsWith(s.month)) || !okBranch(m.branch)) continue
    const cash = ledgerKey(imprestLedger(m.branch))
    const paidFromCash = m.lines?.length ? m.lines.some((l) => l.cr && ledgerKey(l.ledger) === cash) : ledgerKey(sides(m, imprestLedger).cr) === cash
    if (!paidFromCash) continue
    debitLines(m, imprestLedger).forEach((l, i) => {
      if (reportOf(groupOf(l.ledger, d.custom)) !== 'expense' || !l.dr) return
      out.push({ key: `${m.id}:${i}`, date: m.date, branch: m.branch, ledger: l.ledger, amount: l.dr, note: m.narration ?? '',
        by: m.addedBy, at: m.addedAt, from: 'Petty journal', voucherId: m.id, receipt: m.receipt })
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? '').localeCompare(a.at ?? ''))
}

/** Expense ledgers people can pick from: known Imprest Book ones plus any already used. */
export function pettyLedgers(d: Data): string[] {
  const names = new Map<string, string>()
  const add = (n: string) => { if (n && !names.has(ledgerKey(n))) names.set(ledgerKey(n), n) }
  ;['Conveyance', 'Transportation', 'Staff - Lunch Exp', 'Water Tanker', 'Parcel and Disposables Items', 'Cleaning Expenses', 'Repairs & Maintenance',
    'Gas Expenses', 'Printing & Stationery', 'Miscellaneous Expenses'].forEach(add)
  d.entries.forEach((e) => e.payouts.filter((p) => p.type === 'expense').forEach((p) => add(p.ledger)))
  d.custom.filter((c) => c.group === 'indirectExp' || c.group === 'directExp').forEach((c) => add(c.name))
  return [...names.values()].filter((n) => guessType(n) === 'expense').sort((a, b) => a.localeCompare(b))
}
