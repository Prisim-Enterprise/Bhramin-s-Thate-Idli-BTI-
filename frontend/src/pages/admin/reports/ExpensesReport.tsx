import { Receipt } from 'lucide-react'
import { Badge, Card, Table } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ScopePicker, ShareBar, Summary, Tile, downloadCsv, money, per100 } from '../../../components/report'
import { AddEntryButtons } from '../../../components/DayEntries'
import { useApp } from '../../../context/AppContext'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { niceDate } from '../../../data/entries'
import { byBranch, monthName, profitLoss, useReportData } from '../../../data/analytics'

// Where the money went: every expense and salary line from Imprest Books, posted bills and vouchers.
export default function ExpensesReport() {
  const { can } = useApp()
  const R = useReportData()
  const p = profitLoss(R.d, R.scope)
  const lines = p.lines.filter((l) => l.type !== 'purchase')
  const spent = p.running + p.staff
  const all = [...p.expensesByLedger, ...p.salariesByLedger].sort((a, b) => b.v - a.v)
  const branches = R.branch ? [] : byBranch(R.d, R.scope)
    .map(({ b, p: q }) => ({ b, cost: q.running + q.staff, sales: q.sales.food }))
    .filter((x) => x.cost).sort((a, b) => b.cost - a.cost)
  const fromBills = lines.filter((l) => l.from === 'Bill').reduce((s, l) => s + l.amount, 0)
  const picker = <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />
  const upload = <AddEntryButtons disabled={!can('accounts', 'create')} />

  if (!lines.length) {
    return <EmptyReport title="Expenses Report" period={R.hasData ? `${R.label} · no expenses yet` : 'Worked out from Imprest Books and bills'} icon={Receipt}
      actions={<>{R.hasData && picker}{upload}</>}
      text="Expenses paid out of branch cash (Imprest Book) and expense bills posted from the OCR Bill Inbox (gas, cleaning, repairs, conveyance…) show up here automatically." />
  }

  const csv = () => downloadCsv(`BTI-Expenses-${R.month || 'all'}.csv`, [
    ['Date', 'Branch', 'Ledger', 'Kind', 'From', 'Amount'],
    ...lines.map((l) => [l.date, branchName(l.branch), l.ledger, l.type === 'salary' ? 'Staff' : 'Running cost', l.from, l.amount]),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Expenses Report" period={`${R.label} · ${R.branch ? branchName(R.branch) : 'all branches'} · where the money went`} actions={<>{picker}{upload}</>} onCsv={csv} />

      <Summary points={[
        <><Big>{money(spent)}</Big> was spent on running costs and staff{p.sales.food ? <>, which is <Big>{per100(spent, p.sales.food)}</Big> of every ₹100 of food sold</> : null}.</>,
        all[0] && <>The biggest item is <Big>{all[0].k}</Big>: {money(all[0].v)}{spent ? ` (${Math.round((all[0].v / spent) * 100)}% of the total)` : ''}.</>,
        p.staff ? <>Staff costs (salaries paid, advances) came to <Big>{money(p.staff)}</Big>.</> : <>No salary payments were recorded in this period.</>,
        fromBills ? <><Big>{money(fromBills)}</Big> came from bills posted in the OCR Bill Inbox; the rest was paid from branch cash in the Imprest Book.</> : <>Everything here was paid from branch cash (Imprest Book).</>,
        branches.length > 1 ? <><Big>{branches[0].b.name}</Big> spent the most ({money(branches[0].cost)}).</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total spent" value={money(spent)} note={`${lines.length} payment lines`} />
        <Tile label="Running costs" value={money(p.running)} note={p.sales.food ? `${per100(p.running, p.sales.food)} of every ₹100 sold` : undefined} />
        <Tile label="Staff" value={money(p.staff)} note={p.sales.food ? `${per100(p.staff, p.sales.food)} of every ₹100 sold` : undefined} />
        <Tile label="From posted bills" value={money(fromBills)} note="OCR Bill Inbox" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Where the money went" className="lg:col-span-3" pad={false}>
          <ul className="divide-y divide-slate-100">
            {all.map((l) => (
              <li key={l.k} className="px-4 py-2.5">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span>{l.k}</span>
                  <span className="shrink-0 tabular-nums"><b>{money(l.v, false)}</b>{p.sales.food ? <span className="ml-1 text-xs text-slate-500">{per100(l.v, p.sales.food)} of ₹100</span> : null}</span>
                </div>
                <ShareBar value={l.v} max={all[0].v} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title={R.branch ? 'Branch' : 'By branch'} className="lg:col-span-2" pad={false}>
          {R.branch ? <p className="px-4 py-3 text-sm">Showing {branchName(R.branch)} only.</p> : (
            <ul className="divide-y divide-slate-100">
              {branches.map(({ b, cost, sales }) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span><span className="block font-medium">{b.name}</span>
                    <span className="block text-xs text-slate-500">{sales ? `${per100(cost, sales)} of every ₹100 it sells` : 'No sales recorded'}</span></span>
                  <b className="tabular-nums">{money(cost)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Every payment" className="mt-4" pad={false}>
        <Table head={['Date', 'Branch', 'What for', 'From', 'Amount']}>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>{niceDate(l.date)}</td>
              <td className="font-medium text-slate-900">{branchName(l.branch)}</td>
              <td>{l.ledger}{l.type === 'salary' && <Badge tone="blue">staff</Badge>}</td>
              <td className="text-slate-500">{l.from}{l.vendor ? ` · ${l.vendor}` : ''}</td>
              <td className="tabular-nums">{inr(l.amount)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold"><td colSpan={4}>Total</td><td className="tabular-nums">{inr(spent)}</td></tr>
        </Table>
      </Card>
    </div>
  )
}
