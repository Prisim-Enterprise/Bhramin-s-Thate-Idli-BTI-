import { BookOpenCheck } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ScopePicker, ShareBar, Summary, Tile, downloadCsv, money, per100 } from '../../../components/report'
import { AddEntryButtons } from '../../../components/DayEntries'
import { useApp } from '../../../context/AppContext'
import { BRANCHES, branchName } from '../../../data/mock'
import { FOOD_COST_TARGET, byBranch, daily, monthName, profitLoss, purchases, useReportData } from '../../../data/analytics'

function verdict(pct: number | null): [string, 'green' | 'amber' | 'red' | 'slate'] {
  if (pct == null) return ['No sales', 'slate']
  if (pct <= 25) return ['Very good', 'green']
  if (pct <= FOOD_COST_TARGET) return ['Good', 'green']
  if (pct <= 38) return ['Above target', 'amber']
  return ['Too costly', 'red']
}

// Food cost = ingredients bought (groceries, vegetables, milk … from bills and branch cash) ÷ food sold.
// Worked out automatically from Imprest Books and posted bills.
export default function FoodCostReport() {
  const { can } = useApp()
  const R = useReportData()
  const p = profitLoss(R.d, R.scope)
  const pur = purchases(R.d, R.scope)
  const branches = R.branch ? [] : byBranch(R.d, R.scope).filter((x) => x.p.sales.food || x.p.food)
    .sort((a, b) => (b.p.foodPct ?? 0) - (a.p.foodPct ?? 0))
  // Running food cost % through the period (purchases are lumpy day to day, so a running figure reads better).
  let s = 0
  let f = 0
  const trend = daily(R.d, R.scope).map((d) => {
    s += d.food
    f += d.bought
    return { label: d.label, pct: s ? Math.round((f / s) * 1000) / 10 : null }
  }).filter((d) => d.pct != null)
  const rises = pur.prices.filter((x) => x.pct > 0.5)
  const over = branches.filter((x) => (x.p.foodPct ?? 0) > FOOD_COST_TARGET)
  const [label, tone] = verdict(p.foodPct)
  const picker = <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />
  const upload = <AddEntryButtons disabled={!can('accounts', 'create')} />

  if (!p.sales.food && !p.food) {
    return <EmptyReport title="Food Cost Report" period={R.hasData ? `${R.label} · nothing yet` : 'Worked out from Imprest Books and bills'} icon={BookOpenCheck}
      actions={<>{R.hasData && picker}{upload}</>}
      text="Upload Imprest Books (food sales) and post ingredient bills (groceries, vegetables, milk). The food cost is then worked out automatically for every branch." />
  }

  const csv = () => downloadCsv(`BTI-Food-Cost-${R.month || 'all'}.csv`, [
    ['Branch', 'Food sales', 'Ingredients bought', 'Food cost %', 'Verdict'],
    ...(R.branch ? [{ b: { name: branchName(R.branch) }, p }] : branches).map(({ b, p: q }) => [b.name, q.sales.food, q.food, q.foodPct?.toFixed(1) ?? '', verdict(q.foodPct)[0]]),
    ['Total', p.sales.food, p.food, p.foodPct?.toFixed(1) ?? '', label],
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Food Cost Report" period={`${R.label} · ${R.branch ? branchName(R.branch) : 'all branches'} · ingredients bought compared with food sold`}
        actions={<>{picker}{upload}</>} onCsv={csv} />

      <Summary points={[
        p.foodPct != null
          ? <>For every <Big>₹100</Big> of food sold, <Big>{per100(p.food, p.sales.food)}</Big> was spent on ingredients. The aim is ₹{FOOD_COST_TARGET} or less: {p.foodPct <= FOOD_COST_TARGET ? <Big>within target ✓</Big> : <Big>{(p.foodPct - FOOD_COST_TARGET).toFixed(1)} points above target</Big>}.</>
          : <>Ingredients of <Big>{money(p.food)}</Big> were bought, but no food sales are recorded yet for this period. Upload the Imprest Books to work out the food cost.</>,
        p.purchasesByLedger[0] && <>The biggest ingredient cost is <Big>{p.purchasesByLedger[0].k}</Big> ({money(p.purchasesByLedger[0].v)}{p.sales.food ? `, ${per100(p.purchasesByLedger[0].v, p.sales.food)} of every ₹100` : ''}).</>,
        p.foodPct != null && p.foodPct > FOOD_COST_TARGET ? <>To get back to target, ingredients would need to be about <Big>{money(p.food - (p.sales.food * FOOD_COST_TARGET) / 100)}</Big> less for the same sales.</> : null,
        over.length ? <><Big>{over.map((o) => o.b.name).join(', ')}</Big> {over.length > 1 ? 'are' : 'is'} above the ₹{FOOD_COST_TARGET} target.</> : branches.length > 1 ? <>All branches are within the ₹{FOOD_COST_TARGET} target.</> : null,
        rises.length ? <>Prices went up for <Big>{rises.slice(0, 3).map((r) => r.item).join(', ')}</Big>, which pushes food cost up.</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Food cost" value={p.foodPct != null ? p.foodPct.toFixed(1) + '%' : '—'} note={<>Target {FOOD_COST_TARGET}% · <Badge tone={tone}>{label}</Badge></>} tone={tone === 'green' ? 'green' : tone === 'slate' ? 'slate' : 'red'} />
        <Tile label="Food sold" value={money(p.sales.food)} note="Without GST" />
        <Tile label="Ingredients bought" value={money(p.food)} note={`${pur.posted} posted bill(s) + branch cash`} />
        <Tile label="Left after ingredients" value={money(p.sales.food - p.food)} tone={p.sales.food - p.food >= 0 ? 'green' : 'red'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Ingredients, per ₹100 of food sold" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {p.purchasesByLedger.map(({ k, v }) => (
              <li key={k} className="px-4 py-2.5">
                <div className="mb-1.5 flex justify-between text-sm"><span>{k}</span>
                  <span className="tabular-nums"><b>{money(v, false)}</b>{p.sales.food ? <span className="ml-1 text-xs text-slate-500">{per100(v, p.sales.food)}</span> : null}</span></div>
                <ShareBar value={v} max={p.purchasesByLedger[0].v} color="#d9a441" />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Food cost % as the period goes on" className="lg:col-span-3">
          {trend.length > 1 ? (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} unit="%" width={45} />
                  <Tooltip formatter={(v: number) => v + '%'} />
                  <ReferenceLine y={FOOD_COST_TARGET} stroke="#15803d" strokeDasharray="4 4" label={{ value: `Target ${FOOD_COST_TARGET}%`, fontSize: 11, fill: '#15803d', position: 'insideTopRight' }} />
                  <Line dataKey="pct" name="Food cost so far" stroke="#7a2228" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-500">The trend shows once there are two or more days of figures.</p>}
        </Card>
      </div>

      {branches.length > 0 && (
        <Card title={`Food cost at each branch (target ${FOOD_COST_TARGET}%)`} className="mt-4" pad={false}>
          <ul className="divide-y divide-slate-100">
            {branches.map(({ b, p: q }) => {
              const [l, t] = verdict(q.foodPct)
              return (
                <li key={b.id} className="cursor-pointer px-4 py-3 hover:bg-slate-50" onClick={() => R.setBranch(b.id)}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{b.name} <span className="font-normal text-slate-500">· sold {money(q.sales.food)}, bought {money(q.food)}</span></span>
                    <span className="flex items-center gap-2 tabular-nums font-semibold">{q.foodPct != null ? q.foodPct.toFixed(1) + '%' : '—'} <Badge tone={t}>{l}</Badge></span>
                  </div>
                  <ShareBar value={Math.min(q.foodPct ?? 0, 60)} max={60} color={(q.foodPct ?? 0) > FOOD_COST_TARGET ? '#e11d48' : '#15803d'} />
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-500">
        How this is worked out: food cost = ingredients bought ÷ food sold (both without GST). Ingredients are the purchase ledgers (groceries, vegetables, milk …)
        from posted bills and from branch cash in the Imprest Book. Stock left over at month end isn't counted yet, so a big stock-up can make one month look high and the next look low.
      </p>
    </div>
  )
}
