import { pdfLines } from './readImprestPdf'
import { findDate } from './readBill'
import { BRANCHES } from '../data/mock'
import { DEDUCTION_KINDS, PARTNERS, weekStart, type Deduction, type DeductionKind, type PartnerId } from '../data/settlements'

// Reads a partner's weekly payout statement (Swiggy, Zomato, Rapido, Mobikwik):
//  - PDF with text, or CSV: read here in the browser (exact, free, no daily limit)
//  - scanned PDF or photo: read by Sarvam OCR on the server (counts toward the daily reading limit)
// Whatever can't be found is left empty (N/A) for the person to fill in. Nothing is approved automatically.

export type StatementRead = {
  method: 'pdf-text' | 'csv' | 'xlsx' | 'sarvam' | 'none'
  note: string
  partner?: PartnerId
  branch?: string
  week?: string // Monday of the statement's period
  from?: string
  to?: string
  gross?: number
  deductions: Omit<Deduction, 'id'>[]
  netPayout?: number // net payout as printed on the statement
  utr?: string
  orders?: number // orders on the statement
  commissionBase?: number // what the commission is charged on (Zomato: total commissionable value)
  pending?: number // part of the payout the partner had not paid yet when the report was made
}

const NUM = /-?\(?(?:₹|rs\.?|inr)?\s?-?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\)?/gi
const r2 = (n: number) => Math.round(n * 100) / 100
/** The last amount on a line (a statement row ends in its value). Brackets or a minus mean a deduction: we keep the size. */
function lastAmount(line: string): number | undefined {
  const all = [...line.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ').matchAll(NUM)]
    .map((m) => Math.abs(Number(m[0].replace(/[₹(),\s]|rs\.?|inr/gi, ''))))
    .filter((n) => Number.isFinite(n) && !(Number.isInteger(n) && n > 1900 && n < 2100)) // not a year
  return all.length ? all[all.length - 1] : undefined
}

// Which deduction a statement line is. Checked in this order (GST on commission is GST, not commission).
const KINDS: [DeductionKind, RegExp][] = [
  ['tds', /\b(tds|tcs)\b|tax\s+deducted|tax\s+collected/i],
  ['gst', /\b(gst|igst|cgst|sgst)\b(?!\s*in\b)/i],
  ['ads', /\bads?\b|advertis|marketing|promotion|boost|sponsored|\bcpc\b|listing\s+fee/i],
  ['commission', /commission/i],
  ['gateway', /payment\s*(gateway|mechanism|processing)|\bpg\s*(fee|charge)|\bmdr\b|convenience\s+fee|transaction\s+(fee|charge)/i],
  ['other', /penalt|cancell?ation|recover(y|ies)|adjustment|long\s*distance|collection\s+charge|platform\s+fee|service\s+fee|packaging\s+charge|delivery\s+(fee|charge)|refund|other\s+(charges|deductions)/i],
]
const SKIP = /total\s+(deductions?|charges|fees|taxes)|gstin|\bpan\b|address|phone|email|invoice\s+no|order\s+id|page\s+\d/i
const GROSS = /gross\s+(order\s+)?(value|sales|amount)|total\s+(order\s+value|sales|bill\s+value)|item\s+total|customer\s+payable|order\s+value|gross\s+receipts?|total\s+collection|sales\s+value/i
const NET = /net\s*(payout|payable|settlement|amount\s+(paid|payable|settled)|receivable)|amount\s+(credited|settled|transferred|paid\s+out)|final\s+payout|settlement\s+amount|payout\s+amount|net\s+transfer/i

/** Pull the figures out of the statement's text lines. Kept separate so it can be tested. */
export function parseStatementLines(lines: string[]): Omit<StatementRead, 'method' | 'note'> {
  const text = lines.join('\n')
  const partner = PARTNERS.find((p) => new RegExp(p.name, 'i').test(text))?.id
  // Outlet: a branch name on the statement ("Chandra Layout", "Malleshwaram" …).
  const branch = BRANCHES.find((b) => b.id !== 'CK' && new RegExp(b.name.replace(/\s+/g, '\\s*'), 'i').test(text))?.id
  // Period: the first two dates on the statement.
  const dates = [...text.matchAll(/\b\d{1,2}\s*[-/.\s]\s*(?:\d{1,2}|[A-Za-z]{3,9})\s*[-/.,\s]\s*\d{2,4}\b|\b20\d{2}-\d{2}-\d{2}\b/g)].map((m) => findDate(m[0])).filter((d): d is string => !!d)
  const [from, to] = dates
  let gross: number | undefined
  let netPayout: number | undefined
  const deductions: Omit<Deduction, 'id'>[] = []
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || SKIP.test(line)) continue
    const v = lastAmount(line)
    if (v == null || v === 0) continue
    if (NET.test(line)) { netPayout = v; continue }
    if (GROSS.test(line) && !KINDS.some(([, re]) => re.test(line))) { gross = Math.max(gross ?? 0, v); continue }
    const kind = KINDS.find(([, re]) => re.test(line))?.[0]
    if (kind) deductions.push({ kind, label: line.replace(NUM, ' ').replace(/[:|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || DEDUCTION_KINDS[kind], amount: r2(v) })
  }
  const utr = text.match(/\b(?:utr|bank\s+ref(?:erence)?|transaction\s+(?:id|ref))\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9]{8,22})\b/i)?.[1]
  return { partner, branch, from, to, week: from ? weekStart(from) : undefined, gross, deductions, netPayout, utr }
}

/** CSV -> lines of text ("Commission, -1,000.00" -> "Commission -1000.00"). */
function csvLines(text: string): string[] {
  return text.split(/\r?\n/).map((row) => {
    const cells: string[] = []
    let cur = '', q = false
    for (const ch of row) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells.map((c) => c.trim().replace(/^(-?)(\d{1,3}(,\d{2,3})+)(\.\d+)?$/, (m) => m.replace(/,/g, ''))).filter(Boolean).join(' ')
  })
}

/**
 * Zomato's weekly Settlement Report (Excel): Summary, Payout Breakup, Order Level, Addition/Deductions … sheets.
 * The figures come from "Payout Breakup", found by the name of each row (not its position):
 *   gross = net order value of delivered orders (A); deductions C (service + payment fees), D (government charges),
 *   E (other order-level), F (ads), G (Hyperpure), H (other); additions I (cancellation refunds …) as minus amounts.
 *   Net payout J is kept to cross-check: gross − deductions must come to it.
 */
export function parseZomatoWorkbook(sheets: { name: string; rows: string[][] }[]): (Omit<StatementRead, 'method' | 'note'> & { settled?: number }) | null {
  const sheet = (re: RegExp) => sheets.find((s) => re.test(s.name))?.rows
  const pb = sheet(/payout\s*break/i)
  const summary = sheet(/^summary$/i) ?? []
  if (!pb) return null
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  const num = (s: string | undefined) => { const n = Number(String(s ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0 }
  // Each row: [ , S.no., Particular, Delivered, Cancelled/Rejected, Total ] (sub-rows have the name in column B).
  const rows = pb.map((r) => ({ name: clean(r[2] || r[1] || ''), delivered: num(r[3]), total: num(r[5]) })).filter((r) => r.name)
  const find = (re: RegExp) => rows.find((r) => re.test(r.name))
  const total = (re: RegExp) => find(re)?.total ?? 0
  const gross = find(/^net order value/i)?.delivered
  const commissionBase = find(/^total commissionable value/i)?.delivered
  const deductions: Omit<Deduction, 'id'>[] = []
  const add = (kind: DeductionKind, label: string, v: number) => { const a = r2(v); if (Math.abs(a) >= 0.01) deductions.push({ kind, label, amount: a }) }
  // Commission is the base service fee (the contract %), less Zomato's 30% cap discount. The long distance fee is separate.
  add('commission', 'Base service fee (commission), after 30% cap discount', total(/^base service fee/i) - total(/^discount on service fee/i))
  add('other', 'Long distance enablement fee (after discount)', total(/^long distance enablement fee/i) - total(/^discount on long distance/i))
  add('gateway', 'Payment mechanism fee', total(/^payment mechanism fee/i))
  add('gst', 'GST 18% on service & payment fees', total(/^taxes on service fee/i))
  add('gst', 'Customer GST paid by Zomato (sec 9(5))', total(/gst paid by zomato on behalf/i))
  add('tds', 'TDS 194O + TCS', total(/^tds 194o/i) + total(/^tax collected at source/i))
  add('other', 'Customer compensation & other order deductions', total(/^other order level deductions$/i))
  add('other', 'Cash received on self-delivery orders', total(/^amount received in cash/i))
  add('other', 'Adjustments from previous weeks', total(/^adjustments from previous weeks/i))
  // Ads are billed with 18% GST: the ad itself (checked against the approved budget) and its GST (input credit).
  const adsWithGst = r2(total(/^total ads/i) + total(/^total dining ads/i))
  const adsOnly = r2(adsWithGst / 1.18)
  add('ads', 'Ads (before GST)', adsOnly)
  add('gst', 'GST 18% on ads', adsWithGst - adsOnly)
  add('other', 'Miscellaneous services', total(/^miscellaneous se/i))
  add('other', 'Hyperpure purchases', total(/^total hyperpure/i))
  add('other', 'Express order discount reversal', total(/^express order discount reversal/i))
  // Additions: money Zomato adds back. Kept as minus deductions so net = gross − deductions still holds.
  add('other', 'Addition: cancellation refund', -total(/^cancellation refund/i))
  add('other', 'Addition: tips for kitchen staff', -total(/^tip for kitchen staff/i))
  add('other', 'Addition: TDS 194H & other additions', -total(/^tds 194 ?h/i))
  add('other', 'Addition: service fee rebate', -total(/service fees? rebate/i))
  const netPayout = find(/^net payout/i)?.total
  const settled = find(/^amount settled/i)?.total
  const pending = find(/^pending amount/i)?.total
  // Summary: period, outlet (name + address), UTR, orders.
  const sv = (re: RegExp) => clean(summary.find((r) => re.test(clean(r[1] ?? '')))?.[2] ?? '')
  const [from, to] = sv(/^report period/i).split(/\s+-\s+|\s+to\s+/i).map((d) => findDate(d.trim()) ?? undefined)
  const where = `${sv(/^res name/i)} ${sv(/^address/i)}`
  const branch = BRANCHES.find((b) => b.id !== 'CK' && new RegExp(b.name.replace(/\s+/g, '\\s*'), 'i').test(where))?.id
  const utr = sv(/^bank utr/i) || undefined
  const orders = num(sv(/^total orders/i)) || undefined
  return { partner: 'zomato', branch, from, to, week: from ? weekStart(from) : undefined, gross: gross == null ? undefined : r2(gross), commissionBase: commissionBase ? r2(commissionBase) : undefined, deductions, netPayout: netPayout == null ? undefined : r2(netPayout), utr, settled, pending, orders }
}

/** Read an uploaded statement file. */
export async function readStatementFile(file: File, onStep?: (s: string) => void): Promise<StatementRead> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
  const isImage = file.type.startsWith('image/')
  const found = (r: Omit<StatementRead, 'method' | 'note'>) => [r.gross != null && 'gross sales', r.deductions.length && `${r.deductions.length} deduction(s)`, r.netPayout != null && 'net payout'].filter(Boolean).join(', ')

  if (/\.xlsx$/i.test(file.name)) {
    onStep?.('Reading the Excel file…')
    try {
      const { xlsxWorkbook } = await import('./xlsx')
      const book = await xlsxWorkbook(file)
      const z = parseZomatoWorkbook(book)
      if (z) {
        const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
        const paid = z.pending != null && z.pending > 0.5
          ? ` Zomato had not paid it yet when the report was made (${inr(z.pending)} pending): enter what reaches the bank when it arrives.` : ''
        return { ...z, method: 'xlsx', note: `Read the Zomato settlement report${z.orders ? ` (${z.orders} orders)` : ''}: ${found(z) || 'no figures found'}.${paid} Check every figure, then approve the deductions.` }
      }
      // Any other Excel statement: every sheet's rows, read like a CSV.
      const r = parseStatementLines(book.flatMap((s) => s.rows.map((row) => row.filter(Boolean).join(' '))))
      return { ...r, method: 'xlsx', note: `Read from the Excel file: ${found(r) || 'no figures found'}. Check every figure, then approve the deductions.` }
    } catch (e) {
      return { method: 'none', deductions: [], note: `Could not read this Excel file: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  if (/\.(xls|ods)$/i.test(file.name)) {
    return { method: 'none', deductions: [], note: 'This older Excel format can’t be read. Open it in Excel and use File → Save As → Excel Workbook (.xlsx) or CSV, then upload that.' }
  }
  if (isCsv) {
    onStep?.('Reading the CSV…')
    const r = parseStatementLines(csvLines(await file.text()))
    return { ...r, method: 'csv', note: `Read from the CSV: ${found(r) || 'no figures found'}. Check every figure, then approve the deductions.` }
  }
  if (isPdf) {
    onStep?.('Reading the PDF…')
    try {
      const lines = await pdfLines(file)
      if (lines.join('').replace(/\s/g, '').length > 30) {
        const r = parseStatementLines(lines)
        return { ...r, method: 'pdf-text', note: `Read from the text inside the PDF: ${found(r) || 'no figures found'}. Check every figure, then approve the deductions.` }
      }
    } catch { /* a scan: falls through to OCR */ }
  }
  if (!isPdf && !isImage) return { method: 'none', deductions: [], note: 'Upload the statement as a PDF, CSV or photo.' }

  // Scanned PDF or photo: Sarvam OCR on the server.
  try {
    const { readStatementOnline } = await import('./api')
    const { shrinkImage, pdfPageCount } = await import('./ocr')
    onStep?.('Reading the statement with OCR… (usually 5–20 seconds)')
    const send = isPdf ? file : await shrinkImage(file)
    const pages = isPdf ? await pdfPageCount(file) : 1
    const { statement: s } = await readStatementOnline(send, file.name, pages)
    const deductions: Omit<Deduction, 'id'>[] = []
    const add = (kind: DeductionKind, v?: number | null, label?: string | null) => { if (v) deductions.push({ kind, label: (label || DEDUCTION_KINDS[kind]).slice(0, 60), amount: r2(Math.abs(v)) }) }
    add('commission', s.commission); add('ads', s.advertisement); add('gateway', s.payment_gateway); add('gst', s.gst_on_charges); add('tds', s.tds_tcs)
    for (const o of s.other_charges ?? []) add('other', o.amount, o.label)
    const text = [s.partner, s.outlet].filter(Boolean).join(' ')
    const from = s.period_from ? findDate(s.period_from) : undefined
    const r = {
      partner: PARTNERS.find((p) => new RegExp(p.name, 'i').test(text))?.id,
      branch: BRANCHES.find((b) => b.id !== 'CK' && new RegExp(b.name.replace(/\s+/g, '\\s*'), 'i').test(text))?.id,
      from, to: s.period_to ? findDate(s.period_to) : undefined, week: from ? weekStart(from) : undefined,
      gross: s.gross_sales ?? undefined, deductions, netPayout: s.net_payout ?? undefined, utr: s.utr ?? undefined,
    }
    return { ...r, method: 'sarvam', note: `Read by OCR: ${found(r) || 'no figures found'}. Check every figure against the statement, then approve the deductions.` }
  } catch (e) {
    return { method: 'none', deductions: [], note: `Could not read this statement: ${e instanceof Error ? e.message : String(e)} Type the figures in below.` }
  }
}
