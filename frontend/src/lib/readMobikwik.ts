import { branchIn } from './readStatement'
import { excelDate } from './xlsx'

// Reads Mobikwik's merchant "Transactions Report" (Excel): one row per customer payment, with the outlet
// ("Merchant Alias"), time, amount, status and how it was paid ("Payment Instrument": UPI, CC_UPI, CC, DC …).
// Successful payments are added up per outlet and day, split into UPI (UPI, RuPay credit card on UPI, wallets)
// and card (credit, debit and prepaid cards).

export type MobikwikDay = { branch: string; date: string; upi: number; card: number; total: number; payments: number }
export type MobikwikRead =
  | { ok: false; reason: string }
  | { ok: true; days: MobikwikDay[]; unmatched: { name: string; total: number; payments: number }[]; failed: number; from: string; to: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const isCard = (instrument: string) => /^(cc|dc|credit|debit|prepaid|card)\b|card$/i.test(instrument.trim()) && !/upi/i.test(instrument)

export function parseMobikwikRows(rows: string[][]): MobikwikRead {
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'merchantalias') && r.some((c) => norm(c) === 'transactionamount'))
  if (h < 0) return { ok: false, reason: "This isn't a Mobikwik Transactions Report: it needs the Merchant Alias, Transaction Time and Transaction Amount columns." }
  const col = (name: string) => rows[h].findIndex((c) => norm(c) === name)
  const c = { alias: col('merchantalias'), time: col('transactiontime'), amount: col('transactionamount'), status: col('transactionstatus'), instrument: col('paymentinstrument') }
  const days = new Map<string, MobikwikDay>()
  const unmatched = new Map<string, { name: string; total: number; payments: number }>()
  const seen = new Map<string, string | undefined>()
  let failed = 0
  for (const r of rows.slice(h + 1)) {
    const amount = Number(String(r[c.amount] ?? '').replace(/[₹,\s]/g, ''))
    if (!r[c.alias] || !Number.isFinite(amount) || !amount) continue
    if (c.status >= 0 && !/^success/i.test(String(r[c.status] ?? '').trim())) { failed++; continue }
    const t = String(r[c.time] ?? '').trim()
    const date = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : /^\d{5}(\.\d+)?$/.test(t) ? excelDate(Number(t)) : undefined
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

export async function readMobikwikFile(file: File): Promise<MobikwikRead> {
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, reason: 'Upload the Mobikwik Transactions Report as Excel (.xlsx), as Mobikwik sends it.' }
  try {
    const { xlsxRows } = await import('./xlsx')
    return parseMobikwikRows(await xlsxRows(file))
  } catch (e) {
    return { ok: false, reason: `Could not open this Excel file: ${e instanceof Error ? e.message : String(e)}` }
  }
}
