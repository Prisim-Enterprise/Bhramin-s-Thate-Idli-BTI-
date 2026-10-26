import { useState } from 'react'
import { Search } from 'lucide-react'
import { Badge, Card, PageHeader, Stat, Table, inputCls } from '../../components/ui'
import { STOCK, inr } from '../../data/mock'

export default function Storage() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const cats = ['All', ...new Set(STOCK.map((s) => s.category))]
  const rows = STOCK.filter((s) => (cat === 'All' || s.category === cat) && s.item.toLowerCase().includes(q.toLowerCase()))
  const value = STOCK.reduce((s, x) => s + x.qty * x.avgCost, 0)

  const status = (s: (typeof STOCK)[number]) => (s.qty === 0 ? 'out' : s.qty <= s.reorder ? 'low' : 'ok')

  return (
    <>
      <PageHeader title="Storage / Stock" subtitle="Central kitchen inventory" />
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Stock value" value={inr(value)} />
        <Stat label="Items tracked" value={String(STOCK.length)} />
        <Stat label="Low stock" value={String(STOCK.filter((s) => status(s) === 'low').length)} tone="amber" />
        <Stat label="Out of stock" value={String(STOCK.filter((s) => status(s) === 'out').length)} tone="red" />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + ' pl-9'} placeholder="Search item…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={inputCls + ' !w-auto'} value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Table head={['Item', 'Category', 'In stock', 'Reorder level', 'Avg cost', 'Value', 'Status']}>
          {rows.map((s) => {
            const st = status(s)
            return (
              <tr key={s.item}>
                <td className="font-medium">{s.item}</td>
                <td>{s.category}</td>
                <td className="tabular-nums">{s.qty} {s.unit}</td>
                <td className="tabular-nums">{s.reorder} {s.unit}</td>
                <td className="tabular-nums">{inr(s.avgCost)}/{s.unit}</td>
                <td className="tabular-nums">{inr(s.qty * s.avgCost)}</td>
                <td><Badge tone={st === 'ok' ? 'green' : st === 'low' ? 'amber' : 'red'}>{st === 'ok' ? 'In stock' : st === 'low' ? 'Low' : 'Out'}</Badge></td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
