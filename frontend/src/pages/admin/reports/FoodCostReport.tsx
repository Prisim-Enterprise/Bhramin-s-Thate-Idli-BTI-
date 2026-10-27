import { BookOpenCheck } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ShareBar, Summary, Tile, downloadCsv, money, per100 } from '../../../components/report'
import { RECIPES } from '../../../data/mock'
import { OUTLETS } from '../../../data/pnl'
import TallyFoodCosting from '../FoodCosting'

const TARGET = 32 // ingredients should cost ₹32 or less out of every ₹100

function verdict(costPct: number): [string, 'green' | 'amber' | 'red'] {
  if (costPct <= 25) return ['Very good', 'green']
  if (costPct <= 35) return ['Good', 'amber']
  return ['Too costly', 'red']
}

export default function FoodCostReport() {
  const [view, setView] = useState<'simple' | 'tally'>('simple')

  const dishes = RECIPES.map((r) => ({
    ...r,
    profitPerPlate: r.price - r.cost,
    costPct: (r.cost / r.price) * 100,
    totalProfit: (r.price - r.cost) * r.sold,
  }))
  const revenue = dishes.reduce((s, d) => s + d.price * d.sold, 0)
  const cost = dishes.reduce((s, d) => s + d.cost * d.sold, 0)
  const costPct = (cost / revenue) * 100
  const bestEarner = [...dishes].sort((a, b) => b.totalProfit - a.totalProfit)[0]
  const costliest = [...dishes].sort((a, b) => b.costPct - a.costPct)[0]
  const outlets = [...OUTLETS].sort((a, b) => b.foodCost - a.foodCost)
  const overTarget = outlets.filter((o) => o.foodCost > TARGET)

  const csv = () => downloadCsv('BTI-Food-Cost-Report-Oct-2026.csv', [
    ['Dish', 'Selling price', 'Ingredient cost', 'Profit per plate', 'Ingredient cost %', 'Plates sold', 'Total profit'],
    ...dishes.map((d) => [d.dish, d.price, d.cost, d.profitPerPlate, d.costPct.toFixed(1), d.sold, d.totalProfit]),
  ])

  const toggle = (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
      {(['simple', 'tally'] as const).map((v) => (
        <button key={v} onClick={() => setView(v)}
          className={`rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          {v === 'simple' ? 'Simple view' : 'Accountant view (Tally)'}
        </button>
      ))}
    </div>
  )

  if (!RECIPES.length) {
    return <EmptyReport title="Food Cost Report" period="October 2026" icon={BookOpenCheck}
      text="Add your dishes with their selling price and ingredient cost, and record how many were sold, to see food cost here." />
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Food Cost Report" period="October 2026 · how much our ingredients cost compared with what we charge" actions={toggle} onCsv={csv} />

      {view === 'tally' ? <TallyFoodCosting /> : (
        <>
          <Summary points={[
            <>For every <Big>₹100</Big> of food we sell, <Big>{per100(cost, revenue)}</Big> is spent on ingredients. The aim is ₹{TARGET} or less: {costPct <= TARGET ? <Big>we are within it ✓</Big> : <Big>we are above it</Big>}.</>,
            <>That leaves <Big>{per100(revenue - cost, revenue)}</Big> from every ₹100 to pay staff, rent and other costs, and to keep as profit.</>,
            <><Big>{bestEarner.dish}</Big> brings in the most profit: {money(bestEarner.profitPerPlate, false)} per plate, {money(bestEarner.totalProfit)} in total.</>,
            <>Watch <Big>{costliest.dish}</Big>: its ingredients cost {costliest.costPct.toFixed(0)}% of its price. Check the recipe or raise the price.</>,
            overTarget.length
              ? <><Big>{overTarget.map((o) => o.name).join(', ')}</Big> {overTarget.length > 1 ? 'are' : 'is'} spending more than ₹{TARGET} of every ₹100 on ingredients.</>
              : <>All outlets are within the ₹{TARGET} target.</>,
          ]} />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Ingredient cost" value={per100(cost, revenue) + ' of ₹100'} note={`Target ₹${TARGET} or less`} tone={costPct <= TARGET ? 'green' : 'red'} />
            <Tile label="Food sold" value={money(revenue)} />
            <Tile label="Spent on ingredients" value={money(cost)} />
            <Tile label="Earned after ingredients" value={money(revenue - cost)} tone="green" />
          </div>

          <Card title="Every dish: what it costs us vs what we charge" className="mt-4" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Dish</th>
                    <th className="px-3 text-right font-medium">We charge</th>
                    <th className="px-3 text-right font-medium">Ingredients cost</th>
                    <th className="px-3 text-right font-medium">We earn per plate</th>
                    <th className="px-3 text-right font-medium">Plates sold</th>
                    <th className="px-3 text-right font-medium">Total earned</th>
                    <th className="px-4 text-left font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...dishes].sort((a, b) => b.totalProfit - a.totalProfit).map((d) => {
                    const [label, tone] = verdict(d.costPct)
                    return (
                      <tr key={d.dish}>
                        <td className="px-4 py-2.5"><span className="block font-medium">{d.dish}</span><span className="text-xs text-slate-500">{d.category}</span></td>
                        <td className="px-3 text-right tabular-nums">₹{d.price}</td>
                        <td className="px-3 text-right tabular-nums">₹{d.cost} <span className="text-xs text-slate-400">({d.costPct.toFixed(0)}%)</span></td>
                        <td className="px-3 text-right font-medium tabular-nums text-emerald-700">₹{d.profitPerPlate}</td>
                        <td className="px-3 text-right tabular-nums">{d.sold.toLocaleString('en-IN')}</td>
                        <td className="px-3 text-right tabular-nums">{money(d.totalProfit, false)}</td>
                        <td className="px-4"><Badge tone={tone}>{label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              Verdict: ingredients under 25% of price = very good · 25–35% = good · above 35% = too costly.
            </p>
          </Card>

          <Card title="Ingredient cost at each outlet (out of every ₹100 sold)" className="mt-4" pad={false}>
            <ul className="divide-y divide-slate-100">
              {outlets.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{o.name}</span>
                    <span className={`font-semibold tabular-nums ${o.foodCost > TARGET ? 'text-rose-600' : 'text-emerald-700'}`}>
                      ₹{o.foodCost.toFixed(0)} {o.foodCost > TARGET ? '· above target' : '✓'}
                    </span>
                  </div>
                  <ShareBar value={o.foodCost} max={40} color={o.foodCost > TARGET ? '#e11d48' : '#15803d'} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
