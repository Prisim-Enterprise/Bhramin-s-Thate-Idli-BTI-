import { findDate } from './readBill'

// Reads a Tally "Cash Book" PDF (Display → Account Books → Cash/Bank Book → Cash, printed or saved as PDF).
// Each voucher line names the other ledger, from the cash ledger's point of view:
//   "27-Aug-26 Cr Karnataka Bank O/D A/c - 9267… Contra 151 5,00,000.00"   other ledger credited → money IN to cash
//   "Dr Conveyance Payment 3089 110.00"                                    other ledger debited  → money OUT of cash
//   "Dr (as per details) Payment 3088 13,455.00" followed by "Vegetables and Fruits 12,855.00 Dr" … detail lines
// The date is printed only on the first voucher of each day. Page breaks repeat the heading and carry totals over.

export type CashVoucher = {
  date: string
  type: 'Payment' | 'Receipt' | 'Contra' | 'Journal' | 'Sales' | 'Purchase' | 'Debit Note' | 'Credit Note'
  no: string
  dir: 'in' | 'out' // money into or out of cash
  amount: number
  lines: { ledger: string; amount: number }[] // the other ledgers and their share (one line unless "as per details")
}

export type CashBookRead =
  | { ok: false; reason: string }
  | {
      ok: true
      title: string // "Cash Book" or the ledger name Tally printed
      from: string
      to: string
      opening: number // + debit (cash in hand), − credit
      closing: number | null // as printed, signed the same way
      vouchers: CashVoucher[]
      totalIn: number
      totalOut: number
      balanced: boolean | null // opening + in − out = printed closing
      skipped: string[] // lines that looked like vouchers but could not be read
    }

const r2 = (n: number) => Math.round(n * 100) / 100
const AMT = /-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|-?\d+\.\d{1,2}/g
const num = (s: string) => Number(s.replace(/,/g, ''))
const TYPES = ['Debit Note', 'Credit Note', 'Payment', 'Receipt', 'Contra', 'Journal', 'Sales', 'Purchase'] as const
const DATE = /^(\d{1,2}[-/.][A-Za-z]{3}[-/.]\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s+/

/** Is this PDF text a Tally Cash Book (not an Imprest Book or anything else)? */
export const isCashBook = (lines: string[]) => lines.slice(0, 12).some((l) => /^cash\s*book\b/i.test(l.trim()))

export function parseCashBook(raw: string[]): CashBookRead {
  const lines = raw.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (!isCashBook(lines)) return { ok: false, reason: 'This is not a Tally Cash Book.' }
  const title = lines.find((l) => /^cash\s*book\b/i.test(l)) ?? 'Cash Book'
  const vouchers: CashVoucher[] = []
  const skipped: string[] = []
  let opening: number | null = null
  let closing: number | null = null
  let closingSide: 'Dr' | 'Cr' | null = null
  let date: string | undefined
  let open: CashVoucher | null = null // an "(as per details)" voucher collecting its lines
  const typeRe = new RegExp(`\\s(${TYPES.join('|')})\\s+(\\S+)\\s+(${AMT.source})\\s*$`, 'i')

  for (let l of lines) {
    // Page headings, carried totals and column totals.
    if (/^(pep hospitality|udyam|page \d|date particulars|continued|for \d)/i.test(l) || /cash book\s*:?/i.test(l) && !/opening|closing/i.test(l)) continue
    if (/^(carried over|brought forward)\b/i.test(l) || /^[\d,.\s]+$/.test(l)) { open = null; continue }
    const dm = l.match(DATE)
    if (dm) { date = findDate(dm[1].replace(/-(\d{2})$/, '-20$1')) ?? findDate(dm[1]) ?? date; l = l.slice(dm[0].length) }
    const side = l.match(/^(Dr|Cr)\s+/)
    if (/opening balance/i.test(l)) { const a = l.match(AMT); if (a) opening = num(a[a.length - 1]); open = null; continue }
    if (/closing balance/i.test(l)) { const a = l.match(AMT); if (a) { closing = num(a[a.length - 1]); closingSide = side ? (side[1] as 'Dr' | 'Cr') : null } open = null; continue }
    const t = l.match(typeRe)
    if (side && t && date) {
      const ledger = l.slice(side[0].length, t.index).trim()
      const v: CashVoucher = {
        date, type: TYPES.find((x) => x.toLowerCase() === t[1].toLowerCase())!, no: t[2],
        // "Cr <other ledger>": the other ledger is credited, so cash is debited (money in).
        dir: side[1] === 'Cr' ? 'in' : 'out', amount: r2(num(t[3])), lines: [],
      }
      if (/^\(as per details\)$/i.test(ledger)) open = v
      else { v.lines.push({ ledger, amount: v.amount }); open = null }
      vouchers.push(v)
      continue
    }
    // A detail line of an "(as per details)" voucher: "Vegetables and Fruits 12,855.00 Dr".
    const d = l.match(new RegExp(`^(.+?)\\s+(${AMT.source})\\s+(Dr|Cr)$`))
    if (open && d) {
      // The cash side's own direction is the opposite of the other ledgers': Cr detail lines on a receipt add up, Dr ones are taken off.
      const same = (open.dir === 'in' && d[3] === 'Cr') || (open.dir === 'out' && d[3] === 'Dr')
      open.lines.push({ ledger: d[1].trim(), amount: r2(same ? num(d[2]) : -num(d[2])) })
      continue
    }
    if (AMT.test(l) && /[a-z]{3}/i.test(l)) skipped.push(l)
    AMT.lastIndex = 0
  }
  if (!vouchers.length) return { ok: false, reason: 'Could not find any vouchers in this Cash Book.' }
  // A voucher whose detail lines don't add up to it keeps the rest on a line of its own, so nothing is lost.
  for (const v of vouchers) {
    const s = r2(v.lines.reduce((t, x) => t + x.amount, 0))
    if (!v.lines.length) v.lines.push({ ledger: 'Suspense A/c', amount: v.amount })
    else if (Math.abs(s - v.amount) > 0.005) { skipped.push(`${v.type} ${v.no}: details come to ${s}, voucher says ${v.amount}`); v.lines.push({ ledger: 'Suspense A/c', amount: r2(v.amount - s) }) }
  }
  const totalIn = r2(vouchers.filter((v) => v.dir === 'in').reduce((t, v) => t + v.amount, 0))
  const totalOut = r2(vouchers.filter((v) => v.dir === 'out').reduce((t, v) => t + v.amount, 0))
  // Tally prints the opening balance in the Debit or Credit column, which the text doesn't show. Its side is the
  // one that, with the vouchers, comes to the printed closing balance. "Cr Closing Balance" balances the debit side,
  // so the cash ledger itself is in credit then; "Dr Closing Balance" means cash in hand.
  let open0 = opening ?? 0
  let close: number | null = closing == null ? null : closingSide === 'Cr' ? -closing : closing
  let balanced: boolean | null = null
  if (opening != null && closing != null) {
    const fits = [1, -1].flatMap((o) => [1, -1].map((c) => ({ o, c }))).find(({ o, c }) => Math.abs(o * opening! + totalIn - totalOut - c * closing!) < 0.01 && (closingSide == null || (c === -1) === (closingSide === 'Cr')))
      ?? [1, -1].flatMap((o) => [1, -1].map((c) => ({ o, c }))).find(({ o, c }) => Math.abs(o * opening! + totalIn - totalOut - c * closing!) < 0.01)
    if (fits) { open0 = fits.o * opening; close = fits.c * closing; balanced = true } else balanced = false
  }
  const dates = vouchers.map((v) => v.date).sort()
  return { ok: true, title, from: dates[0], to: dates[dates.length - 1], opening: r2(open0), closing: close == null ? null : r2(close), vouchers, totalIn, totalOut, balanced, skipped }
}
