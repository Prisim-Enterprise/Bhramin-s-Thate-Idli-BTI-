import { IndianRupee } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ShareBar, Summary, Tile, downloadCsv, money } from '../../../components/report'
import { AGGREGATOR_COMMISSION, AGGREGATOR_SHARE, LAST_MONTH, PAYMENT_SPLIT, RECIPES, SALES_TREND } from '../../../data/mock'
import { OUTLETS } from '../../../data/pnl'
import { AddEntryButtons, EntrySales } from '../../../components/DayEntries'
import { useEntries } from '../../../data/entries'
import { useApp } from '../../../context/AppContext'

const DAYS_SO_FAR = 26
const DAY_NAMES: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

export default function SalesReport() {
  const { can } = useApp()
  const entries = useEntries()
  const total = OUTLETS.reduce((s, b) => s + b.sales, 0)
  const last = OUTLETS.reduce((s, b) => s + (LAST_MONTH[b.id]?.sales ?? 0), 0)
  const change = ((total - last) / last) * 100
  const ranked = [...OUTLETS].sort((a, b) => b.sales - a.sales)
  const online = total * AGGREGATOR_SHARE
  const commission = online * AGGREGATOR_COMMISSION
  const counter = total - online

  const week = SALES_TREND.map((d) => ({ day: d.day, total: OUTLETS.reduce((s, o) => s + (Number((d as Record<string, unknown>)[o.id]) || 0), 0) }))
  const busiest = week.reduce((a, b) => (b.total > a.total ? b : a))
  const quietest = week.reduce((a, b) => (b.total < a.total ? b : a))

  const dishes = [...RECIPES].map((r) => ({ ...r, earned: r.price * r.sold })).sort((a, b) => b.earned - a.earned)

  const csv = () => downloadCsv('BTI-Sales-Report-Oct-2026.csv', [
    ['Outlet', 'Sales this month', 'Sales last month', 'Change %'],
    ...ranked.map((b) => [b.name, b.sales, (LAST_MONTH[b.id]?.sales ?? 0), (((b.sales - (LAST_MONTH[b.id]?.sales ?? 0)) / (LAST_MONTH[b.id]?.sales ?? 0)) * 100).toFixed(1)]),
    ['Total', total, last, change.toFixed(1)],
  ])

  if (!total) {
    return (
      entries.length ? (
        <div className="mx-auto max-w-7xl">
          <ReportHeader title="Sales Report" period="From day entries · amounts in ₹" actions={<AddEntryButtons disabled={!can('accounts', 'create')} />} />
          <EntrySales />
        </div>
      ) : (
        <EmptyReport title="Sales Report" period="October 2026" icon={IndianRupee}
          text="Sales show up here once outlet sales are connected (POS, Swiggy, Zomato) or a day entry is added."
          actions={<AddEntryButtons disabled={!can('accounts', 'create')} />} />
      )
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Sales Report" period={`October 2026 · 1st to 26th (${DAYS_SO_FAR} days) · amounts exclude GST`} onCsv={csv} actions={<AddEntryButtons disabled={!can('accounts', 'create')} />} />

      <Summary points={[
        <>BTI sold <Big>{money(total)}</Big> so far this month, which is about <Big>{money(total / DAYS_SO_FAR)}</Big> every day.</>,
        <>That is <Big>{Math.abs(change).toFixed(1)}% {change >= 0 ? 'more' : 'less'}</Big> than last month ({money(last)}).</>,
        <><Big>{ranked[0].name}</Big> sold the most ({money(ranked[0].sales)}). <Big>{ranked[ranked.length - 1].name}</Big> sold the least ({money(ranked[ranked.length - 1].sales)}).</>,
        <><Big>{Math.round(AGGREGATOR_SHARE * 100)}%</Big> of sales came through Swiggy & Zomato. They kept about <Big>{money(commission)}</Big> as their fee.</>,
        <>This week, <Big>{DAY_NAMES[busiest.day]}</Big> was the busiest day and <Big>{DAY_NAMES[quietest.day]}</Big> the quietest.</>,
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total sales" value={money(total)} note={`${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs last month`} tone={change >= 0 ? 'green' : 'red'} />
        <Tile label="Sales per day" value={money(total / DAYS_SO_FAR)} note="Average across all outlets" />
        <Tile label="Best outlet" value={ranked[0].name} note={money(ranked[0].sales)} />
        <Tile label="Swiggy & Zomato fee" value={money(commission)} note={`On ${money(online)} of online orders`} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Sales by outlet" pad={false}>
          <ul className="divide-y divide-slate-100">
            {ranked.map((b) => {
              const lm = (LAST_MONTH[b.id]?.sales ?? 0)
              const ch = ((b.sales - lm) / lm) * 100
              return (
                <li key={b.id} className="px-4 py-3">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="tabular-nums">
                      <b>{money(b.sales)}</b>
                      <span className={`ml-2 text-xs ${ch >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}%</span>
                    </span>
                  </div>
                  <ShareBar value={b.sales} max={ranked[0].sales} color="#d9a441" />
                </li>
              )
            })}
          </ul>
        </Card>

        <Card title="Sales this week, day by day">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={week}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => '₹' + Math.round(v / 1000) + 'k'} />
                <Tooltip cursor={{ fill: '#fbf3e4' }} formatter={(v: number) => [money(v, false), 'Sales']} labelFormatter={(d) => DAY_NAMES[d]} />
                <Bar dataKey="total" fill="#7a2228" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Where the orders came from">
          <ul className="space-y-4 text-sm">
            <li>
              <div className="mb-1.5 flex justify-between"><span>At the counter (dine-in & takeaway)</span><b className="tabular-nums">{money(counter)}</b></div>
              <ShareBar value={counter} max={total} color="#7a2228" />
            </li>
            <li>
              <div className="mb-1.5 flex justify-between"><span>Swiggy & Zomato</span><b className="tabular-nums">{money(online)}</b></div>
              <ShareBar value={online} max={total} color="#d9a441" />
            </li>
          </ul>
          <p className="mb-2 mt-6 text-sm font-medium">How counter customers paid</p>
          <div className="flex h-8 overflow-hidden rounded-lg text-xs font-medium text-white">
            {PAYMENT_SPLIT.map((p, i) => (
              <div key={p.mode} className="grid place-items-center" style={{ width: p.share * 100 + '%', background: ['#7a2228', '#b5532f', '#d9a441'][i] }}>
                {p.mode} {Math.round(p.share * 100)}%
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {PAYMENT_SPLIT.map((p) => `${p.mode} ${money(counter * p.share)}`).join(' · ')}
          </p>
        </Card>

        <Card title="Best-selling dishes" pad={false}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-2 text-left font-medium">Dish</th><th className="px-3 text-right font-medium">Plates sold</th><th className="px-4 text-right font-medium">Money earned</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dishes.map((d, i) => (
                <tr key={d.dish}>
                  <td className="px-4 py-2"><span className="mr-2 text-xs text-slate-400">{i + 1}</span>{d.dish}</td>
                  <td className="px-3 text-right tabular-nums">{d.sold.toLocaleString('en-IN')}</td>
                  <td className="px-4 text-right font-medium tabular-nums">{money(d.earned, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4">
        <EntrySales />
      </div>
    </div>
  )
}
