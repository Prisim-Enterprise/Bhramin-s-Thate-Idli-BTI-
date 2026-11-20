import { fyStartOf } from './company'
import { groupOf, ledgerKey, type CustomLedger, type ManualVoucher, type VoucherLine } from './ledgerStore'
import type { GroupId } from './books'

// TDS on payments for services, as Tally does it. Goods carry no TDS.
// Rates and limits for FY 2026-27 (Income-tax Act 2025, s. 393; the old 194C / 194J / 194I / 194H, which people still use).
// A service ledger (an expense) has a TDS nature; when a Purchase voucher or a bill uses it, the tax is held back
// from the vendor and credited to a "TDS Payable" ledger under Duties & Taxes, to be paid to the government.

export type TdsNatureId = 'contractor' | 'professional' | 'technical' | 'rent' | 'rentMachinery' | 'commission'
export type TdsNature = {
  id: TdsNatureId; label: string; section: string; ledger: string
  rateInd: number // individual / HUF (PAN's 4th letter P or H)
  rateOther: number // firm, company, others
  single?: number // one bill above this
  yearly?: number // this party's bills in the year above this
  monthly?: number // rent: a month's rent above this
}

export const TDS_NATURES: TdsNature[] = [
  { id: 'contractor', label: 'Contractor / job work', section: '194C', ledger: 'TDS Payable - 194C Contractor', rateInd: 1, rateOther: 2, single: 30000, yearly: 100000 },
  { id: 'professional', label: 'Professional fees', section: '194J', ledger: 'TDS Payable - 194J Professional', rateInd: 10, rateOther: 10, yearly: 50000 },
  { id: 'technical', label: 'Technical services', section: '194J', ledger: 'TDS Payable - 194J Technical', rateInd: 2, rateOther: 2, yearly: 50000 },
  { id: 'rent', label: 'Rent of land / building', section: '194I', ledger: 'TDS Payable - 194I Rent', rateInd: 10, rateOther: 10, monthly: 50000 },
  { id: 'rentMachinery', label: 'Hire of plant / machinery', section: '194I', ledger: 'TDS Payable - 194I Machinery', rateInd: 2, rateOther: 2, monthly: 50000 },
  { id: 'commission', label: 'Commission / brokerage', section: '194H', ledger: 'TDS Payable - 194H Commission', rateInd: 2, rateOther: 2, yearly: 20000 },
]
export const NO_PAN_RATE = 20
export const natureById = (id: string | undefined) => TDS_NATURES.find((n) => n.id === id)
export const isTdsLedger = (name: string) => /^TDS Payable - /.test(name.trim())

/** Only service ledgers (direct and indirect expenses) can carry TDS. Purchases of goods never do. */
export const canHaveTds = (g: GroupId) => g === 'directExp' || g === 'indirectExp'

/** A first guess from the ledger name, used until someone sets the ledger's TDS nature by hand. */
export function guessNature(name: string): TdsNatureId | null {
  const n = name.toLowerCase()
  if (/\b(rent|hire|lease)\b/.test(n) && /machine|equipment|plant|generator|vehicle|furniture/.test(n)) return 'rentMachinery'
  if (/\b(rent|lease)\b/.test(n)) return 'rent'
  if (/professional|consult|audit|legal|chartered|\bca fee|architect|advocate/.test(n)) return 'professional'
  if (/technical|software|it support/.test(n)) return 'technical'
  if (/commission|brokerage/.test(n)) return 'commission'
  if (/repair|maintenance|housekeep|security|contract|labou?r|job work|freight|cartage|advertis|printing|pest control|catering|event/.test(n)) return 'contractor'
  return null
}

/** The TDS nature of a ledger: what was set on it, else a guess for service ledgers, else none. */
export function natureOf(ledger: string, custom: CustomLedger[]): TdsNature | null {
  const c = custom.find((l) => ledgerKey(l.name) === ledgerKey(ledger))
  if (c?.tdsNature === 'none') return null
  if (!canHaveTds(groupOf(ledger, custom))) return null
  return natureById(c?.tdsNature) ?? natureById(guessNature(ledger) ?? undefined) ?? null
}

/** Rate for a party: 20% without a PAN; individual / HUF rate when the PAN's 4th letter is P or H. */
export function rateFor(n: TdsNature, party?: CustomLedger): { rate: number; why: string } {
  const pan = party?.pan?.trim().toUpperCase()
  if (!pan) return { rate: NO_PAN_RATE, why: 'no PAN on the party ledger' }
  const ind = pan[3] === 'P' || pan[3] === 'H'
  return { rate: ind ? n.rateInd : n.rateOther, why: ind ? 'individual / HUF' : 'firm / company' }
}

export type TdsLine = { nature: TdsNatureId; section: string; ledger: string; base: number; rate: number; amount: number; note: string }
export type TdsResult = { lines: TdsLine[]; notes: string[]; total: number }

const r2 = (n: number) => Math.round(n * 100) / 100
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const partyOfVoucher = (v: ManualVoucher) => v.inv?.party ?? v.crLedger ?? ''

/**
 * TDS on one purchase / expense bill from a supplier.
 *  items: the ledgers debited and their amounts before GST (TDS is worked out without GST).
 *  vouchers: the books so far, to see this party's earlier bills in the same financial year.
 * Contractor: due on a bill above ₹30,000, or once the year's bills go above ₹1,00,000 (then also on the earlier
 * bills that had none). Professional / technical / commission: once the year's bills go above the limit. Rent: a month's
 * rent above ₹50,000. Rounded to the rupee.
 */
export function workTds(a: { party: string; date: string; items: { ledger: string; amount: number }[]; custom: CustomLedger[]; vouchers: ManualVoucher[]; selfId?: string }): TdsResult {
  const none = (notes: string[] = []): TdsResult => ({ lines: [], notes, total: 0 })
  const party = a.party.trim()
  if (!party || groupOf(party, a.custom) !== 'creditors') return none()
  const pc = a.custom.find((l) => ledgerKey(l.name) === ledgerKey(party))
  const base = new Map<TdsNatureId, number>()
  for (const i of a.items) {
    const n = natureOf(i.ledger, a.custom)
    if (n && i.amount > 0) base.set(n.id, r2((base.get(n.id) ?? 0) + i.amount))
  }
  if (!base.size) return none()
  if (pc?.tdsExempt) return none([`No TDS: ${party} is set to “Don't deduct TDS” (lower / nil deduction certificate or transporter declaration).`])
  const fy = fyStartOf(a.date)
  const prior = a.vouchers.filter((v) => !v.cancelled && v.id !== a.selfId && v.date >= fy && v.date <= a.date && ledgerKey(partyOfVoucher(v)) === ledgerKey(party))
  const lines: TdsLine[] = [], notes: string[] = []
  for (const [id, b] of base) {
    const n = natureById(id)!
    const priorBase = r2(prior.reduce((t, v) => t + (v.lines ?? []).filter((l) => l.dr && natureOf(l.ledger, a.custom)?.id === id).reduce((s, l) => s + l.dr, 0), 0))
    const covered = r2(prior.reduce((t, v) => t + (v.tds ?? []).filter((x) => x.nature === id).reduce((s, x) => s + x.base, 0), 0))
    const left = Math.max(0, r2(priorBase - covered))
    let due = false, taxBase = b, why = ''
    if (n.monthly) { due = b > n.monthly; why = due ? `rent above ${inr(n.monthly)} a month` : `below ${inr(n.monthly)} a month` }
    else {
      const overSingle = !!n.single && b > n.single
      const overYear = !!n.yearly && priorBase + b > n.yearly
      due = overSingle || overYear
      if (overYear && left > 0) { taxBase = r2(b + left); why = `this year's bills (${inr(r2(priorBase + b))}) crossed ${inr(n.yearly!)}, so TDS also on the earlier ${inr(left)}` }
      else if (overSingle) why = `bill above ${inr(n.single!)}`
      else if (overYear) why = `this year's bills (${inr(r2(priorBase + b))}) are above ${inr(n.yearly!)}`
      else why = `${inr(r2(priorBase + b))} this year${n.single ? `, bill below ${inr(n.single)}` : ''}; limit ${inr(n.yearly!)}`
    }
    if (!due) { notes.push(`No TDS yet (${n.section} ${n.label}): ${why}.`); continue }
    const r = rateFor(n, pc)
    const amount = Math.round(taxBase * r.rate / 100)
    if (!amount) continue
    lines.push({ nature: id, section: n.section, ledger: n.ledger, base: taxBase, rate: r.rate, amount, note: `${n.section} ${n.label} @ ${r.rate}% (${r.why}) on ${inr(taxBase)}: ${why}` })
  }
  return { lines, notes, total: lines.reduce((t, l) => t + l.amount, 0) }
}

/** Put TDS into a voucher's lines: the party is credited that much less, each TDS Payable ledger is credited. */
export function withTds(lines: VoucherLine[], party: string, tds: TdsLine[]): VoucherLine[] {
  const total = tds.reduce((t, l) => t + l.amount, 0)
  if (!total) return lines
  const k = ledgerKey(party)
  let done = false
  const out = lines.map((l) => {
    if (done || ledgerKey(l.ledger) !== k || !l.cr) return l
    done = true
    return { ...l, cr: r2(l.cr - total) }
  })
  return [...out, ...tds.map((t) => ({ ledger: t.ledger, dr: 0, cr: t.amount }))]
}
