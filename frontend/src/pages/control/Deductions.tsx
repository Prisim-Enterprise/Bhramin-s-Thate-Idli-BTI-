import { RotateCcw } from 'lucide-react'
import { Button, Card, PageHeader, Table, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { ADVANCES, DEFAULT_DEDUCTIONS, EMPLOYEES, inr, type DeductionRules } from '../../data/mock'

const FIELDS: { key: keyof DeductionRules; label: string; hint: string; unit: string }[] = [
  { key: 'pfPct', label: 'Provident Fund (employee)', hint: 'Percent of basic salary', unit: '%' },
  { key: 'pfCap', label: 'PF wage ceiling', hint: 'PF is calculated on basic up to this amount', unit: '₹' },
  { key: 'esiPct', label: 'ESI (employee)', hint: 'Percent of gross salary', unit: '%' },
  { key: 'esiLimit', label: 'ESI applies up to gross of', hint: 'Staff earning more are exempt', unit: '₹' },
  { key: 'ptAmount', label: 'Professional Tax', hint: 'Per month, when gross > ₹15,000', unit: '₹' },
  { key: 'tdsPct', label: 'TDS estimate', hint: 'Flat percent of gross; 0 to skip', unit: '%' },
  { key: 'mealPerDay', label: 'Staff meal recovery', hint: 'Per working day; 0 if meals are free', unit: '₹' },
]

export default function Deductions() {
  const { deductions, setDeductions, can } = useApp()
  const edit = can('deductions', 'edit')

  return (
    <>
      <PageHeader
        title="Deductions"
        subtitle="Statutory and other deductions applied when salary is processed"
        actions={edit && <Button variant="secondary" icon={RotateCcw} onClick={() => setDeductions(DEFAULT_DEDUCTIONS)}>Reset to defaults</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Deduction rules">
          <div className="divide-y divide-slate-100">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-slate-500">{f.hint}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {f.unit === '₹' && <span className="text-sm text-slate-400">₹</span>}
                  <input type="number" step="0.01" className={inputCls + ' !w-28 text-right'} disabled={!edit}
                    value={deductions[f.key]} onChange={(e) => setDeductions({ ...deductions, [f.key]: +e.target.value })} />
                  {f.unit === '%' && <span className="text-sm text-slate-400">%</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Salary advances to recover this month" pad={false}>
          <Table head={['Employee', 'Advance', 'Recover this month']}>
            {Object.entries(ADVANCES).map(([id, amt]) => {
              const e = EMPLOYEES.find((x) => x.id === id)!
              return <tr key={id}><td>{e.name}</td><td>{inr(amt)}</td><td>{inr(amt)}</td></tr>
            })}
          </Table>
          <p className="p-4 text-xs text-slate-500">Changes here are used immediately on the Salary page.</p>
        </Card>
      </div>
    </>
  )
}
