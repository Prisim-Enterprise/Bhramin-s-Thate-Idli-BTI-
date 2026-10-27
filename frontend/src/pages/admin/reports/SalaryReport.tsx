import { useState } from 'react'
import { CheckCircle2, PlayCircle, Wallet } from 'lucide-react'
import { Badge, Button, Card } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, Summary, Tile, downloadCsv, money } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { BRANCH_COSTS, EMPLOYEES, ROLES, branchName, computePay } from '../../../data/mock'

const STAGE = {
  draft: ['Not approved yet', 'amber'],
  approved: ['Approved, not paid', 'blue'],
  paid: ['Paid', 'green'],
} as const

export default function SalaryReport() {
  const { deductions, can } = useApp()
  const [stage, setStage] = useState<keyof typeof STAGE>('draft')
  const staff = EMPLOYEES.filter((e) => e.basic > 0).map((e) => ({ e, p: computePay(e, deductions) }))
  const gross = staff.reduce((s, x) => s + x.p.gross, 0)
  const cut = staff.reduce((s, x) => s + x.p.deductions, 0)
  const net = gross - cut
  const top = [...staff].sort((a, b) => b.p.gross - a.p.gross)[0]
  const crewWages = Object.values(BRANCH_COSTS).reduce((s, c) => s + c.salaries, 0)

  // Group payroll by where people work.
  const byPlace = Object.entries(staff.reduce<Record<string, number>>((m, x) => ({ ...m, [x.e.branch]: (m[x.e.branch] ?? 0) + x.p.gross }), {}))
    .sort((a, b) => b[1] - a[1])

  const csv = () => downloadCsv('BTI-Salary-Report-Oct-2026.csv', [
    ['Name', 'Job', 'Works at', 'Salary', 'Cut', 'Take-home'],
    ...staff.map(({ e, p }) => [e.name, ROLES.find((r) => r.id === e.role)!.name, branchName(e.branch), p.gross, p.deductions, p.net]),
    ['Total', '', '', gross, cut, net],
  ])

  const [stageLabel, stageTone] = STAGE[stage]

  if (!staff.length) {
    return <EmptyReport title="Salary Report" period="October 2026" icon={Wallet}
      text="Salaries show up here once staff and their monthly pay are added." />
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader
        title="Salary Report"
        period="October 2026 · staff on monthly payroll"
        onCsv={csv}
        actions={can('salary', 'approve') && (
          stage === 'draft' ? <Button icon={PlayCircle} onClick={() => setStage('approved')}>Approve salaries</Button>
            : stage === 'approved' ? <Button icon={CheckCircle2} onClick={() => setStage('paid')}>Mark as paid</Button>
              : null
        )}
      />

      <Summary points={[
        <>This month's salary for <Big>{staff.length} staff</Big> on payroll is <Big>{money(gross)}</Big>.</>,
        <>After deductions (PF, ESI, tax and advances), staff will get <Big>{money(net)}</Big> in their bank accounts.</>,
        <><Big>{money(cut, false)}</Big> is cut from salaries. See the Deductions Report for what each cut means.</>,
        <>Status: <Big>{stageLabel.toLowerCase()}</Big>.</>,
        <>Kitchen and service crew at the outlets are paid separately through outlet wages: <Big>{money(crewWages)}</Big> this month (shown in the Expenses Report).</>,
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Staff on payroll" value={String(staff.length)} />
        <Tile label="Total salary" value={money(gross)} note="Before deductions" />
        <Tile label="Cut from salaries" value={money(cut, false)} tone="amber" />
        <Tile label="Staff take home" value={money(net)} tone="green" note={<Badge tone={stageTone}>{stageLabel}</Badge>} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Each person's salary" className="lg:col-span-2" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-3 text-left font-medium">Works at</th>
                  <th className="px-3 text-right font-medium">Salary</th>
                  <th className="px-3 text-right font-medium">Cut</th>
                  <th className="px-4 text-right font-medium">Take-home</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map(({ e, p }) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5"><span className="block font-medium">{e.name}</span><span className="text-xs text-slate-500">{ROLES.find((r) => r.id === e.role)?.name}</span></td>
                    <td className="px-3 text-slate-600">{branchName(e.branch)}</td>
                    <td className="px-3 text-right tabular-nums">{money(p.gross, false)}</td>
                    <td className="px-3 text-right tabular-nums text-rose-600">−{money(p.deductions, false)}</td>
                    <td className="px-4 text-right font-semibold tabular-nums text-emerald-700">{money(p.net, false)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2.5" colSpan={2}>Total</td>
                  <td className="px-3 text-right tabular-nums">{money(gross, false)}</td>
                  <td className="px-3 text-right tabular-nums text-rose-600">−{money(cut, false)}</td>
                  <td className="px-4 text-right tabular-nums text-emerald-700">{money(net, false)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Salary by location" pad={false}>
            <ul className="divide-y divide-slate-100">
              {byPlace.map(([place, v]) => (
                <li key={place} className="flex justify-between px-4 py-2.5 text-sm">
                  <span>{branchName(place)}</span><b className="tabular-nums">{money(v, false)}</b>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Highest salary">
            <p className="text-sm"><b>{top.e.name}</b> ({ROLES.find((r) => r.id === top.e.role)?.name}, {branchName(top.e.branch)})</p>
            <p className="mt-1 text-sm text-slate-600">{money(top.p.gross, false)} salary · {money(top.p.net, false)} take-home</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
