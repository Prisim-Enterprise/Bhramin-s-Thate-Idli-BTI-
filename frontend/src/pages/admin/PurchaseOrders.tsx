import { useState } from 'react'
import { FileCheck2, Plus, Send, ShoppingCart } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, PageHeader, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { PURCHASE_ORDERS, STOCK, VENDORS, inr } from '../../data/mock'

type PO = (typeof PURCHASE_ORDERS)[number]

export default function PurchaseOrders() {
  const { can } = useApp()
  const [pos, setPos] = useState<PO[]>(PURCHASE_ORDERS)
  const [selId, setSelId] = useState(PURCHASE_ORDERS[0]?.id ?? '')
  const sel = pos.find((p) => p.id === selId)

  const patch = (p: Partial<PO>) => setPos((xs) => xs.map((x) => (x.id === selId ? { ...x, ...p } : x)))

  const newPO = () => {
    const id = 'PO-' + (1001 + pos.length)
    const first = STOCK[0]
    const po: PO = {
      id, indent: '—', vendor: VENDORS[0]?.name ?? '', date: new Date().toISOString().slice(0, 10), status: 'draft', basket: 0,
      lines: [first ? { item: first.item, qty: 1, unit: first.unit, rate: first.avgCost } : { item: '', qty: 1, unit: 'kg', rate: 0 }],
    }
    setPos((xs) => [po, ...xs])
    setSelId(id)
  }

  const header = (
    <PageHeader
      title="Purchase Orders"
      subtitle="Raised when storage can't fill an indent. Vendor item cost + basket expense → bill"
      actions={<Button icon={Plus} disabled={!can('purchase', 'create')} onClick={newPO}>New PO</Button>}
    />
  )

  // No purchase orders yet.
  if (!sel) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={ShoppingCart} title="No purchase orders yet"
            text="Orders to vendors appear here, either raised from a branch indent or with “New PO”." />
        </Card>
      </>
    )
  }

  const editable = sel.status === 'draft' && can('purchase', 'edit')
  const itemCost = sel.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const total = itemCost + sel.basket

  const next: Record<string, { label: string; to: string; icon: typeof Send } | undefined> = {
    draft: { label: 'Send to vendor', to: 'sent', icon: Send },
    sent: { label: 'Mark goods received', to: 'received', icon: FileCheck2 },
    received: { label: 'Convert to bill', to: 'billed', icon: FileCheck2 },
  }
  const action = next[sel.status]

  return (
    <>
      {header}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card pad={false}>
          <ul className="divide-y divide-slate-100">
            {pos.map((p) => (
              <li key={p.id}>
                <button onClick={() => setSelId(p.id)} className={`w-full px-4 py-3 text-left ${p.id === selId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{p.id}</span><Badge>{p.status}</Badge></div>
                  <p className="text-sm text-slate-600">{p.vendor}</p>
                  <p className="text-xs text-slate-400">{p.date} · from indent {p.indent}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={sel.id} actions={<Badge>{sel.status}</Badge>}>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label="Vendor">
              <input className={inputCls} list="po-vendors" value={sel.vendor} disabled={!editable} placeholder="Vendor name" onChange={(e) => patch({ vendor: e.target.value })} />
              <datalist id="po-vendors">{VENDORS.map((v) => <option key={v.id} value={v.name} />)}</datalist>
            </Field>
            <Field label="Payment terms"><input className={inputCls} disabled value={VENDORS.find((v) => v.name === sel.vendor)?.terms ?? ''} /></Field>
            <Field label="Linked indent"><input className={inputCls} disabled value={sel.indent} /></Field>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Item</th><th>Qty</th><th>Rate</th><th className="text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {sel.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2">
                    {editable
                      ? <input className={inputCls + ' !py-1'} placeholder="Item" value={l.item} onChange={(e) => patch({ lines: sel.lines.map((x, j) => j === i ? { ...x, item: e.target.value } : x) })} />
                      : l.item}
                  </td>
                  <td>
                    {editable
                      ? <input type="number" className={inputCls + ' !w-20 !py-1'} value={l.qty} onChange={(e) => patch({ lines: sel.lines.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x) })} />
                      : l.qty} {l.unit}
                  </td>
                  <td>
                    {editable
                      ? <input type="number" className={inputCls + ' !w-24 !py-1'} value={l.rate} onChange={(e) => patch({ lines: sel.lines.map((x, j) => j === i ? { ...x, rate: +e.target.value } : x) })} />
                      : inr(l.rate)}
                  </td>
                  <td className="text-right tabular-nums">{inr(l.qty * l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <button className="mt-2 text-xs font-medium text-brand-600" onClick={() => patch({ lines: [...sel.lines, { item: '', qty: 1, unit: 'kg', rate: 0 }] })}>+ Add item</button>
          )}

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
            <dl className="grid grid-cols-2 items-center gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Vendor item cost</dt><dd className="text-right tabular-nums">{inr(itemCost)}</dd>
              <dt className="text-slate-500">Basket expense <span className="text-xs">(transport, loading)</span></dt>
              <dd className="text-right">
                {editable
                  ? <input type="number" className={inputCls + ' !w-24 !py-1 text-right'} value={sel.basket} onChange={(e) => patch({ basket: +e.target.value })} />
                  : <span className="tabular-nums">{inr(sel.basket)}</span>}
              </dd>
              <dt className="font-semibold">PO total</dt><dd className="text-right font-semibold tabular-nums">{inr(total)}</dd>
            </dl>
            {action ? (
              <Button icon={action.icon} disabled={!can('purchase', sel.status === 'draft' ? 'create' : 'edit')} onClick={() => patch({ status: action.to })}>
                {action.label}
              </Button>
            ) : (
              <Badge tone="violet">Bill sent to Accounting</Badge>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
