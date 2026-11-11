import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { cloudStore } from './cloudStore'
import { itemKey, useClosingCounts, usePostedBills, type ClosingCount } from './inventory'
import { BRANCHES, type Bill } from './mock'
import { isTransportInward } from './analytics'
import { API_ON, getCkSettings, putCkSettings, type CkItemSetting } from '../lib/api'

// Centre Kitchen (branch CK): everything that comes in and goes out.
//  In:  bills posted for Central Kitchen (automatic) + goods received without a bill
//  Out: goods issued to outlets (against an indent, or directly)
//  Stock on hand = last closing count + in − out since then (or all in − out if never counted)

export const CK = 'CK'
export type MoveLine = { item: string; unit: string; qty: number; rate: number }
export type StockMove = {
  id: string
  kind: 'in' | 'out'
  branch: 'CK'
  date: string
  to?: string // outlet the goods went to (out)
  from?: string // who delivered (in, without a bill)
  lines: MoveLine[]
  indentId?: string
  note: string
  addedBy: string
  addedAt: string
}

export type IndentLine = { item: string; unit: string; qty: number; sent: number }
export type Indent = {
  id: string
  branch: string // outlet asking
  date: string // needed by
  lines: IndentLine[]
  status: 'open' | 'part' | 'done' | 'cancelled'
  note: string
  addedBy: string
  addedAt: string
  updatedBy?: string
  updatedAt?: string
}

const moves = cloudStore<StockMove>('prisim.stockMoves', { kind: 'stockMoves', idOf: (m) => m.id })
const indents = cloudStore<Indent>('prisim.indents', { kind: 'indents', idOf: (i) => i.id })
export const useStockMoves = moves.use
export const useIndents = indents.use

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r2 = (n: number) => Math.round(n * 100) / 100
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function addMove(m: Omit<StockMove, 'id' | 'branch'>) {
  const move: StockMove = { ...m, id: newId(m.kind === 'in' ? 'IN' : 'OUT'), branch: CK, lines: m.lines.filter((l) => l.item.trim() && l.qty > 0) }
  moves.set([move, ...moves.get()])
  // Issuing against an indent marks what was sent.
  if (move.kind === 'out' && move.indentId) {
    const ind = indents.get().find((i) => i.id === move.indentId)
    if (ind) {
      const lines = ind.lines.map((l) => {
        const sent = move.lines.filter((x) => itemKey(x.item, x.unit) === itemKey(l.item, l.unit)).reduce((s, x) => s + x.qty, 0)
        return { ...l, sent: r3(l.sent + sent) }
      })
      const status = lines.every((l) => l.sent >= l.qty) ? 'done' : lines.some((l) => l.sent > 0) ? 'part' : ind.status
      saveIndent({ ...ind, lines, status, updatedBy: move.addedBy, updatedAt: move.addedAt })
    }
  }
  return move
}
export function deleteMove(id: string) { moves.set(moves.get().filter((m) => m.id !== id)) }

export function raiseIndent(i: Omit<Indent, 'id' | 'status'>) {
  const ind: Indent = { ...i, id: newId('IND'), status: 'open', lines: i.lines.filter((l) => l.item.trim() && l.qty > 0).map((l) => ({ ...l, sent: 0 })) }
  indents.set([ind, ...indents.get()])
  return ind
}
export function saveIndent(i: Indent) { indents.set(indents.get().map((x) => (x.id === i.id ? i : x))) }

/* ---------- Reorder levels, set in the Control Panel (shared by everyone) ---------- */

let levels: Record<string, CkItemSetting> = (() => { try { return JSON.parse(localStorage.getItem('prisim.ckLevels') ?? '{}') } catch { return {} } })()
const lv = new Set<() => void>()
const emitLevels = () => { try { localStorage.setItem('prisim.ckLevels', JSON.stringify(levels)) } catch { /* ignore */ } lv.forEach((l) => l()) }
export function useReorderLevels() {
  useEffect(() => { if (API_ON) getCkSettings().then((r) => { levels = r.items; emitLevels() }).catch(() => { /* keep local copy */ }) }, [])
  return useSyncExternalStore((l) => { lv.add(l); return () => { lv.delete(l) } }, () => levels)
}
export async function saveReorderLevels(next: Record<string, CkItemSetting>) {
  if (API_ON) next = (await putCkSettings(next)).items
  levels = next
  emitLevels()
}

/* ---------- The numbers ---------- */

export type CkFlow = {
  key: string; date: string; kind: 'in' | 'out'; party: string; lines: MoveLine[]; value: number
  source: 'Bill' | 'Received' | 'Issued'; ref: string; by: string; at: string; note: string; indentId?: string; moveId?: string
}

/** Every movement in and out of the Centre Kitchen, newest first. */
export const ckFlows = (bills: Bill[], all: StockMove[]) => branchFlows(CK, bills, all)

/**
 * Goods in and out of one location, newest first.
 *  - Centre Kitchen: its posted bills + goods received (in), goods issued to outlets (out).
 *  - An outlet: its own posted bills + what the Centre Kitchen sent it (in). What it uses shows up at its next closing count.
 */
export function branchFlows(branch: string, bills: Bill[], all: StockMove[]): CkFlow[] {
  const out: CkFlow[] = []
  for (const b of bills) {
    if (b.branch !== branch) continue
    // Freight / hamali lines are charges, not goods: they don't go into stock.
    const lines = b.lines.filter((l) => l.item.trim() && l.qty > 0 && !isTransportInward(l.ledger ?? '') && !isTransportInward(l.item))
      .map((l) => ({ item: l.item, unit: l.unit, qty: l.qty, rate: l.rate }))
    out.push({ key: 'bill:' + b.id, date: b.date, kind: 'in', party: b.vendor || 'Vendor', lines, value: r2(lines.reduce((s, l) => s + l.qty * l.rate, 0)),
      source: 'Bill', ref: b.id, by: b.uploadedBy, at: b.uploadedAt ?? '', note: b.invoiceNo ? `Bill no. ${b.invoiceNo}` : '' })
  }
  for (const m of all) {
    if (branch !== CK) {
      // An outlet receives what the Centre Kitchen issued to it.
      if (m.kind !== 'out' || m.to !== branch) continue
      out.push({ key: 'recv:' + m.id, date: m.date, kind: 'in', party: 'Centre Kitchen', lines: m.lines, value: r2(m.lines.reduce((s, l) => s + l.qty * l.rate, 0)),
        source: 'Received', ref: m.id, by: m.addedBy, at: m.addedAt, note: m.note, indentId: m.indentId })
      continue
    }
    out.push({ key: m.id, date: m.date, kind: m.kind, party: m.kind === 'in' ? (m.from || 'Received') : (m.to ?? ''), lines: m.lines,
      value: r2(m.lines.reduce((s, l) => s + l.qty * l.rate, 0)), source: m.kind === 'in' ? 'Received' : 'Issued', ref: m.id,
      by: m.addedBy, at: m.addedAt, note: m.note, indentId: m.indentId, moveId: m.id })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.at || '').localeCompare(a.at || ''))
}

export type StockItem = { key: string; item: string; unit: string; counted: number | null; countedOn: string | null; inQty: number; outQty: number; onHand: number; rate: number; value: number; lastIn: number /* size of the latest delivery */ }

/** What a location (the Centre Kitchen by default) holds now, item by item. */
export function ckStock(flows: CkFlow[], counts: ClosingCount[], branch = CK): StockItem[] {
  const last = counts.filter((c) => c.branch === branch).sort((a, b) => b.date.localeCompare(a.date))[0]
  const map = new Map<string, StockItem>()
  const row = (item: string, unit: string) => {
    const k = itemKey(item, unit)
    if (!map.has(k)) map.set(k, { key: k, item: item.trim(), unit: unit || 'nos', counted: null, countedOn: null, inQty: 0, outQty: 0, onHand: 0, rate: 0, value: 0, lastIn: 0 })
    return map.get(k)!
  }
  last?.lines.forEach((l) => { const r = row(l.item, l.unit); r.counted = l.qty; r.countedOn = last.date })
  // Latest purchase rate per item (from anything received), for valuing stock and issues.
  for (const f of [...flows].reverse()) if (f.kind === 'in') for (const l of f.lines) { const r = row(l.item, l.unit); if (l.rate) r.rate = l.rate; if (l.qty > 0) r.lastIn = l.qty }
  for (const f of flows) {
    if (last && f.date <= last.date) continue // already inside the count
    for (const l of f.lines) { const r = row(l.item, l.unit); if (f.kind === 'in') r.inQty = r3(r.inQty + l.qty); else r.outQty = r3(r.outQty + l.qty) }
  }
  for (const r of map.values()) { r.onHand = r3((r.counted ?? 0) + r.inQty - r.outQty); r.value = r2(Math.max(0, r.onHand) * r.rate) }
  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item))
}

/** Everything the Centre Kitchen screens need, worked out once. */
export function useCentreKitchen() {
  const bills = usePostedBills()
  const all = useStockMoves()
  const counts = useClosingCounts()
  const ind = useIndents()
  const levelsNow = useReorderLevels()
  return useMemo(() => {
    const flows = ckFlows(bills, all)
    const stock = ckStock(flows, counts)
    const low = stock.filter((s) => lowState(s, levelsNow[s.key]?.reorder))
    return { flows, stock, low, indents: ind, levels: levelsNow, counts }
  }, [bills, all, counts, ind, levelsNow])
}

/** Latest rate for an item, for valuing an issue. */
export const rateOf = (stock: StockItem[], item: string, unit: string) => stock.find((s) => s.key === itemKey(item, unit))?.rate ?? 0

/* ---------- Running low ---------- */

/** Without a reorder level, an item is "running low" below this share of its latest delivery. */
export const LOW_SHARE = 0.25
export type Low = { why: 'out' | 'level' | 'share'; limit: number }

/**
 * Is this item running low?
 *  - nothing left (0 or less): finished
 *  - a reorder level is set: at or below it
 *  - otherwise: below 25% of the latest delivery
 */
export function lowState(s: StockItem, level?: number): Low | null {
  if (s.onHand <= 0) return { why: 'out', limit: 0 }
  if (level != null && level > 0) return s.onHand <= level ? { why: 'level', limit: level } : null
  if (s.lastIn > 0) { const limit = r3(s.lastIn * LOW_SHARE); return s.onHand <= limit ? { why: 'share', limit } : null }
  return null
}

export type StockAlert = StockItem & Low & { branch: string; id: string }

/** Stock on hand at one location. */
export function stockAt(branch: string, bills: Bill[], all: StockMove[], counts: ClosingCount[]) {
  return ckStock(branchFlows(branch, bills, all), counts, branch)
}

/** Items running low at every location (reorder levels apply to the Centre Kitchen). */
export function stockAlerts(bills: Bill[], all: StockMove[], counts: ClosingCount[], lv: Record<string, CkItemSetting>): StockAlert[] {
  const out: StockAlert[] = []
  for (const b of BRANCHES) {
    for (const s of stockAt(b.id, bills, all, counts)) {
      const low = lowState(s, b.id === CK ? lv[s.key]?.reorder : undefined)
      if (low) out.push({ ...s, ...low, branch: b.id, id: b.id + '|' + s.key })
    }
  }
  return out.sort((a, b) => (a.why === 'out' ? 0 : 1) - (b.why === 'out' ? 0 : 1) || a.item.localeCompare(b.item))
}

export function useStockAlerts(): StockAlert[] {
  const bills = usePostedBills()
  const all = useStockMoves()
  const counts = useClosingCounts()
  const lv = useReorderLevels()
  return useMemo(() => stockAlerts(bills, all, counts, lv), [bills, all, counts, lv])
}
