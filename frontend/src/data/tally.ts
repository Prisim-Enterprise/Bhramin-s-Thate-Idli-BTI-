import type { GroupId } from './books'
import type { InvoiceDraft, ManualType, VoucherLine } from './ledgerStore'

// Tally's voucher rules, kept apart from the screens so they can be tested on their own.

/** The eight voucher types and their keys, as on Tally's button bar. */
export const VOUCHER_KEYS: { type: ManualType; key: string; label: string }[] = [
  { type: 'Contra', key: 'F4', label: 'Contra' },
  { type: 'Payment', key: 'F5', label: 'Payment' },
  { type: 'Receipt', key: 'F6', label: 'Receipt' },
  { type: 'Journal', key: 'F7', label: 'Journal' },
  { type: 'Sales', key: 'F8', label: 'Sales' },
  { type: 'Purchase', key: 'F9', label: 'Purchase' },
  { type: 'Credit Note', key: 'Ctrl+F8', label: 'Credit Note' },
  { type: 'Debit Note', key: 'Ctrl+F9', label: 'Debit Note' },
]

/** Sales, Purchase and the two notes are entered invoice-style (party, then items with GST). */
export const isInvoiceType = (t: string): t is 'Sales' | 'Purchase' | 'Credit Note' | 'Debit Note' =>
  t === 'Sales' || t === 'Purchase' || t === 'Credit Note' || t === 'Debit Note'
/** Party debited: Sales and Debit Note. Party credited: Purchase and Credit Note. */
export const partyIsDebit = (t: ManualType) => t === 'Sales' || t === 'Debit Note'
const salesSide = (t: ManualType) => t === 'Sales' || t === 'Credit Note'

export const isMoney = (g: GroupId) => g === 'cash' || g === 'bank' || g === 'bankOD'

/** Which ledgers Tally offers in each place of a voucher. */
export function fits(type: ManualType, slot: 'party' | 'item' | 'line', g: GroupId): boolean {
  if (type === 'Contra') return isMoney(g)
  if (type === 'Journal') return !isMoney(g)
  if (slot === 'party') return isMoney(g) || g === 'debtors' || g === 'creditors' || g === 'branchDiv'
  if (slot === 'item') {
    return salesSide(type)
      ? g === 'sales' || g === 'directInc' || g === 'indirectInc'
      : g === 'purchase' || g === 'directExp' || g === 'indirectExp' || g === 'fixedAssets'
  }
  return true
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** GST ledger for a rate: output tax on sales, input tax on purchases (CGST + SGST shown as one GST line). */
export const gstLedgerFor = (type: ManualType, rate: number) => (salesSide(type) ? `Output GST @ ${rate}%` : 'Input GST')

/** GST on an item line: the amount typed in, or worked out from the GST %. */
export const itemGst = (i: { amount: number; gst: number; gstAmt?: number }) => (i.gstAmt != null ? r2(i.gstAmt) : r2(i.amount * i.gst / 100))

/** Turn an invoice-style voucher into its Dr / Cr lines, with GST and round off worked out. */
export function invoiceLines(type: ManualType, inv: InvoiceDraft) {
  const items = inv.items.filter((i) => i.ledger.trim() && i.amount > 0)
  const sub = r2(items.reduce((t, i) => t + i.amount, 0))
  const gstBy = new Map<string, number>()
  for (const i of items) {
    const g = itemGst(i)
    if (g > 0) { const name = gstLedgerFor(type, i.gst); gstBy.set(name, r2((gstBy.get(name) ?? 0) + g)) }
  }
  const gst = r2([...gstBy.values()].reduce((t, v) => t + v, 0))
  const gross = r2(sub + gst)
  const total = inv.roundOff ? Math.round(gross) : gross
  const roundOff = r2(total - gross)
  const pDr = partyIsDebit(type)
  const other = (ledger: string, v: number): VoucherLine => (pDr ? { ledger, dr: 0, cr: v } : { ledger, dr: v, cr: 0 })
  const byLedger = new Map<string, number>()
  for (const i of items) byLedger.set(i.ledger.trim(), r2((byLedger.get(i.ledger.trim()) ?? 0) + i.amount))
  const lines: VoucherLine[] = [
    pDr ? { ledger: inv.party.trim(), dr: total, cr: 0 } : { ledger: inv.party.trim(), dr: 0, cr: total },
    ...[...byLedger].map(([l, v]) => other(l, v)),
    ...[...gstBy].map(([l, v]) => other(l, v)),
  ]
  // Round off sits with the items when it adds, with the party when it takes away.
  if (roundOff > 0) lines.push(other('Round Off', roundOff))
  if (roundOff < 0) lines.push(pDr ? { ledger: 'Round Off', dr: -roundOff, cr: 0 } : { ledger: 'Round Off', dr: 0, cr: -roundOff })
  return { lines: lines.filter((l) => l.dr || l.cr), sub, gst, roundOff, total }
}

export type EntryLine = { side: 'Dr' | 'Cr'; ledger: string; amount: number }

/**
 * Check a voucher before it is accepted, the way Tally would. `groupOf` returns null for a ledger that doesn't exist.
 * Returns the problem in plain words, or null when it can be saved.
 */
export function checkVoucher(type: ManualType, lines: VoucherLine[], groupOf: (name: string) => GroupId | null): string | null {
  const used = lines.filter((l) => l.ledger.trim() || l.dr || l.cr)
  if (!used.length) return 'Enter at least one Debit and one Credit.'
  for (const l of used) {
    if (!l.ledger.trim()) return 'A line has an amount but no ledger.'
    if (!groupOf(l.ledger)) return `Ledger “${l.ledger}” does not exist. Create it first (Alt+C).`
    if (!(l.dr > 0) && !(l.cr > 0)) return `Enter an amount for “${l.ledger}”.`
  }
  const dr = r2(used.reduce((t, l) => t + l.dr, 0)), cr = r2(used.reduce((t, l) => t + l.cr, 0))
  if (!dr || !cr) return 'A voucher needs both a Debit and a Credit.'
  if (Math.abs(dr - cr) >= 0.005) return `Debit (${dr.toFixed(2)}) and Credit (${cr.toFixed(2)}) do not match. Difference ${Math.abs(dr - cr).toFixed(2)}.`
  const g = (l: VoucherLine) => groupOf(l.ledger)!
  if (type === 'Contra' && used.some((l) => !isMoney(g(l)))) return 'Contra is only for cash and bank ledgers (deposits, withdrawals, transfers).'
  if (type === 'Journal' && used.some((l) => isMoney(g(l)))) return 'Cash and bank ledgers go in Payment, Receipt or Contra, not Journal.'
  if (type === 'Payment' && !used.some((l) => l.cr && isMoney(g(l)))) return 'Payment needs a cash or bank ledger on the Credit side.'
  if (type === 'Receipt' && !used.some((l) => l.dr && isMoney(g(l)))) return 'Receipt needs a cash or bank ledger on the Debit side.'
  return null
}
