import { useMemo } from 'react'
import { cloudStore } from './cloudStore'
import { STOCK, type Bill } from './mock'
import { useBills } from './billStore'
import { useManualVouchers } from './ledgerStore'

// Closing stock counted at each outlet at the end of a day, and the stock figures worked out from it:
// opening (last count before the period) + bought (posted bills) − closing (last count in the period) = used.

export type CountLine = { item: string; unit: string; qty: number }
export type ClosingCount = {
  id: string // branch:date
  branch: string
  date: string // yyyy-mm-dd
  lines: CountLine[]
  addedBy: string
  addedAt: string
}

const counts = cloudStore<ClosingCount>('prisim.closingStock', { kind: 'closingStock', idOf: (c) => c.id })
export const useClosingCounts = counts.use

export function saveClosingCount(c: Omit<ClosingCount, 'id'>) {
  const id = `${c.branch}:${c.date}`
  const lines = c.lines.filter((l) => l.item.trim()).map((l) => ({ ...l, item: l.item.trim() }))
  return counts.set([{ ...c, id, lines }, ...counts.get().filter((x) => x.id !== id)])
}

export const itemKey = (item: string, unit = '') => item.trim().toLowerCase().replace(/\s+/g, ' ') + '|' + unit.trim().toLowerCase()

/** Bills that are posted to Account Books (their voucher still exists). */
export function usePostedBills(): Bill[] {
  const bills = useBills()
  const vouchers = useManualVouchers()
  return useMemo(() => {
    const ids = new Set(vouchers.map((v) => v.id))
    return bills.filter((b) => b.voucherId && ids.has(b.voucherId))
  }, [bills, vouchers])
}

/** Every raw material we know: kitchen stock list, items on posted bills, and items counted before. */
export function rawMaterials(posted: Bill[], all: ClosingCount[]): { item: string; unit: string }[] {
  const m = new Map<string, { item: string; unit: string }>()
  const add = (item: string, unit: string) => { if (item.trim() && !m.has(itemKey(item, unit))) m.set(itemKey(item, unit), { item: item.trim(), unit: unit || 'nos' }) }
  STOCK.forEach((s) => add(s.item, s.unit))
  posted.forEach((b) => b.lines.forEach((l) => add(l.item, l.unit)))
  all.forEach((c) => c.lines.forEach((l) => add(l.item, l.unit)))
  return [...m.values()].sort((a, b) => a.item.localeCompare(b.item))
}

export type StockRow = {
  item: string; unit: string; ledger: string
  opening: number | null; bought: number; boughtValue: number; total: number
  closing: number | null; used: number | null; lastRate: number | null
}

/** Stock summary for a date range and branch (or all branches). */
export function stockSummary(posted: Bill[], all: ClosingCount[], from: string, to: string, branch = ''): StockRow[] {
  const branches = [...new Set([...posted.map((b) => b.branch), ...all.map((c) => c.branch)])].filter((b) => !branch || b === branch)
  const rows = new Map<string, StockRow>()
  const row = (item: string, unit: string) => {
    const k = itemKey(item, unit)
    if (!rows.has(k)) rows.set(k, { item: item.trim(), unit: unit || 'nos', ledger: '', opening: null, bought: 0, boughtValue: 0, total: 0, closing: null, used: null, lastRate: null })
    return rows.get(k)!
  }
  const r2 = (n: number) => Math.round(n * 1000) / 1000

  // Bought: posted bills in the range.
  for (const b of posted) {
    if ((branch && b.branch !== branch) || b.date < from || b.date > to) continue
    for (const l of b.lines) {
      if (!l.item.trim()) continue
      const r = row(l.item, l.unit)
      r.bought = r2(r.bought + l.qty)
      r.boughtValue = Math.round((r.boughtValue + l.qty * l.rate) * 100) / 100
      r.lastRate = l.rate
      r.ledger ||= l.ledger ?? ''
    }
  }
  // Opening = each branch's last count before the range; closing = its last count inside the range.
  for (const br of branches) {
    const mine = all.filter((c) => c.branch === br).sort((a, b) => a.date.localeCompare(b.date))
    const before = [...mine].reverse().find((c) => c.date < from)
    const inside = [...mine].reverse().find((c) => c.date >= from && c.date <= to)
    before?.lines.forEach((l) => { const r = row(l.item, l.unit); r.opening = r2((r.opening ?? 0) + l.qty) })
    inside?.lines.forEach((l) => { const r = row(l.item, l.unit); r.closing = r2((r.closing ?? 0) + l.qty) })
  }
  for (const r of rows.values()) {
    r.total = r2((r.opening ?? 0) + r.bought)
    r.used = r.closing == null ? null : r2(r.total - r.closing)
  }
  return [...rows.values()].sort((a, b) => a.item.localeCompare(b.item))
}
