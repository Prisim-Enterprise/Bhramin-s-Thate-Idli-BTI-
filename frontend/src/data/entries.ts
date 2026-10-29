import { cloudStore } from './cloudStore'

// Day entries for a branch, in the same shape as the Tally Imprest Book.
// Saved in this browser until the backend (Cloudflare) is ready.

export type PayoutType = 'expense' | 'purchase' | 'salary'
export type Payout = { type: PayoutType; ledger: string; amount: number }

export type DayEntry = {
  id: string
  branch: string // branch id, e.g. B1
  date: string // yyyy-mm-dd
  source: 'manual' | 'pdf'
  fileName?: string
  opening: number // cash in hand at the start of the day
  // Sales side of the daily journal
  sales: number
  cgst: number
  sgst: number
  container: number
  discount: number // settlement discounts (reduce the bill)
  roundOff: number // + or -
  // How the money came in (cash is what is left)
  mobikwik: number
  swiggy: number
  zomato: number
  rapido: number
  // Paid out of cash that day
  payouts: Payout[]
  savedAt: string // last saved
  addedBy?: string // email of the person who first saved it
  addedAt?: string
  editedBy?: string // email of the person who last changed it
}

export const PAYOUT_TYPES: Record<PayoutType, string> = { expense: 'Expense', purchase: 'Purchase', salary: 'Salary' }

// Common ledgers from the Imprest Book, with the tab they belong to.
export const KNOWN_LEDGERS: { name: string; type: PayoutType }[] = [
  { name: 'Salary Payable', type: 'salary' },
  { name: 'Staff - Lunch Exp', type: 'expense' },
  { name: 'Water Tanker', type: 'expense' },
  { name: 'Conveyance', type: 'expense' },
  { name: 'Parcel and Disposables Items', type: 'expense' },
  { name: 'Miscellaneous Expenses', type: 'expense' },
  { name: 'Groceries Purchased', type: 'purchase' },
  { name: 'Vegetables Purchased', type: 'purchase' },
  { name: 'Milk Purchased', type: 'purchase' },
]

/** Best guess of the tab for a ledger name. */
export function guessType(ledger: string): PayoutType {
  const known = KNOWN_LEDGERS.find((l) => l.name.toLowerCase() === ledger.trim().toLowerCase())
  if (known) return known.type
  if (/salary|wages|advance/i.test(ledger)) return 'salary'
  if (/purchase|grocer|vegetable|milk|provision/i.test(ledger)) return 'purchase'
  return 'expense'
}

// --- Maths, all in one place ---
export const billTotal = (e: DayEntry) => e.sales + e.cgst + e.sgst + e.container + e.roundOff - e.discount
export const viaApps = (e: DayEntry) => e.mobikwik + e.swiggy + e.zomato + e.rapido
export const cashIn = (e: DayEntry) => billTotal(e) - viaApps(e)
export const paidOut = (e: DayEntry, type?: PayoutType) => e.payouts.filter((p) => !type || p.type === type).reduce((s, p) => s + p.amount, 0)
export const closing = (e: DayEntry) => e.opening + cashIn(e) - paidOut(e)

export function blankEntry(branch = 'B1', date = new Date().toISOString().slice(0, 10)): DayEntry {
  return {
    id: '', branch, date, source: 'manual', opening: 0,
    sales: 0, cgst: 0, sgst: 0, container: 0, discount: 0, roundOff: 0,
    mobikwik: 0, swiggy: 0, zomato: 0, rapido: 0, payouts: [], savedAt: '',
  }
}

// --- Store (cloud database, with a copy in this browser) ---
const store = cloudStore<DayEntry>('prisim.dayEntries', { kind: 'dayEntries', idOf: (e) => e.id })
const write = (next: DayEntry[]) => store.set(next)

export function useEntries(): DayEntry[] {
  return store.use()
}

export function getEntry(id: string) {
  return store.get().find((e) => e.id === id)
}

/** Same branch + date as an existing entry (other than `id`). */
export function findDuplicate(branch: string, date: string, id?: string) {
  return store.get().find((e) => e.branch === branch && e.date === date && e.id !== id)
}

/** Save an entry. `by` is the signed-in person's email. */
export function saveEntry(e: DayEntry, by: string): DayEntry {
  const now = new Date().toISOString()
  const saved: DayEntry = e.id
    ? { ...e, savedAt: now, editedBy: by }
    : { ...e, id: crypto.randomUUID(), savedAt: now, addedAt: now, addedBy: by }
  write([saved, ...store.get().filter((x) => x.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date)))
  return saved
}

export function deleteEntry(id: string) {
  write(store.get().filter((e) => e.id !== id))
}

/** Entries in the given month (yyyy-mm); all months when omitted. */
export const inMonth = (list: DayEntry[], month?: string) => (month ? list.filter((e) => e.date.startsWith(month)) : list)

/** "27 Oct 2026, 3:45 pm" */
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'

export const niceDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
