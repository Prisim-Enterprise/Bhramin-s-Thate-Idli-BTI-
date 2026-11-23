// Reads Zomato's weekly Settlement Report into a ZStatement, with every problem listed.
// Works on the Excel file as downloaded (all its sheets), on a Google Sheet copy, or on a CSV of the
// "Payout breakup" sheet (with the Summary lines above it). Rows are found by their S.no. (1–32, A–J) and
// columns by their headings, never by position, and nothing is guessed: a missing row is an error.

import { findDate } from './readBill'
import { toUnits, type Units } from '../data/aggregator/money'
import type { ZAd, ZRow, ZStatement, ZUtr } from '../data/aggregator/zomatoEngine'

export type Sheet = { name: string; rows: string[][] }
export type ZRead = { statement: ZStatement | null; errors: string[]; warnings: string[] }

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const isItem = (s: string) => /^(\d{1,2}|[A-J])$/.test(s)

// Rows the engine needs. A statement without them is refused.
const REQUIRED = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'J', '1', '2', '4', '8', '9', '10', '11', '12', '13', '15', '16', '17', '18', '19', '20', '21', '24', '25', '26', '29']

function payoutTable(rows: string[][], errors: string[]) {
  const h = rows.findIndex((r) => r.some((c) => /^particular/i.test(clean(c))) && r.some((c) => /delivered/i.test(clean(c))))
  if (h < 0) { errors.push('No “Payout breakup” table found: it needs the columns S.no., Particular, Delivered Orders, Cancelled/ Rejected Orders and Total.'); return null }
  const head = rows[h].map(clean)
  const col = (re: RegExp) => head.findIndex((c) => re.test(c))
  const particular = col(/^particular/i), delivered = col(/delivered/i), cancelled = col(/cancel|reject/i), total = col(/^total$/i)
  const sno = col(/^s\.?\s*no/i) >= 0 ? col(/^s\.?\s*no/i) : particular - 1
  const missing = [['Delivered Orders', delivered], ['Cancelled/ Rejected Orders', cancelled], ['Total', total]].filter(([, i]) => (i as number) < 0).map(([n]) => n)
  if (missing.length) { errors.push(`The Payout breakup table is missing the column(s): ${missing.join(', ')}.`); return null }
  const items: ZRow[] = [], extra: ZRow[] = []
  for (const r of rows.slice(h + 1)) {
    const no = clean(r[sno]), name = clean(r[particular]) || (isItem(no) ? '' : no)
    if (!name && !no) continue
    const cell = (i: number, what: string) => {
      const raw = clean(r[i])
      if (raw === '' || raw === '-') return 0
      const u = toUnits(raw)
      if (u == null) { errors.push(`Row ${no || name} (${what}): “${raw}” is not an amount.`); return 0 }
      return u
    }
    const hasNum = [delivered, cancelled, total].some((i) => toUnits(clean(r[i])) != null)
    if (!hasNum && !isItem(no)) continue
    const x: ZRow = { key: isItem(no) ? no : name, label: name || no, delivered: cell(delivered, 'delivered'), cancelled: cell(cancelled, 'cancelled'), total: cell(total, 'total') }
    // Some rows leave Total empty: work it out.
    if (clean(r[total]) === '' || clean(r[total]) === '-') x.total = x.delivered + x.cancelled
    ;(isItem(no) ? items : extra).push(x)
  }
  return { items, extra }
}

/** “Label | value” pairs (the Summary sheet, or the lines above the table in a CSV). */
function pairs(rows: string[][]) {
  const out = new Map<string, string>()
  for (const r of rows) {
    const cells = r.map(clean).filter(Boolean)
    if (cells.length >= 2 && cells[0].length < 60) out.set(cells[0].toLowerCase(), cells[1])
  }
  return (re: RegExp) => [...out].find(([k]) => re.test(k))?.[1] ?? ''
}

function adsOf(rows: string[][] | undefined): ZAd[] {
  if (!rows) return []
  const out: ZAd[] = []
  let inGrowth = false
  let head: string[] = []
  for (const r of rows) {
    const cells = r.map(clean)
    const line = cells.join(' ')
    if (/investments? in growth/i.test(line)) { inGrowth = true; continue }
    if (/investments? in hyperpure|other deductions|adjustments from previous/i.test(line)) inGrowth = false
    if (cells.some((c) => /^type$/i.test(c))) { head = cells; continue }
    if (!inGrowth || !head.length) continue
    const at = (re: RegExp) => cells[head.findIndex((c) => re.test(c))] ?? ''
    const type = at(/^type$/i)
    if (!type || /^total/i.test(type)) continue
    const total = toUnits(at(/total amount/i))
    if (total == null) continue
    out.push({ type, resId: at(/res id/i), ref: at(/invoice|campaign/i), period: at(/time period|period/i), status: at(/status/i), total, adjusted: toUnits(at(/adjusted/i)) ?? 0, outstanding: toUnits(at(/outstanding/i)) ?? 0 })
  }
  return out
}

function utrsOf(rows: string[][] | undefined): ZUtr[] {
  if (!rows) return []
  const h = rows.findIndex((r) => r.some((c) => /bank utr/i.test(clean(c))) && r.some((c) => /order id/i.test(clean(c))))
  if (h < 0) return []
  const head = rows[h].map(clean)
  const iUtr = head.findIndex((c) => /bank utr/i.test(c)), iPay = head.findIndex((c) => /order level payout/i.test(c)), iDate = head.findIndex((c) => /settlement date/i.test(c))
  const by = new Map<string, ZUtr>()
  for (const r of rows.slice(h + 1)) {
    const utr = clean(r[iUtr])
    if (!utr || /^n\/?a$/i.test(utr) || utr.length < 6) continue
    const u = by.get(utr) ?? { utr, amount: 0, orders: 0, date: findDate(clean(r[iDate])) ?? undefined }
    u.amount += toUnits(clean(r[iPay])) ?? 0
    u.orders += 1
    by.set(utr, u)
  }
  return [...by.values()]
}

/** Read the statement's sheets (Excel: all of them; CSV: one). */
export function readZomatoSheets(sheets: Sheet[]): ZRead {
  const errors: string[] = [], warnings: string[] = []
  const find = (re: RegExp) => sheets.find((s) => re.test(s.name))?.rows
  // The Payout breakup table: its own sheet, or the one sheet of a CSV.
  const pbRows = find(/payout\s*break/i) ?? sheets.find((s) => s.rows.some((r) => r.some((c) => /^particular/i.test(clean(c)))))?.rows
  if (!pbRows) { errors.push('This is not a Zomato settlement report: no “Payout breakup” sheet or table.'); return { statement: null, errors, warnings } }
  const table = payoutTable(pbRows, errors)
  if (!table) return { statement: null, errors, warnings }
  const summaryRows = find(/^summary$/i) ?? pbRows
  const get = pairs(summaryRows)
  const missingRows = REQUIRED.filter((k) => !table.items.some((r) => r.key === k))
  if (missingRows.length) errors.push(`Rows missing from the Payout breakup: ${missingRows.join(', ')}. Upload the report exactly as Zomato sends it.`)
  // Period, outlet, IDs.
  const period = get(/^report period/i)
  const [fromRaw, toRaw] = period.split(/\s+-\s+|\s+to\s+/i)
  const from = findDate(clean(fromRaw)) ?? '', to = findDate(clean(toRaw)) ?? ''
  if (!from || !to) errors.push(`The report period wasn't found or couldn't be read${period ? ` (“${period}”)` : ''}.`)
  const resId = get(/^res\.?\s*id/i).replace(/\.0+$/, '')
  if (!resId) errors.push('The restaurant ID (Res id) wasn’t found, so the outlet and duplicates can’t be checked.')
  const j = table.items.find((r) => r.key === 'J')
  const pick = (re: RegExp): Units | null => table.extra.find((r) => re.test(r.label))?.total ?? null
  const utrSummary = clean(get(/^bank utr/i))
  const utrs = utrsOf(find(/order\s*level/i))
  if (utrSummary && !utrs.some((u) => u.utr === utrSummary)) utrs.unshift({ utr: utrSummary, amount: j?.total ?? 0, orders: 0 })
  const ordersRaw = get(/^total orders/i)
  if (!errors.length && !find(/order\s*level/i)) warnings.push('No Order Level sheet: bank UTRs per order are not available, so the payout is matched by amount.')
  const statement: ZStatement = {
    aggregator: 'zomato', resId, resName: get(/^res\.?\s*name/i), address: get(/^address/i), legalEntity: get(/^legal entity/i) || undefined, gstin: get(/^gstin$/i) || undefined,
    from, to, orders: ordersRaw ? Number(ordersRaw.replace(/\D/g, '')) || undefined : undefined,
    rows: table.items, extra: table.extra, ads: adsOf(find(/addition|deduction/i)), utrs,
    printedNetPayout: j ? j.total : null, settled: pick(/^amount settled/i), pending: pick(/^pending amount/i),
  }
  return { statement: errors.length ? null : statement, errors, warnings }
}

/** CSV text → rows of cells (quotes and commas inside quotes handled). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

/** SHA-256 of a file, to spot the same file uploaded twice. */
export async function fileHash(file: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Read an uploaded Zomato statement file (.xlsx or .csv). */
export async function readZomatoFile(file: File): Promise<ZRead & { hash: string }> {
  const hash = await fileHash(file)
  if (file.size > 15 * 1024 * 1024) return { statement: null, errors: ['The file is larger than 15 MB. Upload the weekly report as Zomato sends it.'], warnings: [], hash }
  if (/\.xlsx$/i.test(file.name)) {
    try {
      const { xlsxWorkbook } = await import('./xlsx')
      return { ...readZomatoSheets(await xlsxWorkbook(file)), hash }
    } catch (e) {
      return { statement: null, errors: [`Could not open this Excel file: ${e instanceof Error ? e.message : String(e)}`], warnings: [], hash }
    }
  }
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return { ...readZomatoSheets([{ name: 'Payout breakup', rows: csvRows(await file.text()) }]), hash }
  return { statement: null, errors: ['Upload the Zomato settlement report as Excel (.xlsx) or CSV.'], warnings: [], hash }
}
