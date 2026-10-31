import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Download, Info } from 'lucide-react'
import { BRANCHES } from '../../../data/mock'
import { downloadCsv } from '../../../components/report'
import { stockSummary, useClosingCounts, usePostedBills } from '../../../data/inventory'
import { OpsHeader, selCls } from '../ops/shared'

const n3 = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }))
const monthStart = () => new Date().toLocaleDateString('en-CA').slice(0, 8) + '01'

// Opening (last count before the period) + bought (posted bills) = total; total − closing count = used.
export default function StockSummary() {
  const posted = usePostedBills()
  const counts = useClosingCounts()
  // Start on the latest month that has bills or counts.
  const latest = [...posted.map((b) => b.date), ...counts.map((c) => c.date)].sort().pop()
  const [from, setFrom] = useState(latest ? latest.slice(0, 8) + '01' : monthStart())
  const [to, setTo] = useState(latest ?? new Date().toLocaleDateString('en-CA'))
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [outlet, setOutlet] = useState('')
  const [asc, setAsc] = useState(true)
  const [applied, setApplied] = useState({ from, to, outlet })

  const all = useMemo(() => stockSummary(posted, counts, applied.from, applied.to, applied.outlet), [posted, counts, applied])
  const cats = [...new Set(all.map((r) => r.ledger).filter(Boolean))].sort()
  const rows = all.filter((r) => r.item.toLowerCase().includes(q.trim().toLowerCase()) && (!cat || r.ledger === cat))
    .sort((a, b) => (asc ? 1 : -1) * a.item.localeCompare(b.item))

  const csv = () => downloadCsv(`BTI-Stock-Summary-${applied.from}-to-${applied.to}.csv`, [
    ['Raw material', 'Unit', 'Category', 'Opening (A)', 'Bought (B)', 'Total (A+B)', 'Closing stock', 'Used', 'Bought value', 'Last rate'],
    ...rows.map((r) => [r.item, r.unit, r.ledger, r.opening ?? '', r.bought, r.total, r.closing ?? '', r.used ?? '', r.boughtValue, r.lastRate ?? '']),
  ])

  const th = 'whitespace-nowrap px-3 py-3 text-left font-semibold'
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Stock Summary Report">
        <button onClick={csv} className={selCls + ' inline-flex items-center gap-1.5 font-medium hover:bg-slate-50'}><Download size={15} /> Export</button>
      </OpsHeader>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto_auto]">
          <label className="text-xs font-semibold text-slate-600">Raw Material<input className={selCls + ' mt-1 w-full'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">Category
            <select className={selCls + ' mt-1 w-full'} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Restaurant
            <select className={selCls + ' mt-1 w-full'} value={outlet} onChange={(e) => setOutlet(e.target.value)}><option value="">All</option>{BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">From Date<input type="date" className={selCls + ' mt-1 w-full'} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">To Date<input type="date" className={selCls + ' mt-1 w-full'} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="self-end rounded-lg border border-[#7a2228] px-5 py-2 text-sm font-semibold text-[#7a2228] hover:bg-[#fbf3e4]" onClick={() => setApplied({ from, to, outlet })}>Search</button>
          <button className="self-end rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => { setQ(''); setCat(''); setOutlet(''); setApplied({ from, to, outlet: '' }) }}>Clear</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#fbf3e4] text-xs text-slate-700">
              <tr>
                <th className={th}><button className="inline-flex items-center gap-1" onClick={() => setAsc(!asc)}>Raw Material <ArrowUp size={13} className={asc ? '' : 'rotate-180'} /></button></th>
                <th className={th + ' text-right'}>Opening (A)</th>
                <th className={th + ' text-right'}>Bought (B)</th>
                <th className={th + ' bg-[#f3e2bf] text-right'}>Total (A+B)</th>
                <th className={th + ' text-right'}>Closing Stock</th>
                <th className={th + ' bg-[#f3e2bf] text-right'}>Used</th>
                <th className={th + ' text-right'}>Bought value</th>
                <th className={th + ' text-right'}>Last rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.item + r.unit} className="hover:bg-slate-50">
                  <td className="px-3 py-3"><span className="font-medium text-slate-900">{r.item}</span> <span className="text-slate-500">[{r.unit}]</span>{r.ledger && <span className="block text-xs text-slate-400">{r.ledger}</span>}</td>
                  <td className="px-3 text-right tabular-nums">{n3(r.opening)}</td>
                  <td className="px-3 text-right tabular-nums text-emerald-700">{n3(r.bought)}</td>
                  <td className="bg-[#fdf8ee] px-3 text-right font-semibold tabular-nums">{n3(r.total)}</td>
                  <td className="px-3 text-right tabular-nums">{n3(r.closing)}</td>
                  <td className={`bg-[#fdf8ee] px-3 text-right font-semibold tabular-nums ${r.used != null && r.used < 0 ? 'text-rose-600' : ''}`}>{n3(r.used)}</td>
                  <td className="px-3 text-right tabular-nums">₹{r.boughtValue.toLocaleString('en-IN')}</td>
                  <td className="px-3 text-right tabular-nums text-slate-500">{r.lastRate != null ? '₹' + r.lastRate : '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No stock movement in this period. Items appear once bills are posted from the OCR Bill Inbox or closing stock is counted.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>Opening = last closing count before the From date. Bought = posted bills. Used = total − closing count (blank until a closing count is entered in the{' '}
        <Link to="/admin/inventory/closing" className="text-[#7a2228] underline">Closing Stock Tracker</Link>). A red Used figure means the count is higher than what was bought plus opening; check the count or a missing bill.</span>
      </p>
    </div>
  )
}
