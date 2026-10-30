import { cloudStore } from './cloudStore'
import { API_ON, dataUrlToBlob, fileBlob, uploadFile } from '../lib/api'
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

// key = where the file is kept in R2 (cloud). dataUrl = the file kept in this browser (before the cloud, or offline).
export type ReceiptFile = { name: string; type: string; size: number; dataUrl?: string; key?: string }

/** Move a file kept in the browser to R2. Returns the same object if there's nothing to move. */
export async function fileToCloud<F extends ReceiptFile>(f: F | undefined): Promise<F | undefined> {
  if (!API_ON || !f?.dataUrl || f.key) return f
  const key = await uploadFile(await dataUrlToBlob(f.dataUrl), f.name)
  return { ...f, key, dataUrl: undefined }
}

/** Save a newly picked file: to R2 when the cloud is on, otherwise in the browser if it's small. */
export async function keepFile(file: File, maxInBrowser = 1024 * 1024): Promise<ReceiptFile> {
  const f: ReceiptFile = { name: file.name, type: file.type, size: file.size }
  if (API_ON) {
    // Two tries: a dropped connection shouldn't lose the file.
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return { ...f, key: await uploadFile(file, file.name) } } catch { /* try again, then fall back to the browser */ }
    }
  }
  if (file.size <= maxInBrowser) f.dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  return f
}

export type ManualType = 'Payment' | 'Receipt' | 'Journal' | 'Contra' | 'Purchase'

/** One line of a voucher with several ledgers (e.g. a purchase bill split into vegetables, groceries, GST). */
export type VoucherLine = { ledger: string; dr: number; cr: number }

export type ManualVoucher = {
  id: string
  type: ManualType
  date: string // yyyy-mm-dd
  branch: string
  drLedger?: string // debited (newer vouchers)
  crLedger?: string // credited (newer vouchers)
  ledger?: string // older vouchers: debited
  paidFrom?: 'imprest' | 'bank' // older vouchers: credited
  amount: number
  lines?: VoucherLine[] // several ledgers; when set, drLedger/crLedger are just the main ones
  billId?: string // posted from the OCR Bill Inbox
  narration: string
  receipt?: ReceiptFile
  addedBy: string
  addedAt: string
}

const ledgers = cloudStore<CustomLedger>('prisim.ledgers', { kind: 'ledgers', idOf: (l) => l.name })
const vouchers = cloudStore<ManualVoucher>('prisim.manualVouchers', {
  kind: 'manualVouchers',
  idOf: (v) => v.id,
  prepare: async (v) => { const r = await fileToCloud(v.receipt); return r === v.receipt ? v : { ...v, receipt: r } },
})

export const useCustomLedgers = ledgers.use
export const useManualVouchers = vouchers.use

export function addLedger(l: CustomLedger) {
  return ledgers.set([...ledgers.get(), l])
}

/** Returns false if the browser had no room to save it (usually a large receipt file). */
export function addManualVoucher(v: ManualVoucher) {
  return vouchers.set([...vouchers.get(), v])
}

/** Debit lines of a voucher, whether it has two ledgers or many. */
export function debitLines(m: ManualVoucher, imprestOf: (branch: string) => string): VoucherLine[] {
  if (m.lines?.length) return m.lines.filter((l) => l.dr)
  return [{ ledger: sides(m, imprestOf).dr, dr: m.amount, cr: 0 }]
}

export function deleteManualVoucher(id: string) {
  vouchers.set(vouchers.get().filter((v) => v.id !== id))
}

/** Debit and credit ledgers of a voucher (older vouchers stored only the debit side). */
export function sides(m: ManualVoucher, imprestOf: (branch: string) => string) {
  return {
    dr: m.drLedger ?? m.ledger ?? '',
    cr: m.crLedger ?? (m.paidFrom === 'bank' ? 'Bank Account' : imprestOf(m.branch)),
  }
}

/** Group for a ledger name: the one it was created under, or a best guess. */
export function groupOf(name: string, custom: CustomLedger[]): GroupId {
  const c = custom.find((l) => l.name.toLowerCase() === name.toLowerCase())
  if (c) return c.group
  if (/ - imprest$|^cash$/i.test(name)) return 'cash'
  if (/bank|o\/d a\/c|\bod a\/c/i.test(name)) return 'bank'
  if (/^(mobikwik|swiggy|zomato|rapido)/i.test(name)) return 'debtors'
  if (/^sales/i.test(name)) return 'sales'
  if (/(output|input) (c|s|i)gst/i.test(name)) return 'duties'
  if (/^round off$/i.test(name)) return 'indirectInc'
  if (/traders|suppliers|enterprises|agencies|stores/i.test(name)) return 'creditors'
  return ({ expense: 'indirectExp', purchase: 'purchase', salary: 'liabilities' } as const)[guessType(name)]
}

/** Which report a group's payments belong to, if any. */
export function reportOf(group: GroupId): PayoutType | null {
  if (group === 'indirectExp' || group === 'directExp') return 'expense'
  if (group === 'purchase') return 'purchase'
  if (group === 'liabilities') return 'salary'
  return null
}

/** Open a saved receipt or bill in a new tab (from R2, or from this browser). */
export function openReceipt(r: ReceiptFile) {
  if (!r.key && !r.dataUrl) return
  const w = window.open('', '_blank') // opened now so the browser doesn't block it as a pop-up
  const blob = r.key ? fileBlob(r.key) : fetch(r.dataUrl!).then((res) => res.blob())
  blob
    .then((b) => { if (w) { w.opener = null; w.location.href = URL.createObjectURL(b) } })
    .catch(() => { w?.close(); alert('Could not open the file. Check your connection and try again.') })
}
