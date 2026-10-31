import { BILLS, type Bill, type BillLine } from './mock'
import { imprestLedger } from './books'
import { addLedger, addManualVoucher, deleteManualVoucher, fileToCloud, ledgerKey, type CustomLedger, type VoucherLine } from './ledgerStore'
import { cloudStore } from './cloudStore'

// Bills in the OCR Bill Inbox, saved in this browser until the backend (Cloudflare) is ready.
const bills = cloudStore<Bill>('prisim.bills', {
  kind: 'bills',
  idOf: (b) => b.id,
  // Bill files kept in the browser move to R2 when the bill is sent.
  prepare: async (b) => { const f = await fileToCloud(b.file); return f === b.file ? b : { ...b, file: f } },
})
if (!bills.get().length && BILLS.length) bills.set(BILLS)

export const useBills = bills.use
/** The latest list, outside React (e.g. after a bill finishes reading). */
export const getBills = () => bills.get()

/** Returns false if the browser had no room (usually a large bill file). */
export function saveBill(b: Bill): boolean {
  const list = bills.get()
  return bills.set(list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list])
}

export function deleteBill(b: Bill) {
  if (b.voucherId) deleteManualVoucher(b.voucherId)
  bills.set(bills.get().filter((x) => x.id !== b.id))
}

export function nextBillId(): string {
  const n = Math.max(1000, ...bills.get().map((b) => Number(b.id.replace(/\D/g, '')) || 0))
  return 'BL-' + (n + 1)
}

/* ---------- Bill maths ---------- */

const r2 = (n: number) => Math.round(n * 100) / 100
export const lineBase = (l: BillLine) => r2(l.qty * l.rate)
export const lineGst = (l: BillLine) => r2(l.qty * l.rate * (l.gst / 100))

/** Subtotal, tax, round off and total. Tax printed on the bill wins over tax worked out from the lines. */
export function billSums(b: Bill) {
  const subtotal = r2(b.lines.reduce((s, l) => s + lineBase(l), 0))
  const fromLines = r2(b.lines.reduce((s, l) => s + lineGst(l), 0))
  const cgst = b.cgst ?? (b.igst ? 0 : r2(fromLines / 2))
  const sgst = b.sgst ?? (b.igst ? 0 : r2(fromLines - r2(fromLines / 2)))
  const igst = b.igst ?? 0
  const worked = r2(subtotal + cgst + sgst + igst)
  // Small differences against the printed total (paise, rounding to the rupee) go to Round Off.
  const diff = b.billTotal != null ? r2(b.billTotal - worked) : 0
  const roundOff = Math.abs(diff) <= 5 ? diff : 0
  return { subtotal, cgst, sgst, igst, roundOff, total: r2(worked + roundOff), mismatch: Math.abs(diff) > 5 ? diff : 0 }
}

/** Who the bill is owed to: the vendor (credit bill) or the branch cash (paid on the spot). */
export const partyOf = (b: Bill) => (b.type === 'credit' ? b.vendor.trim() : imprestLedger(b.branch))

/** The purchase voucher lines: each item ledger debited, GST debited, the vendor or branch cash credited. */
export function billPostings(b: Bill, fallbackLedger = 'Groceries Purchased'): VoucherLine[] {
  const s = billSums(b)
  const byLedger = new Map<string, number>()
  for (const l of b.lines) {
    const name = l.ledger?.trim() || fallbackLedger
    byLedger.set(name, r2((byLedger.get(name) ?? 0) + lineBase(l)))
  }
  const out: VoucherLine[] = [...byLedger].map(([ledger, v]) => ({ ledger, dr: v, cr: 0 }))
  if (s.cgst) out.push({ ledger: 'Input CGST', dr: s.cgst, cr: 0 })
  if (s.sgst) out.push({ ledger: 'Input SGST', dr: s.sgst, cr: 0 })
  if (s.igst) out.push({ ledger: 'Input IGST', dr: s.igst, cr: 0 })
  if (s.roundOff) out.push(s.roundOff > 0 ? { ledger: 'Round Off', dr: s.roundOff, cr: 0 } : { ledger: 'Round Off', dr: 0, cr: -s.roundOff })
  out.push({ ledger: partyOf(b), dr: 0, cr: s.total })
  return out.filter((l) => l.dr || l.cr)
}

/** Post a checked bill to Account Books as a Purchase voucher. Returns an error message, or null when done. */
export function postBill(b: Bill, by: string, custom: CustomLedger[]): string | null {
  // A vendor already in Account Books is credited under its existing name, however this bill spells it.
  const typed = partyOf(b)
  const party = custom.find((c) => ledgerKey(c.name) === ledgerKey(typed))?.name ?? typed
  if (!party) return 'Type the vendor name first.'
  if (!b.lines.length) return 'Add at least one item.'
  if (!b.date) return 'Enter the bill date.'
  const empty = b.lines.findIndex((l) => !l.item.trim())
  if (empty >= 0) return `Line ${empty + 1} has no item name. Type it, or remove the line.`
  const noAmount = b.lines.findIndex((l) => lineBase(l) <= 0)
  if (noAmount >= 0) return `“${b.lines[noAmount].item}” has no amount. Type the quantity and rate (or the amount), or remove the line.`
  // The same bill (same vendor and bill number) posted twice would count the purchase twice.
  const inv = (b.invoiceNo ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const twin = inv && bills.get().find((x) => x.id !== b.id && x.voucherId && ledgerKey(x.vendor) === ledgerKey(b.vendor)
    && (x.invoiceNo ?? '').trim().toLowerCase().replace(/\s+/g, '') === inv)
  if (twin) return `Bill no. ${b.invoiceNo} from ${b.vendor} is already posted as ${twin.id} (${twin.date}). If this is a different bill, check the bill number.`
  const s = billSums(b)
  if (s.mismatch) return `Items and tax come to ₹${s.total.toLocaleString('en-IN')}, but the bill total is ₹${(b.billTotal ?? 0).toLocaleString('en-IN')}. Fix the lines or the bill total first.`
  if (s.total <= 0) return 'The bill total is zero.'
  const now = new Date().toISOString()
  // A credit bill's vendor gets its own ledger under Sundry Creditors, like in Tally.
  if (b.type === 'credit' && !custom.some((c) => ledgerKey(c.name) === ledgerKey(party))) {
    addLedger({ name: party, group: 'creditors', opening: 0, addedBy: by, addedAt: now })
  }
  const lines = billPostings(b).map((l) => (l.cr && l.ledger === typed ? { ...l, ledger: party } : l))
  const id = 'bill-' + b.id + '-' + Date.now().toString(36)
  const ok = addManualVoucher({
    id, type: 'Purchase', date: b.date, branch: b.branch, amount: s.total, lines, billId: b.id,
    drLedger: lines.find((l) => l.dr)?.ledger, crLedger: party,
    narration: `Bill${b.invoiceNo ? ' no. ' + b.invoiceNo : ''} from ${b.vendor} (${b.id})`,
    receipt: b.file ? { name: b.file.name, type: b.file.type, size: b.file.size, key: b.file.key } : undefined,
    addedBy: by, addedAt: now,
  })
  if (!ok) return 'The browser had no room to save this. Delete some old bills and try again.'
  saveBill({ ...b, status: 'verified', voucherId: id })
  return null
}

/** Take a bill back out of Account Books so it can be changed. */
export function unpostBill(b: Bill) {
  if (b.voucherId) deleteManualVoucher(b.voucherId)
  saveBill({ ...b, status: 'extracted', voucherId: undefined })
}
