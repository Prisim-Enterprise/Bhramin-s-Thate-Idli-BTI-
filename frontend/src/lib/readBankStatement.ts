import { findDate } from './readBill'
import { excelDate, htmlRows, xlsxRows } from './xlsx'

// Reads a bank statement (Excel .xlsx, an HTML "xls", CSV, or a PDF with text) into plain lines:
// date, narration, reference, withdrawal, deposit, balance. Works with the column names Indian banks use.

export type StatementLine = { date: string; narration: string; ref: string; withdrawal: number; deposit: number; balance: number | null }
export type BankStatement = { lines: StatementLine[]; from?: string; to?: string; closing?: number | null; note: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string | undefined) => {
  if (!s) return 0
  const neg = /^\(.*\)$|-\s*$|^-|dr$/i.test(s.trim())
  const n = Number(s.replace(/[₹,\s]|cr$|dr$|inr|rs\.?/gi, '').replace(/^\((.*)\)$/, '$1').replace(/-$/, ''))
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0
}
const dateOf = (s: string | undefined) => {
  if (!s) return undefined
  const t = s.trim()
  if (/^\d{5}(\.\d+)?$/.test(t)) { const n = Number(t); if (n > 30000 && n < 60000) return excelDate(n) } // Excel day number
  return findDate(t)
}

/** Find the header row and which column holds what. Kept separate so it can be tested. */
export function linesFromRows(rows: string[][]): StatementLine[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  let h = -1
  let cols = { date: -1, narr: -1, ref: -1, wd: -1, dep: -1, bal: -1, amt: -1, drcr: -1 }
  for (let i = 0; i < Math.min(rows.length, 40) && h < 0; i++) {
    const r = rows[i].map((c) => norm(c ?? ''))
    const find = (re: RegExp, not?: RegExp) => r.findIndex((c) => re.test(c) && !(not && not.test(c)))
    const c = {
      date: (() => { const t = find(/^(txn|tran|transaction|posting)? ?date$|^date$/); return t >= 0 ? t : find(/date/, /value/) })(),
      narr: find(/narration|description|particulars|remarks|details|transaction details/),
      ref: find(/ref|chq|cheque|utr|instrument/),
      wd: find(/withdrawal|debit|^dr$|paid out|payments?/, /credit/),
      dep: find(/deposit|credit|^cr$|paid in|receipts?/, /debit/),
      bal: find(/balance/),
      amt: find(/^amount|txn amount|transaction amount/),
      drcr: find(/^dr ?cr$|^cr ?dr$|^type$|dr cr/),
    }
    if (c.date >= 0 && ((c.wd >= 0 && c.dep >= 0) || c.amt >= 0)) { h = i; cols = c }
  }
  if (h < 0) return []
  const out: StatementLine[] = []
  for (const r of rows.slice(h + 1)) {
    const date = dateOf(r[cols.date])
    if (!date) continue
    let wd = 0, dep = 0
    if (cols.wd >= 0 && cols.dep >= 0) { wd = Math.abs(num(r[cols.wd])); dep = Math.abs(num(r[cols.dep])) }
    else {
      const a = num(r[cols.amt]); const t = (r[cols.drcr] ?? '').toLowerCase()
      if (/dr|debit|d$/.test(t) || (!t && a < 0)) wd = Math.abs(a); else dep = Math.abs(a)
    }
    if (!wd && !dep) continue
    out.push({ date, narration: (r[cols.narr] ?? '').trim(), ref: (r[cols.ref] ?? '').trim(), withdrawal: r2(wd), deposit: r2(dep), balance: cols.bal >= 0 && r[cols.bal] ? num(r[cols.bal]) : null })
  }
  return out
}

/**
 * A PDF statement as text lines: each transaction line starts with a date and ends with amount and balance.
 * Whether it is a withdrawal or a deposit comes from how the balance moved.
 */
export function linesFromText(text: string[]): StatementLine[] {
  const out: StatementLine[] = []
  let prev: number | null = null
  for (const raw of text) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (/opening balance/i.test(line)) { const n = line.match(/-?[\d,]+\.\d{2}/g); if (n) prev = num(n[n.length - 1]); continue }
    const date = /^\d{1,2}[-/. ][A-Za-z0-9]{2,4}[-/. ]\d{2,4}/.test(line) ? findDate(line.slice(0, 12)) : undefined
    if (!date) continue
    const nums = (line.match(/-?[\d,]+\.\d{2}(?:\s?(?:cr|dr))?/gi) ?? []).map(num)
    if (nums.length < 2) continue
    const balance = nums[nums.length - 1], amount = Math.abs(nums[nums.length - 2])
    const isDep = prev != null ? r2(balance - prev) > 0 : /\bcr\b|credit|deposit|neft cr|imps cr/i.test(line)
    const narration = line.replace(/^\S+\s+(\S+\s+)?/, '').replace(/-?[\d,]+\.\d{2}(\s?(cr|dr))?/gi, '').replace(/\s+/g, ' ').trim()
    out.push({ date, narration, ref: line.match(/\b(?:UTR|REF|CHQ)[:\s#]*([A-Z0-9]{6,22})/i)?.[1] ?? '', withdrawal: isDep ? 0 : r2(amount), deposit: isDep ? r2(amount) : 0, balance })
    prev = balance
  }
  return out
}

export async function readBankStatement(file: File): Promise<BankStatement> {
  const name = file.name.toLowerCase()
  let lines: StatementLine[] = []
  let how = ''
  if (name.endsWith('.xlsx')) { lines = linesFromRows(await xlsxRows(file)); how = 'Excel' }
  else if (name.endsWith('.csv') || file.type === 'text/csv') { lines = linesFromRows(csvRows(await file.text())); how = 'CSV' }
  else if (name.endsWith('.xls') || name.endsWith('.htm') || name.endsWith('.html')) {
    const text = await file.text()
    if (!/<table/i.test(text)) return { lines: [], note: 'This is an old-style .xls file. Open it in Excel and save it as .xlsx or CSV, then upload it again.' }
    lines = linesFromRows(htmlRows(text)); how = 'Excel (xls)'
  } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { pdfLines } = await import('./readImprestPdf')
    const text = await pdfLines(file)
    if (text.join('').replace(/\s/g, '').length < 40) return { lines: [], note: 'This PDF has no text in it (a scan). Download the statement from net banking as Excel, CSV or PDF.' }
    lines = linesFromText(text); how = 'PDF'
  } else return { lines: [], note: 'Upload the bank statement as Excel (.xlsx), CSV or PDF.' }
  lines.sort((a, b) => a.date.localeCompare(b.date))
  if (!lines.length) return { lines, note: `Could not find the transactions in this ${how} file. It needs columns for date and withdrawal/deposit (or amount).` }
  const withBal = lines.filter((l) => l.balance != null)
  return { lines, from: lines[0].date, to: lines[lines.length - 1].date, closing: withBal.length ? withBal[withBal.length - 1].balance : null, note: `Read ${lines.length} transaction(s) from the ${how} statement.` }
}

export function csvRows(text: string): string[][] {
  return text.split(/\r?\n/).map((row) => {
    const cells: string[] = []
    let cur = '', q = false
    for (const ch of row) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    return cells
  })
}
