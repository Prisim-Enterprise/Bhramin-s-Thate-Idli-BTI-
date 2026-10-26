import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Table, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { EXPENSES, branchName, inr } from '../../data/mock'

export default function Expenses() {
  const { can } = useApp()
  const [items, setItems] = useState(EXPENSES)
  const [cats, setCats] = useState([
    { name: 'Utilities', budget: 120000, limit: 50000 },
    { name: 'Repairs', budget: 40000, limit: 10000 },
    { name: 'Fuel', budget: 60000, limit: 15000 },
    { name: 'Housekeeping', budget: 25000, limit: 5000 },
    { name: 'Marketing', budget: 50000, limit: 10000 },
  ])
  const spent = (cat: string) => items.filter((e) => e.category === cat && e.status === 'approved').reduce((s, e) => s + e.amount, 0)
  const setStatus = (id: string, status: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)))

  return (
    <>
      <PageHeader title="Expenses" subtitle="Categories, monthly budgets and who can approve what" />

      <Card title="Expense categories" pad={false} className="mb-4">
        <Table head={['Category', 'Monthly budget', 'Spent', 'Used', 'Manager can approve up to']}>
          {cats.map((c, i) => {
            const used = (spent(c.name) / c.budget) * 100
            return (
              <tr key={c.name}>
                <td className="font-medium">{c.name}</td>
                <td><input type="number" className={inputCls + ' !w-28 !py-1'} disabled={!can('expenses', 'edit')} value={c.budget} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, budget: +e.target.value } : x))} /></td>
                <td className="tabular-nums">{inr(spent(c.name))}</td>
                <td>
                  <div className="h-1.5 w-24 rounded bg-slate-100"><div className={`h-1.5 rounded ${used > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: Math.min(used, 100) + '%' }} /></div>
                </td>
                <td><input type="number" className={inputCls + ' !w-28 !py-1'} disabled={!can('expenses', 'edit')} value={c.limit} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, limit: +e.target.value } : x))} /></td>
              </tr>
            )
          })}
        </Table>
      </Card>

      <Card title="Recent expenses" pad={false}>
        <Table head={['ID', 'Date', 'Branch', 'Category', 'Description', 'Amount', 'Status', '']}>
          {items.map((e) => {
            const limit = cats.find((c) => c.name === e.category)?.limit ?? 0
            return (
              <tr key={e.id}>
                <td className="font-medium">{e.id}</td>
                <td>{e.date}</td>
                <td>{branchName(e.branch)}</td>
                <td>{e.category}</td>
                <td className="text-slate-600">{e.desc}</td>
                <td className="tabular-nums">{inr(e.amount)}{e.amount > limit && <span className="ml-1 text-xs text-amber-600" title="Above manager limit – needs admin">▲</span>}</td>
                <td><Badge>{e.status}</Badge></td>
                <td>
                  {e.status === 'pending' && can('expenses', 'approve') && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" icon={Check} onClick={() => setStatus(e.id, 'approved')}>Approve</Button>
                      <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus(e.id, 'rejected')} aria-label="Reject" />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
