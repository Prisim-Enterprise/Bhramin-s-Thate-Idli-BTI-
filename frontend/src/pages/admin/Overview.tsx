import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowDownWideNarrow, ArrowRight, ArrowUpWideNarrow, BarChart3, Banknote, CalendarDays, Check, CheckCircle2, Download, FileWarning,
  Globe, List, ReceiptText, ScanLine, Sparkles, Store, Wallet, WifiOff, type LucideIcon,
} from 'lucide-react'
import { downloadCsv } from '../../components/report'
import { useApp } from '../../context/AppContext'
import { BRANCHES, branchName, inr } from '../../data/mock'
import { billTotal, cashIn, niceDate, useEntries, type DayEntry } from '../../data/entries'
import { FOOD_COST_TARGET, profitLoss, purchases, useReportData } from '../../data/analytics'

// Sales figures for a set of day entries. Online = Swiggy, Zomato and Rapido orders; offline = counter (cash, UPI, cards).
function stats(list: DayEntry[]) {
  const sum = (f: (e: DayEntry) => number) => Math.round(list.reduce((s, e) => s + f(e), 0) * 100) / 100
  const gross = sum(billTotal)
  const online = sum((e) => e.swiggy + e.zomato + e.rapido)
  return { gross, net: sum((e) => e.sales), online, offline: Math.round((gross - online) * 100) / 100, cash: sum(cashIn), days: new Set(list.map((e) => e.date)).size }
}
type Metric = 'gross' | 'net' | 'online' | 'offline' | 'cash'
const METRICS: Record<Metric, string> = { gross: 'Gross Sales', net: 'Net Sales', online: 'Online Sales', offline: 'Offline Sales', cash: 'Cash Collected' }

const pctOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const money = (n: number) => inr(Math.round(n))
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

function StatCard({ icon: Icon, title, value, note }: { icon: LucideIcon; title: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-2 font-semibold text-slate-800"><Icon size={18} className="shrink-0 text-[#7a2228]" /> <span className="truncate">{title}</span></p>
      <p className="mt-3 truncate text-2xl font-semibold tabular-nums text-slate-900 sm:text-[26px]">{value}</p>
      <p className="mt-3 text-xs leading-snug text-slate-500">{note}</p>
    </div>
  )
}

export default function Overview() {
  const { can } = useApp()
  const entries = useEntries()
  const R = useReportData()
  const outlets = BRANCHES.filter((b) => b.id !== 'CK')

  // Pickers: outlet, and a day or a whole month. Starts on the latest day that has figures.
  const days = useMemo(() => [...new Set(entries.map((e) => e.date))].sort().reverse(), [entries])
  const [outlet, setOutlet] = useState('')
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [pickedDay, setDay] = useState<string | null>(null)
  const day = pickedDay ?? days[0] ?? new Date().toLocaleDateString('en-CA')
  const month = day.slice(0, 7)
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [metric, setMetric] = useState<Metric>('gross')
  const [order, setOrder] = useState<'top' | 'bottom'>('top')

  const inPeriod = (e: DayEntry) => (mode === 'day' ? e.date === day : e.date.startsWith(month))
  const scoped = entries.filter((e) => inPeriod(e) && (!outlet || e.branch === outlet))
  const s = stats(scoped)
  const outletCount = outlet ? 1 : new Set(scoped.map((e) => e.branch)).size
  const periodText = mode === 'day' ? niceDate(day) : monthLabel(month)

  // Each outlet's figures for the period, for the graph and the list.
  const perOutlet = BRANCHES.map((b) => ({ b, s: stats(entries.filter((e) => inPeriod(e) && e.branch === b.id)) }))
    .filter((x) => !outlet || x.b.id === outlet)
  const reporting = perOutlet.filter((x) => x.s.days)
  const ranked = [...reporting].sort((a, b) => (order === 'top' ? b.s[metric] - a.s[metric] : a.s[metric] - b.s[metric]))
  const missing = mode === 'day' && !outlet ? outlets.filter((o) => !entries.some((e) => e.date === day && e.branch === o.id)) : []

  // Money side for the same month (bills and imprest payouts), and what needs doing.
  const scope = { month, branch: outlet || undefined }
  const pl = profitLoss(R.d, scope)
  const pur = purchases(R.d, scope)
  const allPur = purchases(R.d, {})
  const todos = [
    can('ocr') && allPur.waiting > 0 && { icon: ScanLine, to: '/admin/accounting/bills', title: `${allPur.waiting} bill(s) waiting in the OCR Bill Inbox`, text: 'Check them and post to Account Books so they count in the reports.' },
    missing.length > 0 && can('accounts') && { icon: FileWarning, to: '/admin/accounting/sales', title: `${missing.length} outlet(s) have no Imprest Book for ${shortDate(day)}`, text: missing.map((m) => m.name).join(', ') },
    pl.foodPct != null && pl.foodPct > FOOD_COST_TARGET && { icon: ReceiptText, to: '/admin/accounting/costing', title: `Food cost is ${pl.foodPct.toFixed(1)}% in ${monthLabel(month)}`, text: `Above the ${FOOD_COST_TARGET}% target. See which ingredients and outlets push it up.` },
    allPur.owedTotal > 0 && can('purchase') && { icon: Wallet, to: '/admin/accounting/purchases', title: `${money(allPur.owedTotal)} owed to vendors`, text: allPur.owedList.slice(0, 3).map((o) => `${o.vendor} ${money(o.v)}`).join(' · ') },
  ].filter(Boolean) as { icon: LucideIcon; to: string; title: string; text: string }[]

  const csv = () => downloadCsv(`BTI-Outlets-${mode === 'day' ? day : month}.csv`, [
    ['Outlet', 'Days', 'Gross sales', 'Net sales', 'Online sales', 'Offline sales', 'Cash collected'],
    ...reporting.map(({ b, s: x }) => [b.name, x.days, x.gross, x.net, x.online, x.offline, x.cash]),
    ['All outlets', s.days, s.gross, s.net, s.online, s.offline, s.cash],
  ])

  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700'
  return (
    <div className="mx-auto max-w-7xl">
      {/* Outlet picker and entry buttons */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Outlet" className={sel + ' min-w-[200px]'} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
          <option value="">All Outlets</option>
          {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Snapshot banner */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-[#fdf8ee] p-4 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><Sparkles size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {days.length ? <>Latest snapshot: {niceDate(days[0])}</> : 'No snapshot yet'}
            {days.length > 0 && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 align-middle text-[11px] font-bold uppercase text-white">Latest</span>}
          </p>
          <p className="text-sm text-slate-600">
            {days.length
              ? <>Sales of {money(stats(entries.filter((e) => e.date === days[0])).gross)} from {new Set(entries.filter((e) => e.date === days[0]).map((e) => e.branch)).size} outlet(s), with profit, food cost and purchases worked out from the Imprest Books and bills.</>
              : 'Upload an Imprest Book PDF from Accounting to see sales, cash and profit for each outlet.'}
          </p>
        </div>
        {days.length > 0 && (
          <button onClick={() => { setMode('day'); setDay(days[0]); setOutlet('') }}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            View snapshot <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* All outlet statistics */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{outlet ? branchName(outlet) : 'All Outlet'} Statistics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            {(['day', 'month'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 font-medium ${mode === m ? 'bg-[#7a2228] text-white' : 'text-slate-600'}`}>{m === 'day' ? 'Day' : 'Month'}</button>
            ))}
          </div>
          <label className={sel + ' flex items-center gap-2'}>
            <CalendarDays size={16} className="text-slate-500" />
            <input type="date" aria-label="Date" className="bg-transparent outline-none" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <button onClick={csv} className={sel + ' inline-flex items-center gap-1.5 hover:bg-slate-50'}><Download size={16} /> Export Data</button>
        </div>
      </div>
      <p className="mb-3 text-sm text-slate-500">{periodText} · {outletCount} outlet{outletCount === 1 ? '' : 's'} reporting{mode === 'month' && s.days ? ` · ${s.days} day(s)` : ''}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        <StatCard icon={ReceiptText} title="Gross Sales" value={money(s.gross)} note={`Total billed of ${outletCount} outlet${outletCount === 1 ? '' : 's'}, with GST`} />
        <StatCard icon={BarChart3} title="Net Sales" value={money(s.net)} note="Food sales without GST, charges and discounts" />
        <StatCard icon={Globe} title="Online Sales" value={money(s.online)} note={`${pctOf(s.online, s.gross)}% of sales from Swiggy, Zomato and Rapido`} />
        <StatCard icon={WifiOff} title="Offline Sales" value={money(s.offline)} note={`${pctOf(s.offline, s.gross)}% of sales at the counter (cash, UPI)`} />
        <StatCard icon={Banknote} title="Cash Collected" value={money(s.cash)} note={`${pctOf(s.cash, s.gross)}% of sales collected in cash`} />
      </div>

      {/* Outlet statistics: graph or list */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Outlet Statistics</h2>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(['graph', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium ${view === v ? 'bg-[#fbf3e4] text-[#7a2228]' : 'text-slate-600'}`}>
              {view === v && <Check size={15} />}{v === 'graph' ? 'Graph' : <><List size={15} /> List</>}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="Figure" className={sel} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {(Object.keys(METRICS) as Metric[]).map((m) => <option key={m} value={m}>{METRICS[m]}</option>)}
          </select>
          <button onClick={() => setOrder(order === 'top' ? 'bottom' : 'top')} className={sel + ' inline-flex items-center gap-1.5'}>
            {order === 'top' ? <ArrowDownWideNarrow size={16} /> : <ArrowUpWideNarrow size={16} />} {order === 'top' ? 'Top Outlets' : 'Bottom Outlets'}
          </button>
        </div>
        {!ranked.length ? (
          <div className="flex flex-col items-center py-12 text-center text-slate-500">
            <Store size={30} className="text-slate-300" />
            <p className="mt-2 font-medium text-slate-700">No figures for {periodText}</p>
            <p className="text-sm">Pick another day, switch to Month, or upload that day's Imprest Book.</p>
          </div>
        ) : view === 'graph' ? (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={ranked.map(({ b, s: x }) => ({ name: b.name, v: x[metric] }))} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? '₹' + Math.round(v / 1000) + 'k' : '₹' + v)} width={52} />
                <Tooltip cursor={{ fill: '#fbf3e4' }} formatter={(v: number) => [money(v), METRICS[metric]]} />
                <Bar dataKey="v" fill="#7a2228" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>{['Outlet', 'Gross', 'Net', 'Online', 'Offline', 'Cash'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.map(({ b, s: x }) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOutlet(b.id)}>
                    <td className="px-3 py-2.5 font-medium">{b.name}</td>
                    {(['gross', 'net', 'online', 'offline', 'cash'] as Metric[]).map((m) => (
                      <td key={m} className={`px-3 text-right tabular-nums ${m === metric ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{money(x[m])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Money and things to do */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-3">
          <p className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Needs your attention</p>
          {todos.length ? (
            <ul className="divide-y divide-slate-100">
              {todos.map((t) => (
                <li key={t.title}>
                  <Link to={t.to} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                    <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><t.icon size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                      <span className="block truncate text-xs text-slate-500">{t.text}</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-[#7a2228] transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 size={30} className="text-emerald-500" />
              <p className="mt-2 font-medium">All caught up</p>
              <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <p className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">{monthLabel(month)}{outlet ? ` · ${branchName(outlet)}` : ''}</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {[
              { label: 'Net profit', v: money(pl.net), to: '/admin/accounting/pnl', tone: pl.net >= 0 ? 'text-emerald-700' : 'text-rose-600', show: can('accounts') },
              { label: 'Food cost', v: pl.foodPct != null ? pl.foodPct.toFixed(1) + '%' : '—', to: '/admin/accounting/costing', tone: pl.foodPct != null && pl.foodPct > FOOD_COST_TARGET ? 'text-rose-600' : 'text-slate-900', show: can('accounts') },
              { label: 'Purchases', v: money(pur.total), to: '/admin/accounting/purchases', tone: 'text-slate-900', show: can('purchase') },
              { label: 'Expenses + staff', v: money(pl.running + pl.staff), to: '/admin/accounting/expenses', tone: 'text-slate-900', show: can('expenses') },
            ].filter((r) => r.show).map((r) => (
              <li key={r.label}>
                <Link to={r.to} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <span className="text-slate-600">{r.label}</span>
                  <span className={`flex items-center gap-2 font-semibold tabular-nums ${r.tone}`}>{r.v} <ArrowRight size={14} className="text-slate-300" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
