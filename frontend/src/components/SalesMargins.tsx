import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card } from './ui'
import { Big, Summary, Tile, money } from './report'
import { branchName, inr } from '../data/mock'
import { niceDate } from '../data/entries'
import { FOOD_COST_TARGET, byBranch, daily, profitLoss, type Data, type Scope } from '../data/analytics'

// Food cost and gross margin, shown inside the Sales Report.
// Food cost = ingredients bought ÷ food sold. Gross margin = food sold − ingredients (what's left for staff, rent and profit).

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : null)
const fmtPct = (n: number | null) => (n == null ? '—' : n.toFixed(1) + '%')
function verdict(fc: number | null): [string, 'green' | 'amber' | 'red' | 'slate'] {
  if (fc == null) return ['No sales', 'slate']
  if (fc <= FOOD_COST_TARGET) return ['Within target', 'green']
  if (fc <= 38) return ['Above target', 'amber']
  return ['Too costly', 'red']
}

export default function SalesMargins({ d, scope }: { d: Data; scope: Scope }) {
  const p = profitLoss(d, scope)
  const sold = p.sales.food
  const margin = sold - p.food
  const marginPct = pct(margin, sold)
  const fc = p.foodPct
  const [label, tone] = verdict(fc)
  const outlets = scope.branch ? [] : byBranch(d, scope).filter((x) => x.p.sales.food || x.p.food)
    .map(({ b, p: q }) => ({ b, sold: q.sales.food, bought: q.food, fc: q.foodPct, margin: q.sales.food - q.food }))
    .sort((a, b) => b.margin - a.margin)
  const days = daily(d, scope).map((x) => ({ ...x, fc: pct(x.bought, x.food), margin: x.food - x.bought }))

  return (
    <>
      <Summary points={[
        <>Food sold: <Big>{money(sold)}</Big> (without GST). Ingredients bought: <Big>{money(p.food)}</Big>.</>,
        fc != null
          ? <>Food cost is <Big>{fc.toFixed(1)}%</Big>, so <Big>₹{fc.toFixed(0)}</Big> of every ₹100 sold went on ingredients. Target is {FOOD_COST_TARGET}%: {fc <= FOOD_COST_TARGET ? <Big>within target ✓</Big> : <Big>{(fc - FOOD_COST_TARGET).toFixed(1)} points above</Big>}.</>
          : <>No food sales in this period, so food cost can't be worked out.</>,
        <>Gross margin is <Big>{money(margin)}</Big>{marginPct != null ? <> ({marginPct.toFixed(1)}% of food sold)</> : null}: what's left after ingredients to pay staff, rent and other costs.</>,
        outlets.length > 1 ? <><Big>{outlets[0].b.name}</Big> earned the most margin; <Big>{outlets[outlets.length - 1].b.name}</Big> the least.</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Food sold" value={money(sold)} note={`${p.sales.days} day(s) · without GST`} />
        <Tile label="Ingredients bought" value={money(p.food)} note="Posted bills + branch cash" />
        <Tile label="Food cost" value={fmtPct(fc)} note={<>Target {FOOD_COST_TARGET}% · <Badge tone={tone}>{label}</Badge></>} tone={fc == null ? 'slate' : fc <= FOOD_COST_TARGET ? 'green' : 'red'} />
        <Tile label="Gross margin" value={money(margin)} note={marginPct != null ? `${marginPct.toFixed(1)}% of food sold` : '—'} tone={margin >= 0 ? 'green' : 'red'} />
      </div>

      {outlets.length > 0 && (
        <Card title="Food cost & gross margin by outlet" className="mt-4" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>{['Outlet', 'Food sold', 'Ingredients', 'Food cost', 'Gross margin', 'Margin %', ''].map((h, i) => <th key={h + i} className={`px-4 py-2 font-medium ${i && i < 6 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outlets.map((o) => {
                  const [l, t] = verdict(o.fc)
                  return (
                    <tr key={o.b.id}>
                      <td className="px-4 py-2.5 font-medium">{o.b.name}</td>
                      <td className="px-4 text-right tabular-nums">{inr(Math.round(o.sold))}</td>
                      <td className="px-4 text-right tabular-nums">{inr(Math.round(o.bought))}</td>
                      <td className={`px-4 text-right font-semibold tabular-nums ${o.fc != null && o.fc > FOOD_COST_TARGET ? 'text-rose-600' : 'text-emerald-700'}`}>{fmtPct(o.fc)}</td>
                      <td className={`px-4 text-right font-semibold tabular-nums ${o.margin < 0 ? 'text-rose-600' : ''}`}>{money(o.margin, false)}</td>
                      <td className="px-4 text-right tabular-nums">{fmtPct(pct(o.margin, o.sold))}</td>
                      <td className="px-4"><Badge tone={t}>{l}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Day by day" className="mt-4" pad={false}>
        {days.length > 1 && (
          <div className="h-64 px-4 pt-4">
            <ResponsiveContainer>
              <ComposedChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="r" fontSize={11} tickFormatter={(v: number) => money(v)} width={70} />
                <YAxis yAxisId="p" orientation="right" fontSize={11} unit="%" width={45} />
                <Tooltip formatter={(v: number, n: string) => (n === 'Food cost %' ? v.toFixed(1) + '%' : money(v, false))} />
                <Legend />
                <Bar yAxisId="r" dataKey="margin" name="Gross margin" fill="#7a2228" isAnimationActive={false} />
                <Line yAxisId="p" dataKey="fc" name="Food cost %" stroke="#d9a441" strokeWidth={2} connectNulls isAnimationActive={false} />
                <ReferenceLine yAxisId="p" y={FOOD_COST_TARGET} stroke="#15803d" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>{['Date', 'Food sold', 'Ingredients bought', 'Food cost', 'Gross margin'].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...days].reverse().map((x) => (
                <tr key={x.day}>
                  <td className="px-4 py-2.5">{niceDate(x.day)}</td>
                  <td className="px-4 text-right tabular-nums">{x.food ? inr(Math.round(x.food)) : '—'}</td>
                  <td className="px-4 text-right tabular-nums">{x.bought ? inr(Math.round(x.bought)) : '—'}</td>
                  <td className={`px-4 text-right tabular-nums ${x.fc != null && x.fc > FOOD_COST_TARGET ? 'text-rose-600' : ''}`}>{fmtPct(x.fc)}</td>
                  <td className={`px-4 text-right font-medium tabular-nums ${x.margin < 0 ? 'text-rose-600' : ''}`}>{money(x.margin, false)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5">Total</td><td className="px-4 text-right tabular-nums">{inr(Math.round(sold))}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(p.food))}</td>
                <td className="px-4 text-right tabular-nums">{fmtPct(fc)}</td><td className="px-4 text-right tabular-nums">{money(margin, false)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          A single day's food cost jumps when a big stock-up is bought that day; the total for the period is the one to watch.
          More detail per ingredient is in the <Link className="text-[#7a2228] underline" to="/admin/accounting/costing">Food Cost Report</Link>.
          {scope.branch && <> Showing {branchName(scope.branch)} only.</>}
        </p>
      </Card>
    </>
  )
}
