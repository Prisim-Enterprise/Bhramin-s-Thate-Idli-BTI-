import { useEffect, useSyncExternalStore } from 'react'
import { API_ON, getMisLayout, putMisLayout } from '../lib/api'
import { billTotal, inMonth, type DayEntry } from './entries'
import { ledgerKey } from './ledgerStore'
import { moneyLines, type Data, type MoneyLine, type Scope } from './analytics'

// MIS-format Profit & Loss, the way management reads it:
//   Sales (Dine-in: cash + UPI · Online: Swiggy, Zomato, others)
//   − Food cost (ingredients + transport inward)            = Gross margin
//   − Fixed overheads (rent: outlet + staff room · salaries · electricity / water)
//   − Variable overheads (conveyance, gas, parcel, repairs …) = Net profit

export type Head = 'food' | 'rent' | 'salaries' | 'utilities' | 'fixed' | 'variable'
export const HEADS: Record<Head, { label: string; section: 'food' | 'fixed' | 'variable' }> = {
  food: { label: 'Food cost', section: 'food' },
  rent: { label: 'Rent', section: 'fixed' },
  salaries: { label: 'Salaries', section: 'fixed' },
  utilities: { label: 'Electricity / Water', section: 'fixed' },
  fixed: { label: 'Other fixed', section: 'fixed' },
  variable: { label: 'Variable', section: 'variable' },
}

/** Where a ledger goes when no one has chosen: by its name and the kind of payment. */
export function defaultHead(l: Pick<MoneyLine, 'ledger' | 'type'>): Head {
  const n = l.ledger.toLowerCase()
  if (/freight|hamali|transport inward|cartage|loading|unloading/.test(n)) return 'food'
  if (l.type === 'purchase') return 'food'
  if (/\brent\b/.test(n)) return 'rent'
  if (l.type === 'salary' || /salar|wages|staff|bonus|incentive|\bpf\b|\besi\b/.test(n)) return 'salaries'
  if (/electric|power|bescom|\bwater\b|tanker|bwssb/.test(n)) return 'utilities'
  return 'variable'
}

/* ---------- The admin's choices, saved on the server (shared by every login) ---------- */

let layout: Record<string, Head> = (() => { try { return JSON.parse(localStorage.getItem('prisim.misLayout') ?? '{}') } catch { return {} } })()
const listeners = new Set<() => void>()
const emit = () => { try { localStorage.setItem('prisim.misLayout', JSON.stringify(layout)) } catch { /* ignore */ } listeners.forEach((l) => l()) }

export function useMisLayout() {
  useEffect(() => {
    if (!API_ON) return
    getMisLayout().then((r) => { layout = r.map as Record<string, Head>; emit() }).catch(() => { /* keep the copy in this browser */ })
  }, [])
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => layout)
}

export async function saveMisLayout(next: Record<string, Head>) {
  if (API_ON) next = (await putMisLayout(next)).map as Record<string, Head>
  layout = next
  emit()
}

export const headOf = (l: Pick<MoneyLine, 'ledger' | 'type'>, map: Record<string, Head>): Head => map[ledgerKey(l.ledger)] ?? defaultHead(l)

/* ---------- The numbers ---------- */

const r2 = (n: number) => Math.round(n * 100) / 100
const group = (lines: MoneyLine[]) => {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.ledger, r2((m.get(l.ledger) ?? 0) + l.amount))
  return [...m].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)
}

/** Food sales split into dine-in (cash, UPI) and online (apps), in proportion to how each day was paid. */
function salesSplit(entries: DayEntry[]) {
  let dineIn = 0
  let online = 0
  for (const e of entries) {
    const billed = billTotal(e)
    const apps = e.swiggy + e.zomato + e.rapido
    const share = billed > 0 ? Math.min(1, apps / billed) : 0
    online += e.sales * share
    dineIn += e.sales * (1 - share)
  }
  return { dineIn: r2(dineIn), online: r2(online) }
}

export function misPnl(d: Data, s: Scope, map: Record<string, Head>) {
  const entries = inMonth(d.entries, s.month).filter((e) => !s.branch || e.branch === s.branch)
  const lines = moneyLines(d, s)
  const split = salesSplit(entries)
  const sum = (f: (e: DayEntry) => number) => r2(entries.reduce((t, e) => t + f(e), 0))
  const container = sum((e) => e.container)
  const roundOff = sum((e) => e.roundOff)
  const discount = sum((e) => e.discount)
  const sales = r2(split.dineIn + split.online + container + roundOff - discount)

  const by = (h: Head) => lines.filter((l) => headOf(l, map) === h)
  const total = (ls: MoneyLine[]) => r2(ls.reduce((t, l) => t + l.amount, 0))
  const foodLines = by('food')
  const food = total(foodLines)
  const gross = r2(sales - food)
  const fixedHeads = (['rent', 'salaries', 'utilities', 'fixed'] as Head[]).map((h) => ({ h, items: group(by(h)), v: total(by(h)) }))
  const fixed = r2(fixedHeads.reduce((t, x) => t + x.v, 0))
  const variableItems = group(by('variable'))
  const variable = total(by('variable'))
  const net = r2(gross - fixed - variable)
  return {
    days: new Set(entries.map((e) => e.date)).size,
    dineIn: split.dineIn, online: split.online, container, roundOff, discount, sales,
    foodItems: group(foodLines), food, gross, fixedHeads, fixed, variableItems, variable, net,
    lines,
  }
}
export type Mis = ReturnType<typeof misPnl>
