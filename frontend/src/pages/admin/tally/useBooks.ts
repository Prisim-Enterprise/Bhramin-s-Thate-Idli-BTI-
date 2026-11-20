import { useMemo } from 'react'
import { BRANCHES } from '../../../data/mock'
import { useEntries } from '../../../data/entries'
import { buildVouchers, imprestLedger, ledgerTotals, type GroupId, type Voucher } from '../../../data/books'
import { groupOf, ledgerKey, useCustomLedgers, useManualVouchers, type CustomLedger } from '../../../data/ledgerStore'

export type LedgerInfo = { name: string; group: GroupId; balance: number; custom?: CustomLedger; used: boolean; fixed: boolean }

/** Everything the Gateway needs from the books, worked out once. */
export function useBooks() {
  const entries = useEntries()
  const manual = useManualVouchers()
  const custom = useCustomLedgers()
  return useMemo(() => {
    const vouchers: Voucher[] = buildVouchers(entries, manual, custom)
    const totals = new Map(ledgerTotals(vouchers).map((l) => [ledgerKey(l.ledger), l]))
    // Opening cash of each outlet: its first Imprest Book day.
    const openCash = new Map<string, number>()
    for (const b of BRANCHES) {
      const first = entries.filter((e) => e.branch === b.id).sort((a, z) => a.date.localeCompare(z.date))[0]
      if (first?.opening) openCash.set(ledgerKey(imprestLedger(b.id)), first.opening)
    }
    // Ledgers made by the Imprest Book (sales, outlet cash, partners …) can't be renamed or deleted.
    const fixed = new Set<string>()
    for (const v of vouchers) if (v.entryId) for (const p of v.postings) fixed.add(ledgerKey(p.ledger))
    for (const b of BRANCHES) fixed.add(ledgerKey(imprestLedger(b.id)))

    const byKey = new Map<string, LedgerInfo>()
    const add = (name: string) => {
      const k = ledgerKey(name)
      if (!name.trim() || byKey.has(k)) return
      const c = custom.find((x) => ledgerKey(x.name) === k)
      const t = totals.get(k)
      byKey.set(k, {
        name: c?.name ?? t?.ledger ?? name, group: groupOf(name, custom),
        balance: Math.round(((c?.opening ?? 0) + (openCash.get(k) ?? 0) + (t ? t.dr - t.cr : 0)) * 100) / 100,
        custom: c, used: !!t && (t.dr > 0 || t.cr > 0), fixed: fixed.has(k),
      })
    }
    custom.forEach((c) => add(c.name))
    vouchers.forEach((v) => v.postings.forEach((p) => add(p.ledger)))
    BRANCHES.forEach((b) => add(imprestLedger(b.id)))
    // Ledgers used only by cancelled vouchers still count as used (Tally keeps them).
    for (const m of manual) if (m.cancelled) for (const l of m.lines ?? []) { const x = byKey.get(ledgerKey(l.ledger)); if (x) x.used = true }
    const ledgers = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
    const find = (name: string) => byKey.get(ledgerKey(name)) ?? null
    const lastEntry = vouchers.reduce((m, v) => (v.date > m ? v.date : m), '')
    return { entries, manual, custom, vouchers, ledgers, find, lastEntry }
  }, [entries, manual, custom])
}
export type Books = ReturnType<typeof useBooks>
