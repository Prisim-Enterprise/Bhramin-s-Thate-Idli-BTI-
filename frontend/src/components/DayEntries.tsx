import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileUp, Loader2, PencilLine, Trash2, X } from 'lucide-react'
import { Badge, Card, Table } from './ui'
import { ReportHeader, money } from './report'
import { branchName, inr } from '../data/mock'
import {
  PAYOUT_TYPES, billTotal, cashIn, closing, deleteEntry, findDuplicate, fmtDateTime, getEntry, inMonth, niceDate, paidOut, saveEntry, useEntries, viaApps,
  type DayEntry, type PayoutType,
} from '../data/entries'
import { useAuth } from '../context/AuthContext'
import { readImprestPdf } from '../lib/readImprestPdf'
import { debitLines, groupOf, reportOf, useCustomLedgers, useManualVouchers } from '../data/ledgerStore'
import { imprestLedger } from '../data/books'

type Upload = {
  file: string
  outcome: 'saved' | 'check' | 'duplicate' | 'failed'
  text: string
  entry?: DayEntry
  savedId?: string
}

/** Read one Imprest Book PDF; save it straight away when it balances to the printed closing balance. */
export async function importImprest(file: File, by: string): Promise<Upload> {
  const r = await readImprestPdf(file)
  if (!r.ok) return { file: file.name, outcome: 'failed', text: r.reason }
  const e = r.entry
  const what = `${branchName(e.branch)} · ${niceDate(e.date)}`
  const dup = findDuplicate(e.branch, e.date)
  if (dup) return { file: file.name, outcome: 'duplicate', text: `${what} is already entered. Open it to compare, or Replace it with this PDF.`, entry: e, savedId: dup.id }
  if (r.balanced === false) {
    return { file: file.name, outcome: 'check', entry: e,
      text: `${what}: our total comes to ${inr(closing(e))} but the PDF's closing balance is ${inr(r.printedClosing ?? 0)}. Check the figures before saving.` }
  }
  if (r.skipped.length) return { file: file.name, outcome: 'check', entry: e, text: `${what}: ${r.skipped.length} line(s) could not be read. Check before saving.` }
  const saved = saveEntry(e, by)
  const paid = paidOut(e)
  return {
    file: file.name, outcome: 'saved', savedId: saved.id,
    text: `${what}: sales ${inr(e.sales)}, paid out ${inr(paid)}${r.balanced ? ' · matches the closing balance ✓' : ''}`,
  }
}

const OUTCOME: Record<Upload['outcome'], [string, 'green' | 'amber' | 'red' | 'slate']> = {
  saved: ['Saved', 'green'], check: ['Needs a check', 'amber'], duplicate: ['Already entered', 'slate'], failed: ['Not read', 'red'],
}

// The last upload's results live outside the buttons: saving the first day switches a report from its
// empty layout to its full one, which redraws the buttons, and the results must survive that.
let upload: { busy: string | null; results: Upload[] } = { busy: null, results: [] }
const uploadListeners = new Set<() => void>()
const setUpload = (p: Partial<typeof upload>) => { upload = { ...upload, ...p }; uploadListeners.forEach((l) => l()) }
const useUpload = () => useSyncExternalStore((l) => { uploadListeners.add(l); return () => { uploadListeners.delete(l) } }, () => upload)

/** "Enter manually" and "Upload PDF" buttons. PDFs that balance are saved at once; the rest open for checking. */
export function AddEntryButtons({ disabled }: { disabled?: boolean }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const { busy, results } = useUpload()
  const setBusy = (b: string | null) => setUpload({ busy: b })
  const setResults = (r: Upload[]) => setUpload({ results: r })

  const onFiles = async (files: File[]) => {
    if (!files.length) return
    const out: Upload[] = []
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `Reading ${i + 1} of ${files.length}…` : 'Reading PDF…')
      out.push(await importImprest(f, auth.email ?? 'Demo user'))
    }
    setBusy(null)
    if (input.current) input.current.value = ''
    // One PDF that needs checking: open it on the entry screen, as before.
    if (out.length === 1 && out[0].outcome === 'check') return navigate('/admin/accounting/entry', { state: { entry: out[0].entry } })
    setResults(out)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={disabled} onClick={() => navigate('/admin/accounting/entry')}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[#7a2228] bg-white px-4 py-2.5 font-semibold text-[#7a2228] hover:bg-[#fbf3e4] disabled:opacity-50">
          <PencilLine size={18} /> Enter manually
        </button>
        <button disabled={disabled || !!busy} onClick={() => input.current?.click()} title="Imprest Book PDFs from Tally. You can pick several at once."
          className="inline-flex items-center gap-2 rounded-xl bg-[#7a2228] px-4 py-2.5 font-semibold text-white hover:bg-[#5a1a1f] disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />} {busy ?? 'Upload PDF'}
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="Imprest Book PDFs"
          onChange={(ev) => void onFiles([...(ev.target.files ?? [])])} />
      </div>
      {results.length > 0 && (
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-3 text-left text-sm shadow-sm" role="status">
          <div className="mb-2 flex items-center justify-between">
            <b>Imprest Book upload</b>
            <button className="text-slate-400 hover:text-slate-700" aria-label="Close" onClick={() => setResults([])}><X size={16} /></button>
          </div>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge tone={OUTCOME[r.outcome][1]}>{OUTCOME[r.outcome][0]}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800">{r.text}</span>
                  <span className="block truncate text-xs text-slate-400">{r.file}</span>
                </span>
                {r.outcome === 'check' && r.entry && (
                  <button className="shrink-0 font-medium text-[#7a2228] hover:underline" onClick={() => navigate('/admin/accounting/entry', { state: { entry: r.entry } })}>Check</button>
                )}
                {r.outcome === 'duplicate' && r.entry && r.savedId && (
                  <button className="shrink-0 font-medium text-[#7a2228] hover:underline" onClick={() => {
                    const old = getEntry(r.savedId!)
                    if (!confirm(`Replace the saved ${branchName(r.entry!.branch)} · ${niceDate(r.entry!.date)} with this PDF?`)) return
                    saveEntry({ ...r.entry!, id: r.savedId!, addedAt: old?.addedAt, addedBy: old?.addedBy }, auth.email ?? 'Demo user')
                    setResults(results.map((x) => (x === r ? { ...x, outcome: 'saved', text: `${branchName(r.entry!.branch)} · ${niceDate(r.entry!.date)} replaced with this PDF` } : x)))
                  }}>Replace</button>
                )}
                {r.savedId && r.outcome !== 'check' && (
                  <Link className="shrink-0 font-medium text-[#7a2228] hover:underline" to={`/admin/accounting/entry/${r.savedId}`}>Open</Link>
                )}
              </li>
            ))}
          </ul>
          {results.some((r) => r.outcome === 'saved') && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Saved days now show in the Sales, Expenses, Purchases, Food Cost, Deductions and Profit &amp; Loss reports, and in Account Books.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Saved day entries, newest first. */
export function EntriesList({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const entries = useEntries()
  if (!entries.length) {
    return (
      <Card title="Day entries">
        <p className="text-sm text-slate-500">No entries yet. Use <b>Enter manually</b> or <b>Upload PDF</b> to add a branch's day.</p>
      </Card>
    )
  }
  return (
    <Card title={`Day entries (${entries.length})`} pad={false}>
      <Table head={['Date', 'Branch', 'From', 'Total billed', 'Cash collected', 'Paid out', 'Closing', 'Added by', '']}>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{niceDate(e.date)}</td>
            <td className="font-medium text-slate-900">{branchName(e.branch)}</td>
            <td><Badge tone={e.source === 'pdf' ? 'blue' : 'slate'}>{e.source === 'pdf' ? 'PDF' : 'Manual'}</Badge></td>
            <td className="tabular-nums">{inr(billTotal(e))}</td>
            <td className="tabular-nums">{inr(cashIn(e))}</td>
            <td className="tabular-nums">{inr(paidOut(e))}</td>
            <td className="tabular-nums font-medium">{inr(closing(e))}</td>
            <td>
              <span className="block text-slate-900">{e.addedBy ?? 'unknown'}</span>
              <span className="block text-xs text-slate-500">{fmtDateTime(e.addedAt ?? e.savedAt)}</span>
            </td>
            <td className="text-right">
              {canEdit && <Link to={`/admin/accounting/entry/${e.id}`} className="mr-3 text-sm font-medium text-[#7a2228] hover:underline">Open</Link>}
              {canDelete && (
                <button aria-label="Delete entry" className="align-middle text-slate-400 hover:text-rose-600"
                  onClick={() => { if (confirm(`Delete ${branchName(e.branch)} · ${niceDate(e.date)}?`)) deleteEntry(e.id) }}>
                  <Trash2 size={16} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}

/** Sales lines from day entries, for the Sales Report. */
export function EntrySales({ month, branch }: { month?: string; branch?: string }) {
  const list = inMonth(useEntries(), month).filter((e) => !branch || e.branch === branch)
  if (!list.length) return null
  const sum = (f: (e: (typeof list)[number]) => number) => list.reduce((s, e) => s + f(e), 0)
  return (
    <Card title="From day entries" pad={false}>
      <Table head={['Date', 'Branch', 'Food sales', 'GST', 'Container', 'Discount', 'Total billed', 'Apps & UPI', 'Cash']}>
        {list.map((e) => (
          <tr key={e.id}>
            <td>{niceDate(e.date)}</td>
            <td className="font-medium text-slate-900">{branchName(e.branch)}</td>
            <td className="tabular-nums">{inr(e.sales)}</td>
            <td className="tabular-nums">{inr(e.cgst + e.sgst)}</td>
            <td className="tabular-nums">{inr(e.container)}</td>
            <td className="tabular-nums">{inr(e.discount)}</td>
            <td className="tabular-nums font-medium">{inr(billTotal(e))}</td>
            <td className="tabular-nums">{inr(viaApps(e))}</td>
            <td className="tabular-nums">{inr(cashIn(e))}</td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td colSpan={2}>Total</td>
          <td className="tabular-nums">{inr(sum((e) => e.sales))}</td>
          <td className="tabular-nums">{inr(sum((e) => e.cgst + e.sgst))}</td>
          <td className="tabular-nums">{inr(sum((e) => e.container))}</td>
          <td className="tabular-nums">{inr(sum((e) => e.discount))}</td>
          <td className="tabular-nums">{inr(sum(billTotal))}</td>
          <td className="tabular-nums">{inr(sum(viaApps))}</td>
          <td className="tabular-nums">{inr(sum(cashIn))}</td>
        </tr>
      </Table>
    </Card>
  )
}

/** Expense, purchase or salary lines: from day entries and from receipts posted in Account Books. */
export function usePayoutRows(type: PayoutType, month?: string) {
  const entries = inMonth(useEntries(), month)
  const manual = useManualVouchers().filter((m) => !month || m.date.startsWith(month))
  const custom = useCustomLedgers()
  return [
    ...entries.flatMap((e) => e.payouts.filter((p) => p.type === type).map((p, i) => ({
      key: e.id + i, date: e.date, branch: e.branch, ledger: p.ledger, amount: p.amount, from: 'Day entry',
    }))),
    // A voucher counts toward a report by the ledger it debits (e.g. Dr Groceries Purchased -> Purchases).
    // A purchase bill can debit several ledgers (vegetables, groceries …); each counts on its own.
    ...manual.flatMap((m) => debitLines(m, imprestLedger).map((l, i) => ({ m, l, i })))
      .filter(({ l }) => reportOf(groupOf(l.ledger, custom)) === type)
      .map(({ m, l, i }) => ({ key: m.id + i, date: m.date, branch: m.branch, ledger: l.ledger, amount: l.dr, from: m.billId ? 'Bill (OCR inbox)' : `${m.type} voucher` })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

export function EntryPayouts({ type, month }: { type: PayoutType; month?: string }) {
  const rows = usePayoutRows(type, month)
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <Card title={`${PAYOUT_TYPES[type]} lines from day entries and receipts · ${money(total, false)}`} pad={false}>
      <Table head={['Date', 'Branch', 'What for', 'From', 'Amount']}>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{niceDate(r.date)}</td>
            <td className="font-medium text-slate-900">{branchName(r.branch)}</td>
            <td>{r.ledger}</td>
            <td className="text-slate-500">{r.from}</td>
            <td className="tabular-nums">{inr(r.amount)}</td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold"><td colSpan={4}>Total</td><td className="tabular-nums">{inr(total)}</td></tr>
      </Table>
    </Card>
  )
}

/** Totals from day entries in a month, for the Accounting tiles. */
export function useEntryTotals(month?: string) {
  const list = inMonth(useEntries(), month)
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0)
  const expense = sum(usePayoutRows('expense', month))
  const purchase = sum(usePayoutRows('purchase', month))
  const salary = sum(usePayoutRows('salary', month))
  return { count: list.length, sales: list.reduce((s, e) => s + e.sales, 0), expense, purchase, salary }
}

/** A report page that so far only has day-entry lines. */
export function EntriesOnly({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title={title} period="From day entries" />
      {children}
    </div>
  )
}
