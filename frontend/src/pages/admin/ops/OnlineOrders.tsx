import { useMemo, useState } from 'react'
import { LayoutGrid, Search, TrendingUp } from 'lucide-react'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { niceDate, useEntries } from '../../../data/entries'
import { downloadCsv } from '../../../components/report'
import { APPS, AppMark, NeedsConnection, OpsHeader, selCls, type AppId } from './shared'

const PERIODS = [
  { id: 'all', label: 'All days', days: 0 },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
]

// Online orders. The order-by-order list needs the apps connected; the day totals per app
// already come from the Imprest Books (Swiggy, Zomato, Rapido lines).
export default function OnlineOrders() {
  const entries = useEntries()
  const [app, setApp] = useState<'all' | AppId>('all')
  const [period, setPeriod] = useState('all')
  const [outlet, setOutlet] = useState('')
  const [status, setStatus] = useState('all')
  const [orderNo, setOrderNo] = useState('')
  const [applied, setApplied] = useState({ outlet: '', status: 'all', orderNo: '' })

  const since = useMemo(() => {
    const d = PERIODS.find((p) => p.id === period)!.days
    return d ? new Date(Date.now() - d * 86_400_000).toLocaleDateString('en-CA') : ''
  }, [period])
  const withApps = APPS.filter((a) => a.field && (app === 'all' || a.id === app))
  const rows = entries
    .filter((e) => (!since || e.date >= since) && (!applied.outlet || e.branch === applied.outlet))
    .map((e) => ({ e, by: withApps.map((a) => e[a.field!]), total: withApps.reduce((s, a) => s + e[a.field!], 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.e.date.localeCompare(a.e.date))
  const sums = withApps.map((_, i) => rows.reduce((s, r) => s + r.by[i], 0))
  const grand = sums.reduce((s, v) => s + v, 0)
  const noDayTotals = app !== 'all' && !APPS.find((a) => a.id === app)?.field

  const csv = () => downloadCsv('BTI-Online-Orders-Day-Totals.csv', [
    ['Date', 'Outlet', ...withApps.map((a) => a.name), 'Total'],
    ...rows.map((r) => [r.e.date, branchName(r.e.branch), ...r.by, r.total]),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Online Orders Activity">
        <label className={selCls + ' inline-flex items-center gap-2'}>
          <TrendingUp size={15} className="text-[#7a2228]" />
          <select aria-label="Period" className="bg-transparent font-medium outline-none" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </OpsHeader>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* App tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3">
          <button onClick={() => setApp('all')} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${app === 'all' ? 'border-[#7a2228] text-[#7a2228]' : 'border-transparent text-slate-600'}`}>
            <LayoutGrid size={18} /> All
          </button>
          {APPS.map((a) => (
            <button key={a.id} onClick={() => setApp(a.id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${app === a.id ? 'border-[#7a2228] text-[#7a2228]' : 'border-transparent text-slate-600'}`}>
              <AppMark name={a.name} color={a.color} size={22} /> {a.name}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <label className="text-xs font-semibold text-slate-600">Select Restaurant
            <select className={selCls + ' mt-1 w-full'} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
              <option value="">All outlets</option>
              {BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Status
            <select className={selCls + ' mt-1 w-full'} value={status} onChange={(e) => setStatus(e.target.value)}>
              {['all', 'delivered', 'cancelled', 'rejected'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Order No.
            <span className="relative mt-1 block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={selCls + ' w-full pl-9'} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} /></span>
          </label>
          <button className="self-end rounded-lg border border-[#7a2228] px-5 py-2 text-sm font-semibold text-[#7a2228] hover:bg-[#fbf3e4]" onClick={() => setApplied({ outlet, status, orderNo })}>Apply</button>
          <button className="self-end rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setOutlet(''); setStatus('all'); setOrderNo(''); setApplied({ outlet: '', status: 'all', orderNo: '' }) }}>Show All</button>
        </div>

        {/* Order-by-order list */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#fbf3e4] text-left text-xs font-semibold text-slate-700">
              <tr>{['Order No.', 'Outlet / From', 'Order Type / Rider', 'Customer', 'OTP', 'Date Time', 'Total', 'Status', 'Actions'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              <tr><td colSpan={9} className="px-4 py-10 text-center">
                <span className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400"><Search size={20} /></span>
                <p className="font-medium text-slate-700">No orders to show</p>
                <p className="text-slate-500">Each Swiggy, Zomato or Rapido order appears here once the app is connected for the outlet.</p>
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <NeedsConnection what="Order-by-order details need each app connected. Until then, the day totals below are taken from the Imprest Books." />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <p className="font-semibold text-slate-900">Day totals from the Imprest Books {grand ? <span className="font-normal text-slate-500">· {inr(Math.round(grand))}</span> : null}</p>
            {rows.length > 0 && <button className="text-sm font-medium text-[#7a2228] hover:underline" onClick={csv}>Export</button>}
          </div>
          {noDayTotals ? (
            <p className="px-5 py-6 text-sm text-slate-500">The Imprest Book has no separate line for {APPS.find((a) => a.id === app)?.name}, so there are no day totals for it yet.</p>
          ) : !rows.length ? (
            <p className="px-5 py-6 text-sm text-slate-500">No online sales in the Imprest Books for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="px-5 py-2 text-left font-medium">Date</th><th className="px-3 text-left font-medium">Outlet</th>
                    {withApps.map((a) => <th key={a.id} className="px-3 text-right font-medium">{a.name}</th>)}<th className="px-5 text-right font-medium">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.e.id}>
                      <td className="px-5 py-2.5">{niceDate(r.e.date)}</td><td className="px-3 font-medium">{branchName(r.e.branch)}</td>
                      {r.by.map((v, i) => <td key={i} className="px-3 text-right tabular-nums">{inr(v)}</td>)}
                      <td className="px-5 text-right font-semibold tabular-nums">{inr(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold"><td className="px-5 py-2.5" colSpan={2}>Total</td>
                    {sums.map((v, i) => <td key={i} className="px-3 text-right tabular-nums">{inr(v)}</td>)}<td className="px-5 text-right tabular-nums">{inr(grand)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
