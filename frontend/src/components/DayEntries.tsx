import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileUp, Loader2, PencilLine, Trash2 } from 'lucide-react'
import { Badge, Card, Table } from './ui'
import { ReportHeader, money } from './report'
import { branchName, inr } from '../data/mock'
import {
  PAYOUT_TYPES, billTotal, cashIn, closing, deleteEntry, fmtDateTime, inMonth, niceDate, paidOut, useEntries, viaApps, type PayoutType,
} from '../data/entries'
import { readImprestPdf } from '../lib/readImprestPdf'

/** "Enter manually" and "Upload PDF" buttons. Both open the day entry screen. */
export function AddEntryButtons({ disabled }: { disabled?: boolean }) {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const r = await readImprestPdf(file)
    setBusy(false)
    if (input.current) input.current.value = ''
    if (!r.ok) return setError(r.reason)
    navigate('/admin/accounting/entry', { state: { entry: r.entry, skipped: r.skipped } })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={disabled} onClick={() => navigate('/admin/accounting/entry')}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[#7a2228] bg-white px-4 py-2.5 font-semibold text-[#7a2228] hover:bg-[#fbf3e4] disabled:opacity-50">
          <PencilLine size={18} /> Enter manually
        </button>
        <button disabled={disabled || busy} onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#7a2228] px-4 py-2.5 font-semibold text-white hover:bg-[#5a1a1f] disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />} {busy ? 'Reading PDF…' : 'Upload PDF'}
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(ev) => onFile(ev.target.files?.[0])} />
      </div>
      {error && <p className="max-w-md rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
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
export function EntrySales({ month }: { month?: string }) {
  const list = inMonth(useEntries(), month)
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

/** Expense, purchase or salary lines from day entries, for that report. */
export function EntryPayouts({ type, month }: { type: PayoutType; month?: string }) {
  const rows = inMonth(useEntries(), month).flatMap((e) => e.payouts.filter((p) => p.type === type).map((p, i) => ({ e, p, key: e.id + i })))
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.p.amount, 0)
  return (
    <Card title={`${PAYOUT_TYPES[type]} lines from day entries · ${money(total, false)}`} pad={false}>
      <Table head={['Date', 'Branch', 'What for', 'Amount']}>
        {rows.map(({ e, p, key }) => (
          <tr key={key}>
            <td>{niceDate(e.date)}</td>
            <td className="font-medium text-slate-900">{branchName(e.branch)}</td>
            <td>{p.ledger}</td>
            <td className="tabular-nums">{inr(p.amount)}</td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold"><td colSpan={3}>Total</td><td className="tabular-nums">{inr(total)}</td></tr>
      </Table>
    </Card>
  )
}

/** Totals from day entries in a month, for the Accounting tiles. */
export function useEntryTotals(month?: string) {
  const list = inMonth(useEntries(), month)
  return {
    count: list.length,
    sales: list.reduce((s, e) => s + e.sales, 0),
    expense: list.reduce((s, e) => s + paidOut(e, 'expense'), 0),
    purchase: list.reduce((s, e) => s + paidOut(e, 'purchase'), 0),
    salary: list.reduce((s, e) => s + paidOut(e, 'salary'), 0),
  }
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
