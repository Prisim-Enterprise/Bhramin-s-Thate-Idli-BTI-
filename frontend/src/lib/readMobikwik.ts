import { branchIn } from './readStatement'
import { excelDate } from './xlsx'

// Reads Mobikwik's merchant "Transactions Report" (Excel): one row per customer payment, with the outlet
// ("Merchant Alias"), time, amount, status and how it was paid ("Payment Instrument": UPI, CC_UPI, CC, DC …).
// Successful payments are added up per outlet and day, split into UPI (UPI, RuPay credit card on UPI, wallets)
// and card (credit, debit and prepaid cards).

export type MobikwikDay = { branch: string; date: string; upi: number; card: number; total: number; payments: number }
export type MobikwikRead =
  | { ok: false; reason: string }
  | { ok: true; days: MobikwikDay[]; unmatched: { name: string; total: number; payments: number }[]; failed: number; from: string; to: string; payouts?: MobikwikPayout[] }

const r2 = (n: number) => Math.round(n * 100) / 100
const isCard = (instrument: string) => /^(cc|dc|credit|debit|prepaid|card)\b|card$/i.test(instrument.trim()) && !/upi/i.test(instrument)

export function parseMobikwikRows(rows: string[][]): MobikwikRead {
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '')
  // The Transactions Report and the Settlement Report's "Report" sheet name the same columns differently.
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'merchantalias') && r.some((c) => ['transactionamount', 'txnamount'].includes(norm(c))))
  if (h < 0) return { ok: false, reason: "This isn't a Mobikwik Transactions or Settlement Report: it needs the Merchant Alias, Transaction date and amount columns." }
  const col = (...names: string[]) => rows[h].findIndex((c) => names.includes(norm(c)))
  const c = { alias: col('merchantalias'), time: col('transactiontime', 'transactiondate'), amount: col('transactionamount', 'txnamount'), status: col('transactionstatus', 'status'), instrument: col('paymentinstrument') }
  const days = new Map<string, MobikwikDay>()
  const unmatched = new Map<string, { name: string; total: number; payments: number }>()
  const seen = new Map<string, string | undefined>()
  let failed = 0
  for (const r of rows.slice(h + 1)) {
    const amount = Number(String(r[c.amount] ?? '').replace(/[₹,\s]/g, ''))
    if (!r[c.alias] || !Number.isFinite(amount) || !amount) continue
    // Successful payments: "Success" on the Transactions Report, "Payout Initiated" / "Settled" on the Settlement Report.
    if (c.status >= 0 && !/^(success|payout|settled|paid)/i.test(String(r[c.status] ?? '').trim())) { failed++; continue }
    const t = String(r[c.time] ?? '').trim()
    const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    const date = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : /^\d{5}(\.\d+)?$/.test(t) ? excelDate(Number(t)) : undefined
    if (!date) continue
    const alias = String(r[c.alias]).trim()
    if (!seen.has(alias)) seen.set(alias, branchIn(alias.replace(/brahmins?'?\s*thatte\s*idli/i, ' ')))
    const branch = seen.get(alias)
    if (!branch) { const u = unmatched.get(alias) ?? { name: alias, total: 0, payments: 0 }; u.total = r2(u.total + amount); u.payments++; unmatched.set(alias, u); continue }
    const k = branch + ':' + date
    const d = days.get(k) ?? { branch, date, upi: 0, card: 0, total: 0, payments: 0 }
    if (isCard(String(r[c.instrument] ?? ''))) d.card = r2(d.card + amount); else d.upi = r2(d.upi + amount)
    d.total = r2(d.total + amount); d.payments++
    days.set(k, d)
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.branch.localeCompare(b.branch))
  if (!list.length && !unmatched.size) return { ok: false, reason: 'No successful payments found in this report.' }
  const dates = list.map((d) => d.date)
  return { ok: true, days: list, unmatched: [...unmatched.values()], failed, from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' }
}

/**
 * Mobikwik's Settlement Report: its "Deduction & Adjustment Data" sheet has one row per payout (outlet MID ×
 * settlement batch: WALLET = UPI and wallets, PG = cards): collected, fee, GST, rentals and other cuts, the amount
 * paid and the payout UTR, which is the reference on the bank statement. The outlet and the sales day come from the
 * payments sheet (Mid → Merchant Alias, Settlement Batch → Transaction Date).
 */
export type MobikwikPayout = {
  batch: string; mid: string; branch?: string; alias?: string
  settledOn: string; salesDate?: string; kind: 'upi' | 'card'
  collected: number; fee: number; gst: number; other: number; refunds: number; paid: number; utr: string; payments: number
}
export function parseMobikwikPayouts(sheets: { name: string; rows: string[][] }[]): MobikwikPayout[] | null {
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const ded = sheets.find((s) => s.rows.slice(0, 3).some((r) => r.some((c) => norm(c) === 'settlementamount') && r.some((c) => norm(c) === 'utr')))
  if (!ded) return null
  const hi = ded.rows.findIndex((r) => r.some((c) => norm(c) === 'settlementamount'))
  const H = ded.rows[hi].map(norm), at = (k: string) => H.indexOf(k)
  const num = (s: string | undefined) => { const n = Number(String(s ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0 }
  const day = (s: string | undefined) => { const m = String(s ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(String(s)) ? String(s).slice(0, 10) : '' }
  // From the payments sheet: each MID's outlet name, and each batch's sales day and number of payments.
  const pay = sheets.find((s) => s !== ded && s.rows.slice(0, 3).some((r) => r.some((c) => norm(c) === 'settlementbatch')))
  const aliasOf = new Map<string, string>(), batchDay = new Map<string, Map<string, number>>()
  if (pay) {
    const ph = pay.rows.findIndex((r) => r.some((c) => norm(c) === 'settlementbatch'))
    const P = pay.rows[ph].map(norm), pi = (k: string) => P.indexOf(k)
    for (const r of pay.rows.slice(ph + 1)) {
      const mid = String(r[pi('mid')] ?? '').trim(), b = String(r[pi('settlementbatch')] ?? '').trim()
      if (mid && r[pi('merchantalias')]) aliasOf.set(mid, String(r[pi('merchantalias')]).trim())
      const d = day(r[pi('transactiondate')])
      if (b && d) { const m = batchDay.get(b) ?? new Map<string, number>(); m.set(d, (m.get(d) ?? 0) + 1); batchDay.set(b, m) }
    }
  }
  const OTHER = ['edideduction', 'soundboxrental', 'swipemachinerental', 'smscharges', 'recoverycharges', 'ondemandcharges', 'maintenancecharge']
  const out: MobikwikPayout[] = []
  for (const r of ded.rows.slice(hi + 1)) {
    const batch = String(r[at('settlementbatch')] ?? '').trim(), utr = String(r[at('utr')] ?? '').trim()
    if (!batch || !utr) continue
    const mid = String(r[at('mid')] ?? '').trim(), alias = aliasOf.get(mid)
    const days = [...(batchDay.get(batch) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])
    out.push({
      batch, mid, alias, branch: alias ? branchIn(alias.replace(/brahmins?'?\s*thatte\s*idli/i, ' ')) : undefined,
      settledOn: day(r[at('settlementdate')]), salesDate: days[0]?.[0], kind: /^pg_/i.test(batch) ? 'card' : 'upi',
      collected: r2(num(r[at('collectionamount')])), fee: r2(num(r[at('fee')])), gst: r2(num(r[at('servicetaxes')])),
      other: r2(OTHER.reduce((t, k) => t + (at(k) >= 0 ? num(r[at(k)]) : 0), 0) - (at('maintenancereversal') >= 0 ? num(r[at('maintenancereversal')]) : 0)),
      refunds: r2(num(r[at('refunds')])), paid: r2(num(r[at('settlementamount')])), utr, payments: days.reduce((t, d) => t + d[1], 0),
    })
  }
  return out
}

export async function readMobikwikFile(file: File): Promise<MobikwikRead> {
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, reason: 'Upload the Mobikwik Transactions Report as Excel (.xlsx), as Mobikwik sends it.' }
  try {
    const { xlsxWorkbook } = await import('./xlsx')
    const book = await xlsxWorkbook(file)
    // The payments sheet: the one with Merchant Alias and an amount (first sheet of either report).
    const pay = book.find((s) => s.rows.slice(0, 5).some((r) => r.some((c) => /merchant\s*alias/i.test(c ?? '')))) ?? book[0]
    const r = parseMobikwikRows(pay?.rows ?? [])
    if (!r.ok) return r
    const payouts = parseMobikwikPayouts(book)
    return payouts ? { ...r, payouts } : r
  } catch (e) {
    return { ok: false, reason: `Could not open this Excel file: ${e instanceof Error ? e.message : String(e)}` }
  }
}
