import { Fragment, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Download, Printer } from 'lucide-react'
import { Button, Card, PageHeader } from '../../components/ui'
import { PNL_HISTORY, inr } from '../../data/mock'
import { Big, Summary, per100 } from '../../components/report'
import { IS_SHARE } from '../../config'
import { CENTRAL_TOTAL, OUTLETS, buildPnl } from '../../data/pnl'

// Accounting style: negatives shown as −₹1,234
const money = (n: number) => (n < 0 ? '−' : '') + inr(Math.round(Math.abs(n)))
const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '—')

function Change({ now, before, costLine }: { now: number; before: number; costLine?: boolean }) {
  if (!before) return <span className="text-slate-400">—</span>
  const d = ((now - before) / Math.abs(before)) * 100
  if (Math.abs(d) < 0.05) return <span className="text-slate-400">0%</span>
  // For costs, going up is bad; for income and profit, going up is good.
  const good = costLine ? d < 0 : d > 0
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon size={13} />{Math.abs(d).toFixed(1)}%
    </span>
  )
}

function Tile({ label, value, sub, now, before, cost }: { label: string; value: number; sub: string; now: number; before: number; cost?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{money(value)}</p>
      <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {sub} · <Change now={now} before={before} costLine={cost} /> vs last month
      </p>
    </div>
  )
}

export default function ProfitLoss() {
  const [scope, setScope] = useState('ALL')
  const ids = scope === 'ALL' ? OUTLETS.map((b) => b.id) : [scope]
  const cur = useMemo(() => buildPnl(ids, 'this'), [scope])
  const prev = useMemo(() => buildPnl(ids, 'last'), [scope])
  const scopeName = scope === 'ALL' ? 'All outlets' : OUTLETS.find((b) => b.id === scope)!.name

  const allNow = buildPnl(OUTLETS.map((b) => b.id), 'this')
  const allPrev = buildPnl(OUTLETS.map((b) => b.id), 'last')
  const trend = [
    ...PNL_HISTORY,
    { month: 'Sep', revenue: Math.round(allPrev.sales), net: Math.round(allPrev.net) },
    { month: 'Oct', revenue: Math.round(allNow.sales), net: Math.round(allNow.net) },
  ]
  const byBranch = OUTLETS.map((b) => ({ b, p: buildPnl([b.id], 'this') })).sort((x, y) => y.p.net - x.p.net)

  // Statement rows, in order. kind: line = normal row, total = bold subtotal, head = section title.
  type Row = { label: string; now?: number; before?: number; kind: 'head' | 'line' | 'total' | 'grand'; cost?: boolean; indent?: boolean }
  const rows: Row[] = [
    { label: 'Income', kind: 'head' },
    { label: 'Dine-in & takeaway', now: cur.dineIn, before: prev.dineIn, kind: 'line', indent: true },
    { label: 'Swiggy / Zomato orders', now: cur.online, before: prev.online, kind: 'line', indent: true },
    { label: 'Net sales', now: cur.sales, before: prev.sales, kind: 'total' },
    { label: 'Cost of food', kind: 'head' },
    { label: 'Ingredients used', now: cur.food, before: prev.food, kind: 'line', indent: true, cost: true },
    { label: 'Gross profit (sales minus ingredients)', now: cur.gross, before: prev.gross, kind: 'total' },
    { label: 'Running costs', kind: 'head' },
    ...cur.expenses.map((e, i) => ({ label: e.label, now: e.v, before: prev.expenses[i].v, kind: 'line' as const, indent: true, cost: true })),
    { label: 'Total running costs', now: cur.opex, before: prev.opex, kind: 'total', cost: true },
    { label: 'Profit before wear & tear', now: cur.ebitda, before: prev.ebitda, kind: 'total' },
    { label: 'Wear & tear of equipment (depreciation)', now: cur.depreciation, before: prev.depreciation, kind: 'line', indent: true, cost: true },
    { label: 'Net profit', now: cur.net, before: prev.net, kind: 'grand' },
  ]

  const downloadCsv = () => {
    const lines = [['Particulars', 'Oct 2026', '% of sales', 'Sep 2026'].join(',')]
    rows.forEach((r) => lines.push([`"${r.label}"`, r.now !== undefined ? Math.round(r.now) : '', r.now !== undefined ? pct(r.now, cur.sales) : '', r.before !== undefined ? Math.round(r.before) : ''].join(',')))
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `BTI-PnL-${scopeName.replace(/\s+/g, '-')}-Oct-2026.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Profit & Loss"
        subtitle={`${scopeName} · October 2026 (to 26th) compared with September · sales shown excluding GST`}
        actions={!IS_SHARE &&
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button icon={Download} onClick={downloadCsv}>Download CSV</Button>
          </>
        }
      />

      {/* Outlet filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ id: 'ALL', name: 'All outlets' }, ...OUTLETS].map((b) => (
          <button key={b.id} onClick={() => setScope(b.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${scope === b.id ? 'bg-[#7a2228] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'}`}>
            {b.name}
          </button>
        ))}
      </div>

      <Summary points={[
        <>{scope === 'ALL' ? 'BTI' : scopeName} sold <Big>{money(cur.sales)}</Big> this month.</>,
        cur.net >= 0
          ? <>After paying for ingredients, staff, rent and every other cost, <Big>{money(cur.net)}</Big> was left as profit.</>
          : <>After paying for ingredients, staff, rent and every other cost, there was a <Big>loss of {money(-cur.net)}</Big>.</>,
        <>That is <Big>{per100(cur.net, cur.sales)} {cur.net >= 0 ? 'profit' : 'loss'}</Big> on every ₹100 of sales. Last month it was {per100(prev.net, prev.sales)}.</>,
        <>Biggest costs: ingredients ({per100(cur.food, cur.sales)} of every ₹100), then {[...cur.expenses].sort((a, b) => b.v - a.v).slice(0, 2).map((e) => `${e.label.toLowerCase()} (${per100(e.v, cur.sales)})`).join(' and ')}.</>,
        ...(scope === 'ALL' && byBranch.some((x) => x.p.net < 0)
          ? [<><Big>{byBranch.filter((x) => x.p.net < 0).map((x) => x.b.name).join(', ')}</Big> made a loss this month. Tap it in "Profit by outlet" to see why.</>]
          : []),
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Net sales" value={cur.sales} sub={scopeName} now={cur.sales} before={prev.sales} />
        <Tile label="Gross profit" value={cur.gross} sub={`${pct(cur.gross, cur.sales)} of sales`} now={cur.gross} before={prev.gross} />
        <Tile label="Running costs" value={cur.opex} sub={`${pct(cur.opex, cur.sales)} of sales`} now={cur.opex} before={prev.opex} cost />
        <Tile label="Net profit" value={cur.net} sub={`${pct(cur.net, cur.sales)} margin`} now={cur.net} before={prev.net} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        {/* Statement */}
        <Card title="Profit & Loss statement" className="xl:col-span-3" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Particulars</th>
                  <th className="px-3 text-right font-medium">Oct 2026</th>
                  <th className="px-3 text-right font-medium">% of sales</th>
                  <th className="px-3 text-right font-medium">Sep 2026</th>
                  <th className="px-4 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.label}>
                    {r.kind === 'head' ? (
                      <tr><td colSpan={5} className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-[#7a2228]">{r.label}</td></tr>
                    ) : (
                      <tr className={
                        r.kind === 'grand' ? `border-t-2 border-slate-300 font-bold ${r.now! < 0 ? 'bg-rose-50' : 'bg-emerald-50'}`
                          : r.kind === 'total' ? 'border-t border-slate-200 bg-slate-50/60 font-semibold' : ''
                      }>
                        <td className={`py-2 ${r.indent ? 'pl-8' : 'pl-4'} pr-3`}>{r.label}</td>
                        <td className={`px-3 text-right tabular-nums ${r.now! < 0 ? 'text-rose-600' : ''}`}>{money(r.now!)}</td>
                        <td className="px-3 text-right text-xs text-slate-500 tabular-nums">{pct(r.now!, cur.sales)}</td>
                        <td className="px-3 text-right text-slate-500 tabular-nums">{money(r.before!)}</td>
                        <td className="px-4 text-right text-xs"><Change now={r.now!} before={r.before!} costLine={r.cost} /></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            Central kitchen & head office costs ({money(CENTRAL_TOTAL)}/month) are shared across outlets by their share of sales.
          </p>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          {/* Trend */}
          <Card title="Last 6 months · all outlets">
            <div className="h-60">
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => '₹' + (v / 100000).toFixed(0) + 'L'} />
                  <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => '₹' + Math.round(v / 1000) + 'k'} />
                  <Tooltip formatter={(v: number, name) => [money(v), name === 'revenue' ? 'Sales' : 'Net profit']} />
                  <Legend formatter={(v) => (v === 'revenue' ? 'Sales' : 'Net profit')} />
                  <Bar yAxisId="r" dataKey="revenue" fill="#e9d3a5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Line yAxisId="n" dataKey="net" stroke="#7a2228" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Branch comparison */}
          <Card title="Profit by outlet · this month" pad={false}>
            <ul className="divide-y divide-slate-100">
              {byBranch.map(({ b, p }) => (
                <li key={b.id}>
                  <button onClick={() => setScope(b.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${scope === b.id ? 'bg-[#fbf3e4]' : ''}`}>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{b.name}</span>
                      <span className="block text-xs text-slate-500">Sales {money(p.sales)} · GP {pct(p.gross, p.sales)}</span>
                    </span>
                    <span className="text-right">
                      <span className={`block text-sm font-semibold tabular-nums ${p.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(p.net)}</span>
                      <span className="block text-xs text-slate-500">{p.net < 0 ? 'loss' : pct(p.net, p.sales) + ' margin'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
