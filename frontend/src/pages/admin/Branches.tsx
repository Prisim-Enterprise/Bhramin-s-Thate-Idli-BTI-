import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ChefHat, MapPin, User } from 'lucide-react'
import { Badge, Card, PageHeader, Stat, Table } from '../../components/ui'
import { BRANCHES, EXPENSES, INDENTS, SALES_TREND, STOCK, branchName, inr } from '../../data/mock'

export default function Branches() {
  const list = BRANCHES
  const [sel, setSel] = useState('B1')
  const b = BRANCHES.find((x) => x.id === sel)!
  const isCK = sel === 'CK'

  return (
    <>
      <PageHeader title="Branch Dashboards" subtitle="Pick the central kitchen or an outlet to see how it's doing" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {list.map((x) => (
          <button
            key={x.id}
            onClick={() => setSel(x.id)}
            className={`rounded-xl border p-3 text-left transition ${sel === x.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{x.id === 'CK' ? 'Central kitchen' : 'Outlet'}</span>
              <span className={`h-2 w-2 rounded-full ${x.status === 'online' ? 'bg-emerald-500' : x.status === 'offline' ? 'bg-rose-500' : 'bg-slate-300'}`} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">{x.id === 'CK' && <ChefHat size={14} />}{x.name}</p>
            <p className="text-xs text-slate-500">{x.id === 'CK' ? 'Supplies all outlets' : inr(x.sales) + ' MTD'}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1"><MapPin size={14} /> {b.city}</span>
        <span className="flex items-center gap-1"><User size={14} /> {b.manager}</span>
        <Badge>{b.status}</Badge>
        <Badge tone={b.ocr ? 'green' : 'slate'}>{b.ocr ? 'OCR on' : 'OCR off'}</Badge>
      </div>

      {isCK ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Indents received today" pad={false}>
            <Table head={['Indent', 'From', 'Items', 'Status']}>
              {INDENTS.map((i) => (
                <tr key={i.id}><td className="font-medium">{i.id}</td><td>{branchName(i.branch)}</td><td>{i.items.length}</td><td><Badge>{i.status}</Badge></td></tr>
              ))}
            </Table>
          </Card>
          <Card title="Storage value by category" pad={false}>
            <Table head={['Category', 'Items', 'Value']}>
              {Object.entries(
                STOCK.reduce<Record<string, { n: number; v: number }>>((acc, s) => {
                  acc[s.category] ??= { n: 0, v: 0 }
                  acc[s.category].n++
                  acc[s.category].v += s.qty * s.avgCost
                  return acc
                }, {}),
              ).map(([c, x]) => (
                <tr key={c}><td>{c}</td><td>{x.n}</td><td className="tabular-nums">{inr(x.v)}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Sales MTD" value={inr(b.sales)} />
            <Stat label="Food cost" value={b.sales ? b.foodCost + '%' : '—'} tone={!b.sales ? 'brand' : b.foodCost > 32 ? 'red' : 'green'} />
            <Stat label="Open indents" value={String(INDENTS.filter((i) => i.branch === sel && i.status !== 'issued').length)} tone="amber" />
            <Stat label="Expenses" value={inr(EXPENSES.filter((e) => e.branch === sel).reduce((s, e) => s + e.amount, 0))} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Daily sales – this week">
              <div className="h-60">
                <ResponsiveContainer>
                  <BarChart data={SALES_TREND}>
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Bar dataKey={sel} fill="#2f6fed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Branch expenses" pad={false}>
              <Table head={['Date', 'Category', 'Amount', 'Status']}>
                {EXPENSES.filter((e) => e.branch === sel).map((e) => (
                  <tr key={e.id}><td>{e.date}</td><td>{e.category}</td><td>{inr(e.amount)}</td><td><Badge>{e.status}</Badge></td></tr>
                ))}
              </Table>
              {!EXPENSES.some((e) => e.branch === sel) && <p className="p-4 text-sm text-slate-500">No expenses logged this week.</p>}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
