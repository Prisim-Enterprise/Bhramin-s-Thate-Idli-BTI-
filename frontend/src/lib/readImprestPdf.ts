import { BRANCHES } from '../data/mock'
import { blankEntry, guessType, type DayEntry } from '../data/entries'

// Reads an Imprest Book PDF saved from Tally. These PDFs carry real text,
// so we read it directly: exact numbers, no OCR. Scanned PDFs have no text
// and are reported back so the user can type the figures instead.

export type ReadResult =
  // printedClosing = closing balance printed in the PDF; balanced = our figures arrive at the same closing.
  | { ok: true; entry: DayEntry; found: number; skipped: string[]; printedClosing: number | null; balanced: boolean | null }
  | { ok: false; reason: string }

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
const AMT = '([\\d,]+\\.\\d{1,2})'
const num = (s: string) => Number(s.replace(/,/g, ''))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** "24-Aug-26" -> "2026-08-24" */
function tallyDate(s: string): string | null {
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/)
  if (!m) return null
  const mm = MONTHS[m[2].toLowerCase()]
  if (!mm) return null
  const yyyy = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${yyyy}-${mm}-${m[1].padStart(2, '0')}`
}

/** Pull the text out of the PDF, one string per printed line. */
export async function pdfLines(file: Blob): Promise<string[]> {
  return (await pdfPageLines(file)).flat()
}

/** The text of each page separately (one bill per page in a stack of scanned bills). */
export async function pdfPageLines(file: Blob): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const lines: string[] = []
    pages.push(lines)
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Group text pieces into printed lines, then sort each line left to right.
    // Pieces in different font sizes sit a little higher or lower on the same line (Tally does this),
    // so a piece joins a line when it is within half a text height of it, not by fixed bands.
    const items = content.items
      .filter((it): it is typeof it & { str: string; transform: number[]; height: number } => 'str' in it && !!it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], h: Math.abs(it.height || it.transform[3]) || 8, s: it.str.trim() }))
      .sort((a, b) => b.y - a.y)
    const rows: { y: number; h: number; parts: typeof items }[] = []
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, it.h) * 0.6))
      if (row) row.parts.push(it)
      else rows.push({ y: it.y, h: it.h, parts: [it] })
    }
    rows
      .sort((a, b) => b.y - a.y)
      .forEach((r) => lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ').replace(/\s+/g, ' ')))
  }
  return pages
}

export async function readImprestPdf(file: File): Promise<ReadResult> {
  let lines: string[]
  try {
    lines = await pdfLines(file)
  } catch {
    return { ok: false, reason: 'This file could not be opened as a PDF.' }
  }
  if (lines.join('').length < 20) {
    return { ok: false, reason: 'This PDF has no text inside (it looks like a scan or photo). Please type the figures in instead.' }
  }
  return parseImprestLines(lines, file.name)
}

/** Turn the printed lines of an Imprest Book into a day entry. */
export function parseImprestLines(lines: string[], fileName: string): ReadResult {
  const e = blankEntry()
  e.source = 'pdf'
  e.fileName = fileName
  let found = 0
  let printedClosing: number | null = null
  const skipped: string[] = []

  for (const line of lines) {
    // Branch: "Chandra Layout - Imprest Book"
    const title = line.match(/^(.+?)\s*-\s*Imprest\s+Book/i)
    if (title) {
      const b = BRANCHES.find((x) => norm(x.name) === norm(title[1]))
      if (b) e.branch = b.id
      continue
    }
    // Date: "For 24-Aug-26"
    const forDate = line.match(/^For\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i)
    if (forDate) {
      e.date = tallyDate(forDate[1]) ?? e.date
      continue
    }
    // Opening balance
    const open = line.match(new RegExp(`Opening Balance\\s+${AMT}`, 'i'))
    if (open) { e.opening = num(open[1]); found++; continue }
    // Closing balance, to check the reading: "Dr Closing Balance 3,93,182.00"
    const close = line.match(new RegExp(`Closing Balance\\s+${AMT}`, 'i'))
    if (close) { printedClosing = num(close[1]); continue }

    // Journal detail lines: "Mobikwik - Chandralayout 18,486.00 Dr"
    const det = line.match(new RegExp(`^(.+?)\\s+${AMT}\\s*(Dr|Cr)$`, 'i'))
    if (det && !/^(Dr|Cr)\s/i.test(line)) {
      const [, name, a, side] = det
      const v = num(a)
      const n = name.toLowerCase()
      found++
      if (/mobikwik/.test(n)) e.mobikwik += v
      else if (/swiggy/.test(n)) e.swiggy += v
      else if (/zomato/.test(n)) e.zomato += v
      else if (/rapido/.test(n)) e.rapido += v
      else if (/cgst/.test(n)) e.cgst += v
      else if (/sgst/.test(n)) e.sgst += v
      else if (/container/.test(n)) e.container += v
      else if (/discount/.test(n)) e.discount += v
      else if (/round\s*off/.test(n)) e.roundOff += side.toLowerCase() === 'cr' ? v : -v
      else if (/^sales/.test(n)) e.sales += v
      else { found--; skipped.push(line) }
      continue
    }

    // Money paid out: "Dr Water Tanker Journal 10954 900.00" (the voucher type is sometimes printed on a line of its own)
    const pay = line.match(new RegExp(`^Dr\\s+(.+?)\\s+(?:(?:Journal|Payment|Contra|Receipt)\\s+)?(\\d+)\\s+${AMT}$`, 'i'))
    if (pay) {
      const ledger = pay[1].replace(/\s+(Journal|Payment|Contra|Receipt)$/i, '').trim()
      e.payouts.push({ ledger, amount: num(pay[3]), type: guessType(ledger) })
      found++
    } else if (/^Dr\s/i.test(line)) skipped.push(line)
  }

  if (!found) return { ok: false, reason: "No Imprest Book lines were found in this PDF. Check it's the right file, or type the figures in." }
  // Adding decimals can leave tiny errors (787.2800000001); keep two places.
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const k of ['opening', 'sales', 'cgst', 'sgst', 'container', 'discount', 'roundOff', 'mobikwik', 'swiggy', 'zomato', 'rapido'] as const) e[k] = r2(e[k])
  const ours = r2(e.opening + e.sales + e.cgst + e.sgst + e.container + e.roundOff - e.discount
    - (e.mobikwik + e.swiggy + e.zomato + e.rapido) - e.payouts.reduce((s, p) => s + p.amount, 0))
  // The Dr/Cr word printed before "Closing Balance" varies between Tally layouts, so compare the amount.
  const balanced = printedClosing == null ? null : Math.abs(Math.abs(ours) - printedClosing) < 1
  return { ok: true, entry: e, found, skipped, printedClosing, balanced }
}
