import { useState } from 'react'
import { Armchair, Bike, ChefHat, Package, PackageCheck, RefreshCw, Truck, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { BRANCHES } from '../../../data/mock'
import { NeedsConnection, OpsHeader, selCls, tabCls } from './shared'

// Orders running right now at the outlets. These come from the POS, so they stay at zero until it is connected.
type Row = { icon: LucideIcon; label: string; orders: number; amount: number }

function Panel({ title, rows }: { title: string; rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.orders, 0)
  const amount = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <p className="flex items-center gap-2 px-5 pb-2 pt-5 text-lg font-semibold text-slate-900"><span className="h-2.5 w-2.5 rounded-full bg-[#7a2228]" />{title}</p>
      <div className="grid grid-cols-2 gap-3 px-5 pb-4">
        <div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-sm text-slate-500">Total orders</p><p className="mt-1 text-2xl font-semibold tabular-nums">{total}</p></div>
        <div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-sm text-slate-500">Total amount</p><p className="mt-1 text-2xl font-semibold tabular-nums">₹{amount.toFixed(2)}</p></div>
      </div>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 px-5 py-3.5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><r.icon size={18} /></span>
            <span className="flex-1"><span className="block font-medium">{r.label}</span><span className="text-xs text-slate-500">{r.orders} orders</span></span>
            <span className="font-semibold tabular-nums">₹{r.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function LiveOrders() {
  const [tab, setTab] = useState<'orders' | 'tables'>('orders')
  const [outlet, setOutlet] = useState('')
  const [at, setAt] = useState(new Date())
  const outlets = BRANCHES.filter((b) => b.id !== 'CK' && (!outlet || b.id === outlet))

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Live Orders" after={
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button className={tabCls(tab === 'orders')} onClick={() => setTab('orders')}>Running Orders</button>
          <button className={tabCls(tab === 'tables')} onClick={() => setTab('tables')}>Running Tables</button>
        </div>
      }>
        <select aria-label="Outlet" className={selCls} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
          <option value="">All Outlets</option>
          {BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button className={selCls + ' inline-flex items-center gap-1.5 font-medium hover:bg-slate-50'} onClick={() => setAt(new Date())}><RefreshCw size={15} /> Refresh</button>
      </OpsHeader>
      <NeedsConnection what="Live orders come straight from the billing counter (POS). They show here once the POS is connected for each outlet." />
      <p className="mb-3 text-xs text-slate-500">Checked at {at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>

      {tab === 'orders' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Running Orders" rows={[
            { icon: UtensilsCrossed, label: 'Dine in', orders: 0, amount: 0 },
            { icon: Package, label: 'Pick up', orders: 0, amount: 0 },
            { icon: Truck, label: 'Delivery', orders: 0, amount: 0 },
          ]} />
          <Panel title="Pending Orders" rows={[
            { icon: ChefHat, label: 'In Preparation', orders: 0, amount: 0 },
            { icon: PackageCheck, label: 'Waiting For Pickup', orders: 0, amount: 0 },
            { icon: Bike, label: 'Out For Delivery', orders: 0, amount: 0 },
          ]} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {outlets.map((b) => (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-slate-900">{b.name}</p>
              <div className="mt-4 flex items-center gap-3 text-sm text-slate-500"><Armchair size={20} className="text-slate-300" /> No tables running</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
