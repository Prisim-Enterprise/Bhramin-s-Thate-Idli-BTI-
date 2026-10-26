import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Stat, Table, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { usePortalPath } from '../../components/Layout'
import { EMPLOYEES, ROLES, branchName, computePay, inr } from '../../data/mock'

export default function Salary() {
  const { deductions, can } = useApp()
  const path = usePortalPath()
  const [month, setMonth] = useState('2026-10')
  const [status, setStatus] = useState<'draft' | 'approved' | 'paid'>('draft')
  const staff = EMPLOYEES.filter((e) => e.basic > 0)
  const rows = staff.map((e) => ({ e, p: computePay(e, deductions) }))
  const sum = (k: keyof ReturnType<typeof computePay>) => rows.reduce((s, r) => s + r.p[k], 0)

  return (
    <>
      <PageHeader
        title="Salary"
        subtitle="Monthly payroll using the rules set under Deductions"
        actions={
          <>
            <input type="month" className={inputCls + ' !w-auto'} value={month} onChange={(e) => { setMonth(e.target.value); setStatus('draft') }} />
            {status === 'draft' && <Button icon={PlayCircle} disabled={!can('salary', 'approve')} onClick={() => setStatus('approved')}>Approve payroll</Button>}
            {status === 'approved' && <Button disabled={!can('salary', 'approve')} onClick={() => setStatus('paid')}>Mark as paid</Button>}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Employees" value={String(staff.length)} />
        <Stat label="Gross payroll" value={inr(sum('gross'))} />
        <Stat label="Total deductions" value={inr(sum('deductions'))} tone="amber" />
        <Stat label="Net payable" value={inr(sum('net'))} tone="green" hint={`Status: ${status}`} />
      </div>

      <Card title={<span className="flex items-center gap-2">Payroll register <Badge>{status}</Badge></span>}
        actions={<Link to={path('/control/deductions')} className="text-xs text-brand-600">Edit deduction rules →</Link>} pad={false}>
        <Table head={['Employee', 'Role', 'Branch', 'Basic', 'HRA', 'Allow.', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Meals', 'Advance', 'Net pay']}>
          {rows.map(({ e, p }) => (
            <tr key={e.id}>
              <td className="font-medium">{e.name}</td>
              <td className="text-slate-500">{ROLES.find((r) => r.id === e.role)?.name}</td>
              <td>{branchName(e.branch)}</td>
              <td className="tabular-nums">{inr(e.basic)}</td>
              <td className="tabular-nums">{inr(e.hra)}</td>
              <td className="tabular-nums">{inr(e.allow)}</td>
              <td className="font-medium tabular-nums">{inr(p.gross)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.pf)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.esi)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.pt)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.tds)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.meal)}</td>
              <td className="tabular-nums text-rose-600">{inr(p.advance)}</td>
              <td className="font-semibold tabular-nums text-emerald-700">{inr(p.net)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td colSpan={6}>Total</td>
            <td>{inr(sum('gross'))}</td><td>{inr(sum('pf'))}</td><td>{inr(sum('esi'))}</td><td>{inr(sum('pt'))}</td>
            <td>{inr(sum('tds'))}</td><td>{inr(sum('meal'))}</td><td>{inr(sum('advance'))}</td><td>{inr(sum('net'))}</td>
          </tr>
        </Table>
      </Card>
    </>
  )
}
