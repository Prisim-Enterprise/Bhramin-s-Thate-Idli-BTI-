import { BRANCHES } from '../data/mock'
import { blankEntry, guessType, type DayEntry } from '../data/entries'

// Reads an Imprest Book PDF saved from Tally. These PDFs carry real text,
// so we read it directly: exact numbers, no OCR. Scanned PDFs have no text
// and are reported back so the user can type the figures instead.

export type ReadResult =
  | { ok: true; entry: DayEntry; found: number; skipped: string[] }
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
export async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Group text pieces by their height on the page, then sort left to right.
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3) * 3
      const x = it.transform[4]
      rows.set(y, [...(rows.get(y) ?? []), { x, s: it.str.trim() }])
    }
    ;[...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => lines.push(parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ').replace(/\s+/g, ' ')))
  }
  return lines
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

    // Money paid out: "Dr Water Tanker Journal 10954 900.00"
    const pay = line.match(new RegExp(`^Dr\\s+(.+?)\\s+(Journal|Payment|Contra|Receipt)\\s+\\S+\\s+${AMT}$`, 'i'))
    if (pay) {
      e.payouts.push({ ledger: pay[1], amount: num(pay[3]), type: guessType(pay[1]) })
      found++
    }
  }

  if (!found) return { ok: false, reason: "No Imprest Book lines were found in this PDF. Check it's the right file, or type the figures in." }
  // Adding decimals can leave tiny errors (787.2800000001); keep two places.
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const k of ['opening', 'sales', 'cgst', 'sgst', 'container', 'discount', 'roundOff', 'mobikwik', 'swiggy', 'zomato', 'rapido'] as const) e[k] = r2(e[k])
  return { ok: true, entry: e, found, skipped }
}
