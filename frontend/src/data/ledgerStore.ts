import { useSyncExternalStore } from 'react'
import { guessType, type PayoutType } from './entries'
import type { GroupId } from './books'

// Ledgers added by hand, and payments posted from an uploaded receipt.
// Saved in this browser until the backend (Cloudflare) is ready.

export type CustomLedger = {
  name: string
  group: GroupId
  opening: number // + Dr, - Cr
  addedBy: string
  addedAt: string
}

export type ReceiptFile = { name: string; type: string; size: number; dataUrl?: string }

export type ManualVoucher = {
  id: string
  type: 'Payment' | 'Journal'
  date: string // yyyy-mm-dd
  branch: string
  ledger: string // debited
  paidFrom: 'imprest' | 'bank' // credited
  amount: number
  narration: string
  receipt?: ReceiptFile
  addedBy: string
  addedAt: string
}

// Small store kept in localStorage, shared across components.
function store<T>(key: string) {
  const listeners = new Set<() => void>()
  let data: T[] = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] } })()
  return {
    get: () => data,
    set(next: T[]): boolean {
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        return false // full or unavailable
      }
      data = next
      listeners.forEach((l) => l())
      return true
    },
    use: () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => data),
  }
}

const ledgers = store<CustomLedger>('prisim.ledgers')
const vouchers = store<ManualVoucher>('prisim.manualVouchers')

export const useCustomLedgers = ledgers.use
export const useManualVouchers = vouchers.use

export function addLedger(l: CustomLedger) {
  return ledgers.set([...ledgers.get(), l])
}

/** Returns false if the browser had no room to save it (usually a large receipt file). */
export function addManualVoucher(v: ManualVoucher) {
  return vouchers.set([...vouchers.get(), v])
}

export function deleteManualVoucher(id: string) {
  vouchers.set(vouchers.get().filter((v) => v.id !== id))
}

/** Group for a ledger name: the one it was created under, or a best guess. */
export function groupOf(name: string, custom: CustomLedger[]): GroupId {
  const c = custom.find((l) => l.name.toLowerCase() === name.toLowerCase())
  if (c) return c.group
  return ({ expense: 'indirectExp', purchase: 'purchase', salary: 'liabilities' } as const)[guessType(name)]
}

/** Which report a group's payments belong to, if any. */
export function reportOf(group: GroupId): PayoutType | null {
  if (group === 'indirectExp' || group === 'directExp') return 'expense'
  if (group === 'purchase') return 'purchase'
  if (group === 'liabilities') return 'salary'
  return null
}

/** Open a saved receipt in a new tab. */
export function openReceipt(r: ReceiptFile) {
  if (!r.dataUrl) return
  fetch(r.dataUrl).then((res) => res.blob()).then((b) => window.open(URL.createObjectURL(b), '_blank', 'noopener'))
}
