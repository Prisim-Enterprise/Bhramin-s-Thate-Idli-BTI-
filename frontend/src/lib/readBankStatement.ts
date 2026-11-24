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
  const DATE = /^\d{1,2}[-/. ][A-Za-z0-9]{2,4}[-/. ]\d{2,4}\b/
  const AMT = /-?[\d,]+\.\d{2}(?:\s?(?:cr|dr)\b)?/gi
  // Page headers and footers: they end a row and are never part of a description.
  const NOISE = /page \d|particulars|remarks|\(inr\)|^date\b|statement|disclaimer|generated|^total|closing balance|balance in|signature/i
  type Row = { date: string; narr: string[]; amounts: number[] }
  const rows: Row[] = []
  let opening: number | null = null
  let open: Row | null = null // a row still waiting for its amount (description wrapped onto the next line)
  let last: Row | null = null // a finished row whose description may carry on onto the next line
  let totDr: number | null = null, totCr: number | null = null
  const amountsIn = (s: string) => (s.match(AMT) ?? []).map(num)
  const words = (s: string) => s.replace(AMT, ' ').replace(/\s+/g, ' ').trim()
  for (const raw of text) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line) continue
    if (/opening balance/i.test(line)) { const n = amountsIn(line); if (n.length && opening == null) opening = n[n.length - 1]; open = last = null; continue } // repeated on every page: keep the first
    const td = line.match(/total debit\s*:?\s*(-?[\d,]*\.\d{2})/i), tc = line.match(/total credit\s*:?\s*(-?[\d,]*\.\d{2})/i)
    if (td || tc) { if (td) totDr = num(td[1]); if (tc) totCr = num(tc[1]) }
    else if (/\btotal\b\s*:?/i.test(line)) { const n = line.slice(line.search(/\btotal\b/i)).match(/-?[\d,]*\.\d{2}/g); if (n?.length === 2) { totDr = num(n[0]); totCr = num(n[1]) } }
    if (DATE.test(line)) {
      const date = findDate(line.slice(0, 12))
      if (!date) continue
      // drop the date and a value date after it
      const rest = line.replace(DATE, '').trim().replace(/^\d{1,2}[-/. ][A-Za-z0-9]{2,4}[-/. ]\d{2,4}\b/, '').trim()
      const row: Row = { date, narr: [words(rest)], amounts: amountsIn(rest) }
      if (row.amounts.length >= 2) { rows.push(row); last = row; open = null } else { open = row; last = null }
      continue
    }
    if (NOISE.test(line)) { open = last = null; continue }
    if (open) {
      open.narr.push(words(line))
      open.amounts.push(...amountsIn(line))
      if (open.amounts.length >= 2) { rows.push(open); last = open; open = null }
    } else if (last && !amountsIn(line).length && line.length <= 60) last.narr.push(line)
  }

  // Amount and balance are the last two figures. Banks list oldest first or newest first:
  // the order whose balances move by each row's amount is the right one.
  const items = rows.map((r) => ({ date: r.date, narration: r.narr.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), amount: Math.abs(r.amounts[r.amounts.length - 2]), balance: r.amounts[r.amounts.length - 1] }))
  const fits = (list: typeof items) => list.slice(1).filter((x, i) => Math.abs(Math.abs(x.balance - list[i].balance) - x.amount) < 0.01).length
  if (items.length > 1 && fits([...items].reverse()) > fits(items)) items.reverse()

  const out: StatementLine[] = items.map((x, i) => {
    let isDep: boolean | null = null
    const before = i > 0 ? items[i - 1].balance : opening
    if (before != null && Math.abs(Math.abs(x.balance - before) - x.amount) < 0.01) isDep = x.balance > before
    return { date: x.date, narration: x.narration, ref: refOf(x.narration), withdrawal: isDep === false ? r2(x.amount) : 0, deposit: isDep === true ? r2(x.amount) : 0, balance: x.balance, _unknown: isDep == null } as StatementLine & { _unknown?: boolean }
  })
  // The first row with no opening balance: settle it from the statement's totals, else from the words.
  for (const l of out as (StatementLine & { _unknown?: boolean })[]) {
    if (!l._unknown) continue
    const amount = items[out.indexOf(l)].amount
    const dep = out.reduce((t, x) => t + x.deposit, 0), wd = out.reduce((t, x) => t + x.withdrawal, 0)
    const isDep = totCr != null && Math.abs(totCr - dep - amount) < 0.01 ? true
      : totDr != null && Math.abs(totDr - wd - amount) < 0.01 ? false
      : /\bcr\b|credit|deposit|neft cr|imps cr|\bby\b/i.test(l.narration)
    l.deposit = isDep ? r2(amount) : 0
    l.withdrawal = isDep ? 0 : r2(amount)
    delete l._unknown
  }
  return out
}

/** The bank's reference for a transfer: a UTR (e.g. CITIN26756336932, AXISCN1522569941) or an IMPS number. */
function refOf(narration: string) {
  const tagged = narration.match(/\b(?:UTR|REF|CHQ)[:\s#]*([A-Z0-9]{6,22})/i)?.[1]
  if (tagged) return tagged
  const tokens = narration.split(/[\s/\-]+/)
  return tokens.find((t) => /^[A-Z]{4}[A-Z0-9]{8,18}$/.test(t) && (t.match(/\d/g) ?? []).length >= 6)
    ?? tokens.find((t) => /^\d{12}$/.test(t)) ?? ''
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
