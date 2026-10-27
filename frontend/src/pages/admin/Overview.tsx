import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, IndianRupee, PackageX, Percent,
  Receipt, ScanLine, ShoppingCart, TrendingUp, Warehouse, type LucideIcon,
} from 'lucide-react'
import { Badge, Card } from '../../components/ui'
import Logo, { RESTO_NAME } from '../../components/Logo'
import { useApp } from '../../context/AppContext'
import { BILLS, BRANCHES, EXPENSES, INDENTS, PURCHASE_ORDERS, RECIPES, SALES_TREND, STOCK, branchName, inr } from '../../data/mock'

const FOOD_COST_TARGET = 32

// Plain-language labels for statuses, so staff don't need to learn system terms.
const BILL_LABEL: Record<string, [string, 'green' | 'amber' | 'red' | 'blue' | 'slate']> = {
  extracted: ['Ready to review', 'amber'],
  processing: ['Reading bill…', 'blue'],
  queued: ['Waiting', 'slate'],
  failed: ["Couldn't read", 'red'],
  verified: ['Done', 'green'],
}
const INDENT_LABEL: Record<string, [string, 'green' | 'amber' | 'red' | 'blue' | 'violet']> = {
  pending: ['Needs action', 'amber'],
  partial: ['Partly sent', 'blue'],
  po_raised: ['Ordered from vendor', 'violet'],
  issued: ['Sent to branch', 'green'],
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Kpi({ to, icon: Icon, label, value, note, tone = 'slate' }: {
  to: string; icon: LucideIcon; label: string; value: string; note: React.ReactNode; tone?: 'slate' | 'green' | 'red'
}) {
  const noteCls = { slate: 'text-slate-500', green: 'text-emerald-600', red: 'text-rose-600' }[tone]
  return (
    <Link to={to} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#d9a441] hover:shadow">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="rounded-lg bg-[#fbf3e4] p-1.5 text-[#7a2228]"><Icon size={16} /></span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      <div className={`mt-1 text-xs ${noteCls}`}>{note}</div>
    </Link>
  )
}

export default function Overview() {
  const { can } = useApp()
  const outlets = BRANCHES.filter((b) => b.id !== 'CK')
  const totalSales = outlets.reduce((s, b) => s + b.sales, 0)
  const revenue = RECIPES.reduce((s, r) => s + r.price * r.sold, 0)
  const cost = RECIPES.reduce((s, r) => s + r.cost * r.sold, 0)
  const foodCostPct = revenue ? (cost / revenue) * 100 : 0
  const stockValue = STOCK.reduce((s, x) => s + x.qty * x.avgCost, 0)

  const billsToReview = BILLS.filter((b) => b.status === 'extracted' || b.status === 'failed')
  const pendingIndents = INDENTS.filter((i) => i.status === 'pending')
  const outOfStock = STOCK.filter((s) => s.qty === 0)
  const lowStock = STOCK.filter((s) => s.qty > 0 && s.qty <= s.reorder)
  const posInTransit = PURCHASE_ORDERS.filter((p) => p.status === 'sent')
  const pendingExp = EXPENSES.filter((e) => e.status === 'pending')

  const weekly = SALES_TREND.map((d) => ({
    day: d.day,
    total: outlets.reduce((s, o) => s + (Number((d as Record<string, number | string>)[o.id]) || 0), 0),
  }))
  const weekTotal = weekly.reduce((s, d) => s + d.total, 0)
  const bestDay = weekly.reduce((a, b) => (b.total > a.total ? b : a))
  const ranked = [...outlets].sort((a, b) => b.sales - a.sales)

  // To-do list: only things someone must act on, and only what this role can open.
  const todos = [
    { show: can('ocr') && billsToReview.length > 0, icon: ScanLine, to: '/admin/accounting/bills', tone: 'amber',
      title: `${billsToReview.length} bills to check`, text: 'OCR has read these bills. Confirm the amounts to post them.', cta: 'Review bills' },
    { show: can('indent') && pendingIndents.length > 0, icon: ClipboardList, to: '/admin/kitchen/indents', tone: 'amber',
      title: `${pendingIndents.length} indents waiting`, text: `From ${[...new Set(pendingIndents.map((i) => branchName(i.branch)))].join(', ')}`, cta: 'Send items' },
    { show: can('indent') && outOfStock.length > 0, icon: PackageX, to: '/admin/kitchen/storage', tone: 'red',
      title: `${outOfStock.length} items out of stock`, text: outOfStock.map((s) => s.item).join(', ') + (lowStock.length ? ` · ${lowStock.length} more running low` : ''), cta: 'View stock' },
    { show: can('purchase') && posInTransit.length > 0, icon: ShoppingCart, to: '/admin/kitchen/purchase-orders', tone: 'blue',
      title: `${posInTransit.length} order on the way`, text: 'Mark it received when the goods arrive.', cta: 'Open orders' },
    { show: can('expenses', 'approve') && pendingExp.length > 0, icon: Receipt, to: '/admin/accounting/expenses', tone: 'amber',
      title: `${pendingExp.length} expenses to approve`, text: `${inr(pendingExp.reduce((s, e) => s + e.amount, 0))} in total`, cta: 'Approve' },
  ].filter((t) => t.show)

  const toneCls: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600', red: 'bg-rose-50 text-rose-600', blue: 'bg-sky-50 text-sky-600',
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Welcome banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#5a1a1f] to-[#7a2228] p-5 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size={64} />
          <div>
            <p className="text-sm text-[#f1d9a6]">{greeting()}, Allen</p>
            <h1 className="text-xl font-semibold">{RESTO_NAME}</h1>
            <p className="text-sm text-white/70">{outlets.length} outlets · 1 central kitchen</p>
          </div>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi to="/admin/branches" icon={IndianRupee} label="Sales this month" value={inr(totalSales)} note={`Across ${outlets.length} outlets`} />
        <Kpi to="/admin/accounting/costing" icon={Percent} label="Food cost" value={revenue ? foodCostPct.toFixed(1) + '%' : '—'}
          tone={!revenue ? 'slate' : foodCostPct > FOOD_COST_TARGET ? 'red' : 'green'}
          note={!revenue ? 'No dish sales yet' : foodCostPct > FOOD_COST_TARGET ? `Above ${FOOD_COST_TARGET}% target` : `Within ${FOOD_COST_TARGET}% target ✓`} />
        <Kpi to="/admin/accounting/costing" icon={TrendingUp} label="Gross margin" value={revenue ? (100 - foodCostPct).toFixed(1) + '%' : '—'} note={revenue ? `${inr(revenue - cost)} profit on food` : 'No dish sales yet'} tone={revenue ? 'green' : 'slate'} />
        <Kpi to="/admin/kitchen/storage" icon={Warehouse} label="Stock in kitchen" value={inr(stockValue)}
          note={!STOCK.length ? 'No stock recorded yet' : outOfStock.length ? `${outOfStock.length} items out of stock` : 'All items in stock'} tone={outOfStock.length ? 'red' : 'slate'} />
      </div>

      {/* To-do list + outlet ranking */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Needs your attention" className="lg:col-span-3" pad={false}>
          {todos.length ? (
            <ul className="divide-y divide-slate-100">
              {todos.map((t) => (
                <li key={t.title}>
                  <Link to={t.to} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
                    <span className={`rounded-lg p-2 ${toneCls[t.tone]}`}><t.icon size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                      <span className="block truncate text-xs text-slate-500">{t.text}</span>
                    </span>
                    <span className="hidden items-center gap-1 text-xs font-medium text-[#7a2228] sm:flex">
                      {t.cta} <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="mt-2 font-medium">All caught up</p>
              <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
            </div>
          )}
        </Card>

        <Card title="How each outlet is doing" className="lg:col-span-2" actions={<Link to="/admin/branches" className="text-xs font-medium text-[#7a2228]">Details →</Link>} pad={false}>
          <ul className="divide-y divide-slate-100">
            {ranked.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {b.name}
                    {b.status === 'offline' && <span className="rounded bg-rose-50 px-1 text-[10px] font-medium text-rose-600">offline</span>}
                  </span>
                  <span className="mt-1 block h-1.5 rounded bg-slate-100">
                    <span className="block h-1.5 rounded bg-[#d9a441]" style={{ width: (ranked[0].sales ? (b.sales / ranked[0].sales) * 100 : 0) + '%' }} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm tabular-nums">{inr(b.sales)}</span>
                  <span className={`block text-[11px] ${!b.sales ? 'text-slate-400' : b.foodCost > FOOD_COST_TARGET ? 'text-rose-600' : 'text-emerald-600'}`}>{b.sales ? `food cost ${b.foodCost}%` : 'no sales yet'}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Weekly sales */}
      <Card className="mt-4" title="Sales this week"
        actions={<span className="text-xs text-slate-500">{weekTotal ? <>{inr(weekTotal)} total · best day <b className="text-slate-700">{bestDay.day}</b></> : 'No sales recorded this week'}</span>}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={weekly} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + Math.round(v / 1000) + 'k'} width={48} />
              <Tooltip cursor={{ fill: '#fbf3e4' }} formatter={(v: number) => [inr(v), 'Sales']} />
              <Bar dataKey="total" fill="#7a2228" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {can('ocr') && (
          <Card title="Latest bills" actions={<Link to="/admin/accounting/bills" className="text-xs font-medium text-[#7a2228]">All bills →</Link>} pad={false}>
            <ul className="divide-y divide-slate-100">
              {!BILLS.length && <li className="px-4 py-6 text-center text-sm text-slate-500">No bills uploaded yet.</li>}
              {BILLS.slice(0, 5).map((b) => {
                const [label, tone] = BILL_LABEL[b.status]
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ScanLine size={16} className="text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.vendor}</span>
                      <span className="block text-xs text-slate-500">{branchName(b.branch)} · {b.date}</span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
        {can('indent') && (
          <Card title="Indents from outlets" actions={<Link to="/admin/kitchen/indents" className="text-xs font-medium text-[#7a2228]">All indents →</Link>} pad={false}>
            <ul className="divide-y divide-slate-100">
              {!INDENTS.length && <li className="px-4 py-6 text-center text-sm text-slate-500">No indents from outlets yet.</li>}
              {INDENTS.map((i) => {
                const [label, tone] = INDENT_LABEL[i.status]
                return (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ClipboardList size={16} className="text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{branchName(i.branch)}</span>
                      <span className="block truncate text-xs text-slate-500">{i.items.map((x) => x.item).join(', ')}</span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      {lowStock.length > 0 && can('indent') && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0" /> Running low: {lowStock.map((s) => `${s.item} (${s.qty} ${s.unit})`).join(', ')}
        </p>
      )}
    </div>
  )
}
