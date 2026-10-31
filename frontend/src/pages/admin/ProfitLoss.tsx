import { Fragment, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Scale } from 'lucide-react'
import { Card } from '../../components/ui'
import { Big, EmptyReport, ReportHeader, ScopePicker, Summary, Tile, downloadCsv, money, per100 } from '../../components/report'
import { AddEntryButtons } from '../../components/DayEntries'
import { BalanceSheet, ExpensesTab, IncomeReport, TrialBalance } from '../../components/FinalAccounts'
import MisReport from '../../components/MisReport'
import { useApp } from '../../context/AppContext'
import { BRANCHES, branchName } from '../../data/mock'
import { FOOD_COST_TARGET, byBranch, daily, monthName, profitLoss, useReportData } from '../../data/analytics'

// Profit & Loss = Income − Expenses. Balance Sheet = Assets and Liabilities. Trial Balance = every ledger, both together.
const TABS = [
  { id: 'mis', label: 'MIS Format' },
  { id: 'pnl', label: 'Profit & Loss' },
  { id: 'income', label: 'Income' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'bs', label: 'Balance Sheet' },
  { id: 'tb', label: 'Trial Balance' },
] as const

const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '—')

// Profit & Loss worked out from day entries (Imprest Books) and posted bills. Nothing typed in by hand.
export default function ProfitLoss() {
  const { can } = useApp()
  const R = useReportData()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('mis')
  const p = profitLoss(R.d, R.scope)
  const branches = R.branch ? [] : byBranch(R.d, R.scope).sort((a, b) => b.p.net - a.p.net)
  const trend = daily(R.d, R.scope)
  const upload = <AddEntryButtons disabled={!can('accounts', 'create')} />
  const picker = <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />

  if (!R.hasData) {
    return <EmptyReport title="Profit & Loss" period="Worked out from Imprest Books and bills" icon={Scale} actions={upload}
      text="Upload an Imprest Book PDF (or enter a day by hand) and post bills from the OCR Bill Inbox. Profit & Loss is then worked out automatically." />
  }

  type Row = { label: string; v?: number; kind: 'head' | 'line' | 'total' | 'grand'; minus?: boolean }
  const rows: Row[] = [
    { label: 'Income', kind: 'head' },
    { label: 'Food sales (without GST)', v: p.sales.food, kind: 'line' },
    { label: 'Container charges', v: p.sales.container, kind: 'line' },
    ...(p.sales.roundOff ? [{ label: 'Round off', v: p.sales.roundOff, kind: 'line' as const }] : []),
    { label: 'Less: settlement discounts', v: -p.sales.discount, kind: 'line', minus: true },
    { label: 'Net income', v: p.income, kind: 'total' },
    { label: 'Cost of food (ingredients bought)', kind: 'head' },
    ...p.purchasesByLedger.map((x) => ({ label: x.k, v: -x.v, kind: 'line' as const, minus: true })),
    { label: 'Gross profit (income minus ingredients)', v: p.gross, kind: 'total' },
    { label: 'Running costs', kind: 'head' },
    ...p.expensesByLedger.map((x) => ({ label: x.k, v: -x.v, kind: 'line' as const, minus: true })),
    { label: 'Staff', kind: 'head' },
    ...p.salariesByLedger.map((x) => ({ label: x.k, v: -x.v, kind: 'line' as const, minus: true })),
    { label: 'Net profit', v: p.net, kind: 'grand' },
  ]

  const csv = () => downloadCsv(`BTI-Profit-Loss-${R.month || 'all'}${R.branch ? '-' + branchName(R.branch) : ''}.csv`, [
    ['Particulars', 'Amount', '% of food sales'],
    ...rows.map((r) => [r.label, r.v !== undefined ? r.v : '', r.v !== undefined ? pct(r.v, p.sales.food) : '']),
  ])
  const biggestCost = p.expensesByLedger[0]

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Profit & Loss" period={`${R.label} · ${R.branch ? branchName(R.branch) : 'all branches'} · from ${p.sales.days} Imprest Book day(s) and posted bills`}
        actions={<>{picker}{upload}</>} onCsv={csv} />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 print:hidden" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-[#7a2228] text-white' : 'text-slate-600 hover:bg-[#fbf3e4]'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'mis' ? <MisReport d={R.d} scope={R.scope} />
        : tab === 'income' ? <IncomeReport d={R.d} scope={R.scope} />
        : tab === 'expenses' ? <ExpensesTab d={R.d} scope={R.scope} />
        : tab === 'bs' ? <BalanceSheet d={R.d} scope={R.scope} />
        : tab === 'tb' ? <TrialBalance d={R.d} scope={R.scope} />
        : (<>
      <Summary points={[
        <>BTI {R.branch ? `(${branchName(R.branch)}) ` : ''}sold <Big>{money(p.sales.food)}</Big> of food (without GST) and made a <Big>{p.net >= 0 ? 'profit' : 'loss'} of {money(Math.abs(p.net))}</Big>.</>,
        p.foodPct != null
          ? <>Ingredients cost <Big>{per100(p.food, p.sales.food)}</Big> of every ₹100 of food sold. The aim is ₹{FOOD_COST_TARGET} or less: {p.foodPct <= FOOD_COST_TARGET ? <Big>within target ✓</Big> : <Big>above target</Big>}.</>
          : <>No food sales yet in this period, so food cost can't be worked out.</>,
        biggestCost ? <>The biggest running cost is <Big>{biggestCost.k}</Big> ({money(biggestCost.v)}).</> : <>No running costs recorded.</>,
        p.sales.discount ? <>Settlement discounts reduced income by <Big>{money(p.sales.discount)}</Big>.</> : <>No settlement discounts.</>,
        branches.length > 1 ? <><Big>{branches[0].b.name}</Big> made the most profit; <Big>{branches[branches.length - 1].b.name}</Big> the least.</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Net income" value={money(p.income)} note={`${p.sales.days} day(s) of sales`} />
        <Tile label="Ingredients" value={money(p.food)} note={p.foodPct != null ? `${p.foodPct.toFixed(1)}% of food sales` : '—'}
          tone={p.foodPct == null ? 'slate' : p.foodPct <= FOOD_COST_TARGET ? 'green' : 'red'} />
        <Tile label="Running costs + staff" value={money(p.running + p.staff)} note={`${per100(p.running + p.staff, p.sales.food)} of every ₹100`} />
        <Tile label={p.net >= 0 ? 'Net profit' : 'Net loss'} value={money(p.net)} note={`${pct(p.net, p.sales.food)} of food sales`} tone={p.net >= 0 ? 'green' : 'red'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Statement" className="lg:col-span-3" pad={false}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-2 text-left font-medium">Particulars</th><th className="px-4 text-right font-medium">Amount</th><th className="px-4 text-right font-medium">% of food sales</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                  {r.kind === 'head' ? (
                    <tr><td colSpan={3} className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-[#7a2228]">{r.label}</td></tr>
                  ) : (
                    <tr className={r.kind === 'grand' ? 'bg-[#fdf8ee] text-base font-bold' : r.kind === 'total' ? 'border-t border-slate-200 font-semibold' : ''}>
                      <td className={`px-4 py-1.5 ${r.kind === 'line' ? 'pl-8 text-slate-700' : ''}`}>{r.label}</td>
                      <td className={`px-4 text-right tabular-nums ${(r.v ?? 0) < 0 && r.kind !== 'line' ? 'text-rose-600' : ''}`}>{money(r.v ?? 0, false)}</td>
                      <td className="px-4 text-right tabular-nums text-slate-500">{pct(Math.abs(r.v ?? 0), p.sales.food)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            GST collected on sales and GST paid on bills are not income or cost (they go to and come back from the government), so they are left out.
            Swiggy / Zomato amounts are as recorded in the Imprest Book; their commission shows up once their payout statements are added.
          </p>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {trend.length > 1 && (
            <Card title="Day by day">
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => money(v)} width={70} />
                    <Tooltip formatter={(v: number) => money(v, false)} />
                    <Legend />
                    <Bar dataKey="food" name="Food sales" fill="#7a2228" />
                    <Line dataKey="bought" name="Ingredients" stroke="#d9a441" strokeWidth={2} />
                    <Line dataKey="spent" name="Other costs" stroke="#64748b" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {branches.length > 0 && (
            <Card title="By branch" pad={false}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="px-4 py-2 text-left font-medium">Branch</th><th className="px-3 text-right font-medium">Food sales</th><th className="px-3 text-right font-medium">Food cost</th><th className="px-4 text-right font-medium">Profit</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.map(({ b, p: q }) => (
                    <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => R.setBranch(b.id)}>
                      <td className="px-4 py-2 font-medium">{b.name}</td>
                      <td className="px-3 text-right tabular-nums">{money(q.sales.food)}</td>
                      <td className={`px-3 text-right tabular-nums ${q.foodPct != null && q.foodPct > FOOD_COST_TARGET ? 'text-rose-600' : ''}`}>{q.foodPct != null ? q.foodPct.toFixed(1) + '%' : '—'}</td>
                      <td className={`px-4 text-right font-semibold tabular-nums ${q.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(q.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Click a branch to see its own statement.</p>
            </Card>
          )}
        </div>
      </div>
      </>)}
    </div>
  )
}
