import { cloudStore } from './cloudStore'
import { branchName } from './mock'
import { addLedger, addManualVoucher, customLedgersNow, deleteManualVoucher, ledgerKey, manualVouchersNow, updateManualVoucher, type VoucherLine } from './ledgerStore'
import type { BankLine } from './banking'
import type { MobikwikPayout } from '../lib/readMobikwik'

// Mobikwik payouts from its Settlement Report: one per outlet MID and settlement batch (UPI or cards), with what
// Mobikwik kept and the payout UTR. The UTR finds the credit on the bank statement, and each payout's charges post
// one Journal against the outlet's Mobikwik ledger (the ledger the Imprest Books debit with the day's Mobikwik sales):
//   Dr Mobikwik Charges (fee, rentals and other cuts) · Dr Input GST (GST on them) · Cr Mobikwik - <Outlet>
// The bank receipt (Dr Bank · Cr Mobikwik - <Outlet>) is then entered from Bank Reconciliation, pre-filled.

export type MkPayout = MobikwikPayout & {
  id: string
  file?: string
  bankLineId?: string // the bank credit with this UTR, once a bank statement holding it is uploaded
  receivedOn?: string
  receivedFrom?: string
  addedBy: string
  addedAt: string
}

const store = cloudStore<MkPayout>('prisim.mkPayouts', { kind: 'mkPayouts', idOf: (p) => p.id })
export const useMkPayouts = store.use
export const mkPayoutsNow = () => store.get()
export const mkLedger = (branch: string) => `Mobikwik - ${branchName(branch)}`
export const MK_CHARGES = 'Mobikwik Charges'
const r2 = (n: number) => Math.round(n * 100) / 100
const feeVoucherId = (p: MkPayout) => 'mkfee-' + p.id.replace(/[^a-z0-9-]+/gi, '-')

/** The bank credit carrying this payout's UTR. */
export function creditFor(p: Pick<MkPayout, 'utr' | 'paid'>, lines: BankLine[]): BankLine | undefined {
  const u = p.utr.toUpperCase()
  return lines.find((l) => !l.ignored && l.deposit > 0 && (`${l.narration} ${l.ref}`).toUpperCase().includes(u) && Math.abs(l.deposit - p.paid) <= 1)
}

/** Post (or re-post) the Journal for a payout's charges; nothing when Mobikwik kept nothing. */
function syncFees(p: MkPayout, by: string) {
  const id = feeVoucherId(p)
  const had = manualVouchersNow().find((v) => v.id === id)
  const kept = r2(p.fee + p.other), gst = r2(p.gst), total = r2(kept + gst)
  if (!p.branch || total < 0.01) { if (had) deleteManualVoucher(id); return }
  const have = new Set(customLedgersNow().map((l) => ledgerKey(l.name)))
  const now = new Date().toISOString()
  const need: [string, 'indirectExp' | 'duties' | 'debtors'][] = [[MK_CHARGES, 'indirectExp'], ['Input GST', 'duties'], [mkLedger(p.branch), 'debtors']]
  for (const [name, group] of need) if (!have.has(ledgerKey(name))) addLedger({ name, group, opening: 0, addedBy: by, addedAt: now })
  const lines: VoucherLine[] = [
    ...(kept ? [{ ledger: MK_CHARGES, dr: kept, cr: 0 }] : []),
    ...(gst ? [{ ledger: 'Input GST', dr: gst, cr: 0 }] : []),
    { ledger: mkLedger(p.branch), dr: 0, cr: total },
  ]
  const v = {
    id, type: 'Journal' as const, date: p.settledOn, branch: p.branch, amount: total, lines, drLedger: MK_CHARGES, crLedger: mkLedger(p.branch), refNo: p.utr,
    narration: `Mobikwik ${p.kind === 'card' ? 'card' : 'UPI'} payout ${p.settledOn} for ${p.salesDate ?? 'sales'}: fee ₹${p.fee}${p.other ? `, rentals/other ₹${p.other}` : ''}, GST ₹${p.gst} (UTR ${p.utr})`,
    addedBy: had?.addedBy ?? by, addedAt: had?.addedAt ?? now, ...(had ? { updatedBy: by, updatedAt: now } : {}),
  }
  if (had && JSON.stringify(had.lines) === JSON.stringify(v.lines) && had.date === v.date) return
  if (had) updateManualVoucher(v); else addManualVoucher(v)
}

/** Save the payouts read from a Settlement Report: replaced by batch, matched to the bank, charges posted. */
export function savePayouts(list: MobikwikPayout[], file: string, by: string, lines: BankLine[]) {
  const now = new Date().toISOString()
  const old = new Map(store.get().map((p) => [p.id, p]))
  const fresh: MkPayout[] = list.map((x) => {
    const id = `mk:${x.mid}:${x.batch}`
    const was = old.get(id)
    const p: MkPayout = { ...x, id, file, addedBy: was?.addedBy ?? by, addedAt: was?.addedAt ?? now, bankLineId: was?.bankLineId, receivedOn: was?.receivedOn, receivedFrom: was?.receivedFrom }
    const l = p.bankLineId ? undefined : creditFor(p, lines)
    return l ? { ...p, bankLineId: l.id, receivedOn: l.date, receivedFrom: l.ledger } : p
  })
  const ids = new Set(fresh.map((p) => p.id))
  store.set([...fresh, ...store.get().filter((p) => !ids.has(p.id))])
  for (const p of fresh) syncFees(p, by)
  return fresh
}

/** Match payouts saved earlier to bank statements uploaded since. Returns how many were matched. */
export function matchPayouts(lines: BankLine[]): number {
  const all = store.get()
  const taken = new Set(all.map((p) => p.bankLineId).filter(Boolean))
  let n = 0
  const next = all.map((p) => {
    if (p.bankLineId) return p
    const l = creditFor(p, lines.filter((x) => !taken.has(x.id)))
    if (!l) return p
    taken.add(l.id); n++
    return { ...p, bankLineId: l.id, receivedOn: l.date, receivedFrom: l.ledger }
  })
  if (n) store.set(next)
  return n
}
