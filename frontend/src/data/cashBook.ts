import { imprestLedger, type GroupId } from './books'
import { BRANCHES } from './mock'
import { addLedger, addManualVoucher, customLedgersNow, ledgerKey, manualVouchersNow, type ManualVoucher, type VoucherLine } from './ledgerStore'
import { branchIn } from '../lib/readStatement'
import type { CashBookRead, CashVoucher } from '../lib/readCashBook'

// Posting a Tally Cash Book (head office / Centre Kitchen cash) into the books.
// Each voucher becomes the same voucher here, against the "Cash" ledger, numbered as in Tally so
// uploading the same Cash Book again never posts it twice.
//   Money in  (Contra from the bank, Receipt from an outlet's imprest): Dr Cash · Cr the other ledger(s)
//   Money out (Payment):                                                  Dr the other ledger(s) · Cr Cash
// An outlet's "<Outlet> Imprest" (however Tally spells it) is the same imprest ledger the Imprest Books post to.

export const CASH_LEDGER = 'Cash'
export const cashVoucherId = (v: Pick<CashVoucher, 'date' | 'type' | 'no'>) => `cb-${v.date}-${v.type.replace(/\s+/g, '')}-${v.no}`.toLowerCase()

/** The group a new ledger goes under, from its name (only used when the ledger doesn't exist yet). */
export function groupFor(name: string): GroupId {
  const n = name.toLowerCase()
  if (/imprest|petty cash|cash in hand|^cash$/.test(n)) return 'cash'
  if (/\bo\/?d\b|overdraft|cash credit|\bcc a\/c/.test(n)) return 'bankOD'
  if (/bank|a\/c\s*-?\s*\d{6,}/.test(n)) return 'bank'
  if (/payable|outstanding/.test(n)) return 'liabilities'
  if (/gst|tds|tcs|cess/.test(n)) return 'duties'
  if (/purchase|vegetable|fruit|grocer|milk|curd|ghee|butter|oil|rice|dal|provision|coconut|onion|potato|flour|spice/.test(n)) return 'purchase'
  if (/transport inward|freight|grinding|carriage|loading|hamali/.test(n)) return 'directExp'
  if (/sales|income received|commission received/.test(n)) return 'indirectInc'
  if (/capital|drawing/.test(n)) return 'capital'
  if (/suspense/.test(n)) return 'suspense'
  return 'indirectExp'
}

/** The ledger to post to: an outlet's imprest as the Imprest Books name it, else an existing ledger of that name, else the name as printed. */
export function ledgerNameFor(printed: string, existing: string[]): string {
  if (/imprest/i.test(printed)) {
    const words = printed.replace(/imprest/i, '').replace(/[-–]/g, ' ').trim()
    // Tally cuts long ledger names short ("Sahakaranaga Imprest"): a name that starts an outlet's name is that outlet.
    const skel = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/(?!^)[aeiouh]/g, '').replace(/(.)\1+/g, '$1')
    const b = branchIn(words) ?? (skel(words).length >= 5 ? BRANCHES.find((x) => x.id !== 'CK' && skel(x.name).startsWith(skel(words)))?.id : undefined)
    if (b) return imprestLedger(b)
  }
  const k = ledgerKey(printed)
  return existing.find((x) => ledgerKey(x) === k) ?? printed.trim()
}

export type CashPosting = { posted: number; already: number; newLedgers: string[]; vouchers: ManualVoucher[] }

/** The vouchers this Cash Book would post (nothing is saved). */
export function cashBookVouchers(read: Extract<CashBookRead, { ok: true }>, by: string, file: string): { vouchers: ManualVoucher[]; ledgers: { name: string; group: GroupId }[] } {
  const existing = customLedgersNow().map((l) => l.name)
  const now = new Date().toISOString()
  const need = new Map<string, GroupId>()
  const vouchers = read.vouchers.map((v): ManualVoucher => {
    const others: VoucherLine[] = v.lines.map((l) => {
      const name = ledgerNameFor(l.ledger, existing)
      if (!existing.some((x) => ledgerKey(x) === ledgerKey(name))) need.set(name, groupFor(name))
      // Money in: the other ledgers are credited; money out: debited. A minus share sits on the other side.
      const amt = Math.round(l.amount * 100) / 100
      return v.dir === 'in' ? { ledger: name, dr: amt < 0 ? -amt : 0, cr: amt > 0 ? amt : 0 } : { ledger: name, dr: amt > 0 ? amt : 0, cr: amt < 0 ? -amt : 0 }
    })
    const cash: VoucherLine = v.dir === 'in' ? { ledger: CASH_LEDGER, dr: v.amount, cr: 0 } : { ledger: CASH_LEDGER, dr: 0, cr: v.amount }
    const lines = v.dir === 'in' ? [cash, ...others] : [...others, cash]
    return {
      id: cashVoucherId(v), type: v.type, date: v.date, branch: 'CK', amount: v.amount, lines,
      drLedger: lines.find((l) => l.dr)?.ledger, crLedger: lines.find((l) => l.cr)?.ledger, refNo: v.no,
      narration: `From the Tally Cash Book${file ? ' (' + file + ')' : ''}, ${v.type} No. ${v.no}` + (v.lines.length > 1 ? ': ' + v.lines.map((l) => l.ledger).join(', ') : ''),
      addedBy: by, addedAt: now,
    }
  })
  if (!existing.some((x) => ledgerKey(x) === ledgerKey(CASH_LEDGER))) need.set(CASH_LEDGER, 'cash')
  return { vouchers, ledgers: [...need].map(([name, group]) => ({ name, group })) }
}

/** The Cash ledger's balance in the books before a day (+ debit): to compare with the Cash Book's opening balance. */
export function cashBalanceBefore(date: string): number {
  const k = ledgerKey(CASH_LEDGER)
  const opening = customLedgersNow().find((l) => ledgerKey(l.name) === k)?.opening ?? 0
  const moves = manualVouchersNow().filter((v) => !v.cancelled && v.date < date)
    .flatMap((v) => v.lines ?? []).filter((l) => ledgerKey(l.ledger) === k).reduce((t, l) => t + l.dr - l.cr, 0)
  return Math.round((opening + moves) * 100) / 100
}

/** Post the Cash Book: create the ledgers it needs and add every voucher not posted before. */
export function postCashBook(read: Extract<CashBookRead, { ok: true }>, by: string, file: string): CashPosting {
  const { vouchers, ledgers } = cashBookVouchers(read, by, file)
  const now = new Date().toISOString()
  for (const l of ledgers) addLedger({ name: l.name, group: l.group, opening: 0, addedBy: by, addedAt: now })
  const have = new Set(manualVouchersNow().map((v) => v.id))
  let posted = 0
  for (const v of vouchers) { if (have.has(v.id)) continue; addManualVoucher(v); posted++ }
  return { posted, already: vouchers.length - posted, newLedgers: ledgers.map((l) => l.name), vouchers }
}
