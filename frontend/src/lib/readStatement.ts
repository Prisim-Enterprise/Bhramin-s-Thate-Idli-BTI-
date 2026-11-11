import { pdfLines } from './readImprestPdf'
import { findDate } from './readBill'
import { BRANCHES } from '../data/mock'
import { DEDUCTION_KINDS, PARTNERS, weekStart, type Deduction, type DeductionKind, type PartnerId } from '../data/settlements'

// Reads a partner's weekly payout statement (Swiggy, Zomato, Rapido, Mobikwik):
//  - PDF with text, or CSV: read here in the browser (exact, free, no daily limit)
//  - scanned PDF or photo: read by Sarvam OCR on the server (counts toward the daily reading limit)
// Whatever can't be found is left empty (N/A) for the person to fill in. Nothing is approved automatically.

export type StatementRead = {
  method: 'pdf-text' | 'csv' | 'sarvam' | 'none'
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

/** Read an uploaded statement file. */
export async function readStatementFile(file: File, onStep?: (s: string) => void): Promise<StatementRead> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
  const isImage = file.type.startsWith('image/')
  const found = (r: Omit<StatementRead, 'method' | 'note'>) => [r.gross != null && 'gross sales', r.deductions.length && `${r.deductions.length} deduction(s)`, r.netPayout != null && 'net payout'].filter(Boolean).join(', ')

  if (/\.(xlsx?|ods)$/i.test(file.name)) {
    return { method: 'none', deductions: [], note: 'Excel files can’t be read yet. In Excel use File → Save As → CSV, then upload the CSV (or upload the PDF statement).' }
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
