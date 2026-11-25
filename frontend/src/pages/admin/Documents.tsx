import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Eye, FolderOpen } from 'lucide-react'
import { ReportHeader, downloadCsv } from '../../components/report'
import { Badge, inputCls } from '../../components/ui'
import { BRANCHES, branchName, inr } from '../../data/mock'
import { billSums, useBills } from '../../data/billStore'
import { openReceipt, useManualVouchers, type ReceiptFile } from '../../data/ledgerStore'
import { partnerName, useSettlements, weekStart, addDays } from '../../data/settlements'
import { useUploads } from '../../data/uploads'
import { useEntries, niceDate } from '../../data/entries'
import { dataUrlToBlob, fileBlob } from '../../lib/api'

// Accounting → Documents: every file uploaded for the books, in one list, by day, week or month.
// Imprest Books, Cash Books, bank statements and Mobikwik reports come from the uploads store; supplier bills,
// partner statements and voucher receipts keep their file on their own record and are listed from there.

type DocType = 'imprest' | 'cashbook' | 'bill' | 'statement' | 'bank' | 'mobikwik' | 'receipt'
const TYPES: { id: DocType; label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'violet' }[] = [
  { id: 'imprest', label: 'Imprest Book', tone: 'blue' },
  { id: 'cashbook', label: 'Cash Book', tone: 'blue' },
  { id: 'bill', label: 'Supplier bill', tone: 'amber' },
  { id: 'statement', label: 'Swiggy / Zomato', tone: 'violet' },
  { id: 'bank', label: 'Bank statement', tone: 'green' },
  { id: 'mobikwik', label: 'Mobikwik report', tone: 'slate' },
  { id: 'receipt', label: 'Voucher receipt', tone: 'slate' },
]
const typeOf = (t: DocType) => TYPES.find((x) => x.id === t)!

type Row = {
  key: string; type: DocType; date: string; from?: string; branch?: string; title: string; detail: string
  amount?: number; status?: { text: string; tone: 'green' | 'amber' | 'red' | 'slate' }; file?: ReceiptFile; link?: string; by?: string; at?: string
}
type Mode = 'day' | 'week' | 'month' | 'all'

const today = () => new Date().toLocaleDateString('en-CA')
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }
const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const r2 = (n: number) => Math.round(n * 100) / 100

async function download(f: ReceiptFile) {
  try {
    const b = f.key ? await fileBlob(f.key) : f.dataUrl ? await dataUrlToBlob(f.dataUrl) : null
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b); a.download = f.name; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } catch { alert('Could not download the file. Check your connection and try again.') }
}

export default function Documents() {
  const uploads = useUploads(), bills = useBills(), settlements = useSettlements(), vouchers = useManualVouchers(), entries = useEntries()
  const [mode, setMode] = useState<Mode>('month')
  const [day, setDay] = useState(today())
  const [type, setType] = useState<DocType | ''>('')
  const [branch, setBranch] = useState('')
  const [q, setQ] = useState('')

  // Every document, newest first.
  const all = useMemo<Row[]>(() => {
    const rows: Row[] = []
    for (const u of uploads) rows.push({ key: 'u:' + u.id, type: u.kind, date: u.date, from: u.from, branch: u.branch, title: u.kind === 'bank' ? u.ledger ?? 'Bank statement' : u.name, detail: u.summary, amount: u.amount, file: u.file, link: u.link, by: u.uploadedBy, at: u.uploadedAt })
    for (const b of bills) {
      const s = billSums(b)
      rows.push({
        key: 'b:' + b.id, type: 'bill', date: b.date || (b.uploadedAt ?? '').slice(0, 10), branch: b.branch, title: b.vendor || 'Supplier bill',
        detail: `${b.id}${b.invoiceNo ? ' · Invoice ' + b.invoiceNo : ''} · ${b.lines.length} item(s), GST ${inr(s.gst)}`, amount: b.billTotal ?? s.total,
        status: b.voucherId ? { text: 'Posted', tone: 'green' } : { text: 'To check', tone: 'amber' }, file: b.file, link: `/admin/accounting/bills?id=${b.id}`, by: b.uploadedBy, at: b.uploadedAt,
      })
    }
    for (const s of settlements) {
      if (!s.file) continue
      const end = s.periodTo ?? s.weekEnd
      rows.push({
        key: 's:' + s.id, type: 'statement', date: end, from: s.periodFrom ?? s.date, branch: s.branch, title: `${partnerName(s.partner)} weekly statement`,
        detail: `${s.file.name}${s.utr && s.utr.length > 4 ? ' · UTR ' + s.utr : ''}`, amount: s.statementNet ?? s.gross ?? undefined,
        status: s.received != null ? { text: 'Received', tone: 'green' } : { text: 'Not received', tone: 'amber' }, file: s.file, link: `/admin/accounting/reconcile?week=${s.date}`, by: s.updatedBy ?? s.addedBy, at: s.updatedAt ?? s.addedAt,
      })
    }
    for (const v of vouchers) {
      if (!v.receipt || v.billId || v.cancelled) continue
      rows.push({ key: 'v:' + v.id, type: 'receipt', date: v.date, branch: v.branch, title: `${v.type} · ${v.drLedger ?? v.ledger ?? ''}`, detail: v.narration || v.receipt.name, amount: v.amount, file: v.receipt, link: '/admin/accounting/books', by: v.addedBy, at: v.addedAt })
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? '').localeCompare(a.at ?? ''))
  }, [uploads, bills, settlements, vouchers])

  // The period on screen.
  const range = useMemo(() => {
    if (mode === 'day') return { from: day, to: day, label: niceDate(day) }
    if (mode === 'week') { const s = weekStart(day), e = addDays(s, 6); return { from: s, to: e, label: `Week ${niceDate(s)} – ${niceDate(e)}` } }
    if (mode === 'month') { const m = day.slice(0, 7); return { from: m + '-01', to: monthEnd(m), label: monthLabel(m) } }
    return { from: '0000-01-01', to: '9999-12-31', label: 'All documents' }
  }, [mode, day])
  const step = (n: number) => {
    if (mode === 'day') setDay(addDays(day, n))
    else if (mode === 'week') setDay(addDays(day, 7 * n))
    else if (mode === 'month') { const d = new Date(day.slice(0, 7) + '-01T00:00:00'); d.setMonth(d.getMonth() + n); setDay(d.toLocaleDateString('en-CA')) }
  }

  // A document that covers several days shows in every period it touches.
  const words = q.trim().toLowerCase()
  const inRange = all.filter((r) => (r.from ?? r.date) <= range.to && r.date >= range.from)
  const rows = inRange.filter((r) => (!type || r.type === type) && (!branch || r.branch === branch)
    && (!words || `${r.title} ${r.detail} ${r.branch ? branchName(r.branch) : ''}`.toLowerCase().includes(words)))
  const count = (t: DocType) => inRange.filter((r) => r.type === t && (!branch || r.branch === branch)).length

  // Imprest Books expected in the period (one per outlet per day, from the first day any outlet has one) vs uploaded.
  const missing = useMemo(() => {
    if (mode === 'all') return []
    const outlets = BRANCHES.filter((b) => b.id !== 'CK' && (!branch || b.id === branch) && entries.some((e) => e.branch === b.id))
    const have = new Set(entries.map((e) => e.branch + ':' + e.date))
    const last = range.to < today() ? range.to : today()
    const out: { branch: string; days: string[] }[] = []
    for (const b of outlets) {
      const first = entries.filter((e) => e.branch === b.id).map((e) => e.date).sort()[0]
      const days: string[] = []
      for (let d = range.from > first ? range.from : first; d <= last; d = addDays(d, 1)) if (!have.has(b.id + ':' + d)) days.push(d)
      if (days.length) out.push({ branch: b.id, days })
    }
    return out
  }, [mode, range, branch, entries])

  const csv = () => downloadCsv(`BTI-Documents-${range.from}-${range.to}.csv`, [
    ['Date', 'From', 'Type', 'Outlet', 'Document', 'Details', 'Amount', 'Status', 'Uploaded by', 'Uploaded at', 'File'],
    ...rows.map((r) => [r.date, r.from ?? '', typeOf(r.type).label, r.branch ? branchName(r.branch) : '', r.title, r.detail, r.amount ?? '', r.status?.text ?? '', r.by ?? '', (r.at ?? '').slice(0, 16).replace('T', ' '), r.file?.name ?? '']),
  ])
  const sel = inputCls + ' !w-auto !py-1.5'

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Documents" period={range.label} onCsv={rows.length ? csv : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Period" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['day', 'week', 'month', 'all'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${mode === m ? 'bg-[#7a2228] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{m === 'all' ? 'All' : m}</button>
          ))}
        </div>
        {mode !== 'all' && (
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button aria-label="Earlier" className="px-2 py-1.5 text-slate-600 hover:text-slate-900" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
            {mode === 'month'
              ? <input type="month" aria-label="Month" className="bg-transparent py-1 text-sm outline-none" value={day.slice(0, 7)} onChange={(e) => e.target.value && setDay(e.target.value + '-01')} />
              : <input type="date" aria-label="Day" className="bg-transparent py-1 text-sm outline-none" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />}
            <button aria-label="Later" className="px-2 py-1.5 text-slate-600 hover:text-slate-900" onClick={() => step(1)}><ChevronRight size={16} /></button>
          </div>
        )}
        <select aria-label="Outlet" className={sel} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All outlets</option>{BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input aria-label="Search" placeholder="Search supplier, file, UTR…" className={inputCls + ' !w-56 !py-1.5'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setType('')} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${!type ? 'bg-[#7a2228] text-white ring-[#7a2228]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
          All <span className="opacity-70">{inRange.filter((r) => !branch || r.branch === branch).length}</span>
        </button>
        {TYPES.map((t) => (
          <button key={t.id} onClick={() => setType(type === t.id ? '' : t.id)} aria-pressed={type === t.id}
            className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${type === t.id ? 'bg-[#7a2228] text-white ring-[#7a2228]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
            {t.label} <span className="opacity-70">{count(t.id)}</span>
          </button>
        ))}
      </div>

      {missing.length > 0 && (!type || type === 'imprest') && (
        <div data-testid="missing-imprest" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Imprest Books not uploaded:</b>{' '}
          {missing.map((m) => `${branchName(m.branch)} (${m.days.length > 3 ? `${m.days.length} days` : m.days.map((d) => niceDate(d)).join(', ')})`).join(' · ')}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{['Date', 'Type', 'Outlet', 'Document', 'Amount', 'Status', 'Uploaded', ''].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top">
              {rows.map((r) => (
                <tr key={r.key} data-testid="doc-row">
                  <td className="whitespace-nowrap">{r.from && r.from !== r.date ? <>{niceDate(r.from)} –<br />{niceDate(r.date)}</> : niceDate(r.date)}</td>
                  <td><Badge tone={typeOf(r.type).tone}>{typeOf(r.type).label}</Badge></td>
                  <td className="whitespace-nowrap">{r.branch ? branchName(r.branch) : <span className="text-slate-400">—</span>}</td>
                  <td className="min-w-[260px]"><span className="block font-medium text-slate-900">{r.title}</span><span className="block text-xs text-slate-500">{r.detail}</span></td>
                  <td className="whitespace-nowrap tabular-nums">{r.amount != null ? inr(r2(r.amount)) : ''}</td>
                  <td>{r.status && <Badge tone={r.status.tone}>{r.status.text}</Badge>}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{r.by ?? ''}{r.at ? <><br />{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</> : null}</td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-3">
                      {r.file && (r.file.key || r.file.dataUrl) ? (
                        <>
                          <button aria-label={`View ${r.title}`} title="View" className="text-[#7a2228] hover:text-[#5a1a1f]" onClick={() => openReceipt(r.file!)}><Eye size={16} /></button>
                          <button aria-label={`Download ${r.title}`} title="Download" className="text-[#7a2228] hover:text-[#5a1a1f]" onClick={() => void download(r.file!)}><Download size={16} /></button>
                        </>
                      ) : <span className="text-xs text-slate-400">no file</span>}
                      {r.link && <Link to={r.link} className="font-medium text-[#7a2228] hover:underline">Open</Link>}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={8} className="!py-12 text-center text-slate-500">
                  <FolderOpen className="mx-auto mb-2 text-slate-300" size={28} />
                  No documents for {range.label.toLowerCase().startsWith('week') ? 'this week' : range.label}{type ? ` of type ${typeOf(type).label}` : ''}.
                </td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 text-sm font-semibold [&_td]:px-4 [&_td]:py-2.5">
                <tr><td colSpan={4}>{rows.length} document(s)</td><td className="tabular-nums">{type === 'bill' ? inr(r2(rows.reduce((t, r) => t + (r.amount ?? 0), 0))) : ''}</td><td colSpan={3} /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Every file uploaded on Accounting (Imprest and Cash Books), the OCR Bill Inbox, Reconcile, bank reconciliation, Mobikwik and voucher receipts is kept here with its original. A document covering several days (a weekly statement, a bank statement) shows in each period it touches.</p>
    </div>
  )
}
