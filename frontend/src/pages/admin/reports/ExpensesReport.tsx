import { useState } from 'react'
import { Check, Receipt, X } from 'lucide-react'
import { Badge, Button, Card } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ShareBar, Summary, Tile, downloadCsv, money, per100 } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { EXPENSES, branchName } from '../../../data/mock'
import { OUTLETS, buildPnl } from '../../../data/pnl'
import { EntriesOnly, EntryPayouts } from '../../../components/DayEntries'
import { useEntries } from '../../../data/entries'

const STATUS: Record<string, [string, 'green' | 'amber' | 'red']> = {
  approved: ['Approved', 'green'],
  pending: ['Waiting for approval', 'amber'],
  rejected: ['Rejected', 'red'],
}

export default function ExpensesReport() {
  const hasEntries = useEntries().some((e) => e.payouts.some((x) => x.type === 'expense'))
  const { can } = useApp()
  const [claims, setClaims] = useState(EXPENSES)
  const p = buildPnl(OUTLETS.map((b) => b.id), 'this')

  // Every rupee of sales, split into where it went. Profit is what's left.
  const lines = [
    { label: 'Ingredients (food & groceries)', v: p.food },
    ...p.expenses.map((e) => ({ label: e.label, v: e.v })),
    { label: 'Wear & tear of equipment', v: p.depreciation },
  ].sort((a, b) => b.v - a.v)
  const spent = lines.reduce((s, l) => s + l.v, 0)
  const runningCosts = p.opex + p.depreciation
  const biggest = lines.filter((l) => !l.label.startsWith('Ingredients'))[0]
  const waiting = claims.filter((c) => c.status === 'pending')

  const perOutlet = OUTLETS.map((b) => {
    const q = buildPnl([b.id], 'this')
    return { b, cost: q.opex + q.depreciation, sales: q.sales }
  }).sort((a, b) => b.cost / b.sales - a.cost / a.sales)

  const setStatus = (id: string, status: string) => setClaims((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)))

  const csv = () => downloadCsv('BTI-Expenses-Report-Oct-2026.csv', [
    ['Expense', 'Amount', 'Out of every Rs 100 of sales'],
    ...lines.map((l) => [l.label, Math.round(l.v), per100(l.v, p.sales).replace('₹', '')]),
    ['Profit left', Math.round(p.net), per100(p.net, p.sales).replace('₹', '')],
  ])

  if (!spent && !claims.length) {
    if (hasEntries) return <EntriesOnly title="Expenses Report"><EntryPayouts type="expense" /></EntriesOnly>
    return <EmptyReport title="Expenses Report" period="October 2026" icon={Receipt}
      text="Running costs and expense claims from outlets show up here once they are recorded." />
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Expenses Report" period="October 2026 · all outlets · where the money went" onCsv={csv} />
      <div className="mb-4"><EntryPayouts type="expense" /></div>

      <Summary points={[
        <>Out of every <Big>₹100</Big> BTI earned, <Big>{per100(p.food, p.sales)}</Big> went on ingredients and <Big>{per100(runningCosts, p.sales)}</Big> on running the outlets. <Big>{per100(p.net, p.sales)}</Big> was left as profit.</>,
        <>The biggest cost after ingredients is <Big>{biggest.label.toLowerCase()}</Big>: {money(biggest.v)}, or {per100(biggest.v, p.sales)} of every ₹100.</>,
        <>Running costs (everything except ingredients) came to <Big>{money(runningCosts)}</Big> this month.</>,
        <><Big>{perOutlet[0].b.name}</Big> has the highest running costs compared with its sales ({per100(perOutlet[0].cost, perOutlet[0].sales)} of every ₹100).</>,
        waiting.length
          ? <><Big>{waiting.length} expense claims</Big> ({money(waiting.reduce((s, c) => s + c.amount, 0), false)}) are waiting for approval.</>
          : <>No expense claims are waiting for approval.</>,
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total spent" value={money(spent)} note="Ingredients + running costs" />
        <Tile label="Ingredients" value={money(p.food)} note={`${per100(p.food, p.sales)} of every ₹100`} />
        <Tile label="Running costs" value={money(runningCosts)} note={`${per100(runningCosts, p.sales)} of every ₹100`} />
        <Tile label="Left as profit" value={money(p.net)} note={`${per100(p.net, p.sales)} of every ₹100`} tone={p.net >= 0 ? 'green' : 'red'} />
      </div>

      {/* Every ₹100 strip */}
      <Card className="mt-4" title="Every ₹100 of sales, split up">
        <div className="flex h-10 overflow-hidden rounded-lg text-xs font-medium text-white">
          {[
            { label: 'Ingredients', v: p.food, c: '#7a2228' },
            { label: 'Staff', v: p.expenses.find((e) => e.key === 'salaries')!.v, c: '#a0412f' },
            { label: 'Rent', v: p.expenses.find((e) => e.key === 'rent')!.v, c: '#c06a35' },
            { label: 'Other costs', v: runningCosts - p.expenses.find((e) => e.key === 'salaries')!.v - p.expenses.find((e) => e.key === 'rent')!.v, c: '#d9a441' },
            { label: 'Profit', v: Math.max(0, p.net), c: '#15803d' },
          ].map((s) => (
            <div key={s.label} title={`${s.label}: ${money(s.v)}`} className="grid min-w-0 place-items-center truncate px-1" style={{ width: (s.v / p.sales) * 100 + '%', background: s.c }}>
              {s.label} {per100(s.v, p.sales)}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Where the money went" className="lg:col-span-3" pad={false}>
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.label} className="px-4 py-2.5">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span>{l.label}</span>
                  <span className="shrink-0 tabular-nums"><b>{money(l.v, false)}</b> <span className="ml-1 text-xs text-slate-500">{per100(l.v, p.sales)} of ₹100</span></span>
                </div>
                <ShareBar value={l.v} max={lines[0].v} />
              </li>
            ))}
            <li className="flex justify-between bg-emerald-50 px-4 py-3 text-sm font-semibold">
              <span>Left as profit</span><span className="tabular-nums text-emerald-700">{money(p.net, false)}</span>
            </li>
          </ul>
        </Card>

        <Card title="Running costs by outlet" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {perOutlet.map(({ b, cost, sales }) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-xs text-slate-500">{per100(cost, sales)} of every ₹100 it sells</span>
                </span>
                <b className="tabular-nums">{money(cost)}</b>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Running costs = everything except ingredients, including each outlet's share of the central kitchen.</p>
        </Card>
      </div>

      <Card title="Expense claims from outlets" className="mt-4" pad={false}>
        <ul className="divide-y divide-slate-100">
          {claims.map((c) => {
            const [label, tone] = STATUS[c.status]
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.desc}</span>
                  <span className="block text-xs text-slate-500">{branchName(c.branch)} · {c.category} · {c.date}</span>
                </span>
                <b className="text-sm tabular-nums">{money(c.amount, false)}</b>
                <Badge tone={tone}>{label}</Badge>
                {c.status === 'pending' && can('expenses', 'approve') && (
                  <span className="flex gap-1">
                    <Button size="sm" icon={Check} onClick={() => setStatus(c.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus(c.id, 'rejected')}>Reject</Button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
