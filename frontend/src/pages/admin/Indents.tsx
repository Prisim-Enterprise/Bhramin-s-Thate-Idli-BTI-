import { useState } from 'react'
import { ArrowRight, CheckCircle2, ClipboardList, PackageCheck, ShoppingCart, XCircle } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { INDENTS, STOCK, branchName, type IndentStatus } from '../../data/mock'

const FLOW = ['Indent from branch', 'Storage check', 'Issue  /  Purchase order', 'Vendor cost + basket exp.', 'Bill']

export default function Indents() {
  const { can } = useApp()
  const [indents, setIndents] = useState(INDENTS)
  const [selId, setSelId] = useState(INDENTS[0]?.id ?? '')
  const [tab, setTab] = useState<'open' | 'all'>('open')
  const sel = indents.find((i) => i.id === selId)
  const list = indents.filter((i) => tab === 'all' || i.status === 'pending' || i.status === 'partial')

  // No indents yet.
  if (!sel) {
    return (
      <>
        <PageHeader title="Branch Indents" subtitle="Requests sent by each branch to the central kitchen" />
        <Card>
          <EmptyState icon={ClipboardList} title="No indents yet"
            text="When an outlet asks the central kitchen for items, the request shows up here. You can then send the items from storage or raise a purchase order." />
        </Card>
      </>
    )
  }

  const check = sel.items.map((it) => {
    const s = STOCK.find((x) => x.item === it.item)
    const avail = s?.qty ?? 0
    return { ...it, avail, inStock: avail >= it.qty, short: Math.max(0, it.qty - avail) }
  })
  const allInStock = check.every((c) => c.inStock)
  const noneInStock = check.every((c) => c.avail === 0)

  const setStatus = (status: IndentStatus) => setIndents((xs) => xs.map((x) => (x.id === selId ? { ...x, status } : x)))
  const open = sel.status === 'pending' || sel.status === 'partial'

  return (
    <>
      <PageHeader title="Branch Indents" subtitle="Requests sent by each branch to the central kitchen" />

      <Card className="mb-4">
        <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
          {FLOW.map((f, i) => (
            <li key={f} className="flex items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2.5 py-1">{f}</span>
              {i < FLOW.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
            </li>
          ))}
        </ol>
      </Card>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'open', label: 'Open', count: indents.filter((i) => i.status === 'pending' || i.status === 'partial').length },
        { id: 'all', label: 'All', count: indents.length },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card pad={false}>
          <ul className="divide-y divide-slate-100">
            {list.map((i) => (
              <li key={i.id}>
                <button onClick={() => setSelId(i.id)} className={`w-full px-4 py-3 text-left ${i.id === selId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{i.id}</span>
                    <Badge>{i.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{branchName(i.branch)}</p>
                  <p className="text-xs text-slate-400">{i.requestedBy} · {i.date} · {i.items.length} items</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`${sel.id} · ${branchName(sel.branch)}`} actions={<Badge>{sel.status}</Badge>}>
          <p className="mb-3 text-sm text-slate-500">Storage check against central kitchen stock:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">Item</th><th>Requested</th><th>In storage</th><th>Available?</th><th>Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {check.map((c) => (
                  <tr key={c.item}>
                    <td className="py-2.5 font-medium">{c.item}</td>
                    <td>{c.qty} {c.unit}</td>
                    <td>{c.avail} {c.unit}</td>
                    <td>
                      {c.inStock
                        ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={15} /> Yes</span>
                        : <span className="flex items-center gap-1 text-rose-600"><XCircle size={15} /> No{c.avail > 0 && ` (short ${c.short})`}</span>}
                    </td>
                    <td className="text-xs text-slate-500">{c.inStock ? 'Issue from storage' : c.avail > 0 ? 'Issue part + PO for rest' : 'Raise purchase order'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {open ? (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button icon={PackageCheck} disabled={!can('indent', 'approve') || noneInStock} onClick={() => setStatus(allInStock ? 'issued' : 'partial')}>
                {allInStock ? 'Issue all items' : 'Issue available items'}
              </Button>
              {!allInStock && (
                <Button variant="secondary" icon={ShoppingCart} disabled={!can('purchase', 'create')} onClick={() => setStatus('po_raised')}>
                  Raise PO for shortfall
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">
              {sel.status === 'issued' ? 'All items issued to the branch.' : 'Purchase order raised — track it under Purchase Orders.'}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
