import { MinusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui'
import { Big, EmptyReport, Explain, ReportHeader, Summary, Tile, downloadCsv, money } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { EMPLOYEES, computePay } from '../../../data/mock'

export default function DeductionsReport() {
  const { deductions: r, can } = useApp()
  const staff = EMPLOYEES.filter((e) => e.basic > 0).map((e) => ({ e, p: computePay(e, r) }))
  const t = (k: 'pf' | 'esi' | 'pt' | 'tds' | 'meal' | 'advance') => staff.reduce((s, x) => s + x.p[k], 0)
  const total = staff.reduce((s, x) => s + x.p.deductions, 0)
  const esiCount = staff.filter((x) => x.p.esi > 0).length
  const advCount = staff.filter((x) => x.p.advance > 0).length

  const types = [
    { key: 'pf' as const, title: 'PF (Provident Fund)', text: `Retirement savings. ${r.pfPct}% of basic pay (on basic up to ${money(r.pfCap, false)}) is set aside for each employee. The money stays theirs.` },
    { key: 'esi' as const, title: 'ESI (health insurance)', text: `Government medical cover for staff earning up to ${money(r.esiLimit, false)} a month. ${r.esiPct}% of their salary. ${esiCount} staff are covered.` },
    { key: 'pt' as const, title: 'Professional Tax', text: `A small state tax of ${money(r.ptAmount, false)} a month, charged on staff earning above ₹15,000.` },
    { key: 'tds' as const, title: 'TDS (income tax)', text: r.tdsPct ? `Income tax cut at ${r.tdsPct}% of salary and paid to the government.` : 'Income tax cut from salary. Currently set to zero.' },
    { key: 'advance' as const, title: 'Advance recovery', text: `Money given to staff earlier as an advance, now being taken back. ${advCount} staff have an advance.` },
    { key: 'meal' as const, title: 'Staff meals', text: r.mealPerDay ? `${money(r.mealPerDay, false)} per working day for staff meals.` : 'Staff meals are free, so nothing is cut.' },
  ].sort((a, b) => t(b.key) - t(a.key))

  const csv = () => downloadCsv('BTI-Deductions-Report-Oct-2026.csv', [
    ['Name', 'PF', 'ESI', 'Professional Tax', 'TDS', 'Advance', 'Meals', 'Total cut'],
    ...staff.map(({ e, p }) => [e.name, p.pf, p.esi, p.pt, p.tds, p.advance, p.meal, p.deductions]),
  ])

  if (!staff.length) {
    return <EmptyReport title="Deductions Report" period="October 2026" icon={MinusCircle}
      text="PF, ESI, professional tax and other salary deductions show up here once staff and their pay are added." />
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Deductions Report" period="October 2026 · money cut from salaries, and why" onCsv={csv} />

      <Summary points={[
        <><Big>{money(total, false)}</Big> was cut from the salaries of {staff.length} staff this month.</>,
        <>Most of it is <Big>PF ({money(t('pf'), false)})</Big>. This is not lost; it is saved for the employee's retirement.</>,
        <><Big>{esiCount} staff</Big> get government health insurance (ESI), costing them {money(t('esi'), false)} in total.</>,
        <><Big>{money(t('advance'), false)}</Big> of earlier salary advances is being recovered this month.</>,
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total cut" value={money(total, false)} />
        <Tile label="PF (savings)" value={money(t('pf'), false)} />
        <Tile label="ESI + Prof. Tax" value={money(t('esi') + t('pt'), false)} />
        <Tile label="Advances recovered" value={money(t('advance'), false)} />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-800">What each deduction means</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {types.map((x) => <Explain key={x.key} title={x.title} amount={money(t(x.key), false)}>{x.text}</Explain>)}
      </div>

      <Card title="Deductions per person" className="mt-4" pad={false}
        actions={can('deductions', 'edit') && <Link to="/admin/deductions" className="text-xs font-medium text-[#7a2228]">Change the rules →</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {['Name', 'PF', 'ESI', 'Prof. Tax', 'TDS', 'Advance', 'Meals', 'Total cut'].map((h, i) => (
                  <th key={h} className={`py-2 font-medium ${i === 0 ? 'px-4 text-left' : 'px-3 text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map(({ e, p }) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  {[p.pf, p.esi, p.pt, p.tds, p.advance, p.meal].map((v, i) => (
                    <td key={i} className={`px-3 text-right tabular-nums ${v ? '' : 'text-slate-300'}`}>{v ? money(v, false) : '–'}</td>
                  ))}
                  <td className="px-3 text-right font-semibold tabular-nums">{money(p.deductions, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
