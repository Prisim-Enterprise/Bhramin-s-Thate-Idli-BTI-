import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, Field, PageHeader, Table, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { PURCHASE_ORDERS, VENDORS, inr } from '../../data/mock'

export default function Purchases() {
  const { can } = useApp()
  const edit = can('purchase', 'edit')
  const [vendors, setVendors] = useState(VENDORS)
  const [rules, setRules] = useState({ managerLimit: 10000, accountantLimit: 50000, basketPct: 3, requireIndent: true })
  const [adding, setAdding] = useState(false)
  const [nv, setNv] = useState({ name: '', category: 'Vegetables', terms: '7 days credit', gstin: '' })

  const poTotal = (p: (typeof PURCHASE_ORDERS)[number]) => p.lines.reduce((s, l) => s + l.qty * l.rate, 0) + p.basket

  return (
    <>
      <PageHeader title="Purchases & Vendors" subtitle="Vendor list, approval limits and basket expense rules" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Approval rules">
          <div className="space-y-3">
            <Field label="Branch manager can approve PO up to (₹)"><input type="number" className={inputCls} disabled={!edit} value={rules.managerLimit} onChange={(e) => setRules({ ...rules, managerLimit: +e.target.value })} /></Field>
            <Field label="Accountant can approve PO up to (₹)"><input type="number" className={inputCls} disabled={!edit} value={rules.accountantLimit} onChange={(e) => setRules({ ...rules, accountantLimit: +e.target.value })} /></Field>
            <Field label="Default basket expense (% of item cost)"><input type="number" className={inputCls} disabled={!edit} value={rules.basketPct} onChange={(e) => setRules({ ...rules, basketPct: +e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-600" disabled={!edit} checked={rules.requireIndent} onChange={() => setRules({ ...rules, requireIndent: !rules.requireIndent })} />
              PO must be linked to an indent
            </label>
            <p className="text-xs text-slate-500">Anything above the accountant limit needs Admin approval.</p>
          </div>
        </Card>

        <Card title="Vendors" className="xl:col-span-2" pad={false}
          actions={can('purchase', 'create') && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add vendor</Button>}>
          {adding && (
            <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-5">
              <input className={inputCls} placeholder="Vendor name" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} />
              <select className={inputCls} value={nv.category} onChange={(e) => setNv({ ...nv, category: e.target.value })}>
                {['Vegetables', 'Dairy', 'Meat', 'Grocery', 'Spices', 'Packaging'].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className={inputCls} placeholder="Terms" value={nv.terms} onChange={(e) => setNv({ ...nv, terms: e.target.value })} />
              <input className={inputCls} placeholder="GSTIN" value={nv.gstin} onChange={(e) => setNv({ ...nv, gstin: e.target.value })} />
              <div className="flex gap-1">
                <Button onClick={() => { if (nv.name) { setVendors([...vendors, { id: 'V' + (vendors.length + 1), ...nv }]); setNv({ ...nv, name: '', gstin: '' }); setAdding(false) } }}>Save</Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          )}
          <Table head={['Vendor', 'Category', 'Payment terms', 'GSTIN']}>
            {vendors.map((v) => (
              <tr key={v.id}><td className="font-medium">{v.name}</td><td>{v.category}</td><td>{v.terms}</td><td className="font-mono text-xs">{v.gstin || '—'}</td></tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="Purchase orders" className="mt-4" pad={false}>
        <Table head={['PO', 'Vendor', 'Date', 'Item cost', 'Basket exp.', 'Total', 'Needs', 'Status']}>
          {PURCHASE_ORDERS.map((p) => {
            const t = poTotal(p)
            const needs = t <= rules.managerLimit ? 'Manager' : t <= rules.accountantLimit ? 'Accountant' : 'Admin'
            return (
              <tr key={p.id}>
                <td className="font-medium">{p.id}</td><td>{p.vendor}</td><td>{p.date}</td>
                <td className="tabular-nums">{inr(t - p.basket)}</td><td className="tabular-nums">{inr(p.basket)}</td>
                <td className="font-medium tabular-nums">{inr(t)}</td><td className="text-xs text-slate-500">{needs} approval</td><td><Badge>{p.status}</Badge></td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
