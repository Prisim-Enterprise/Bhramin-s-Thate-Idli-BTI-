import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Calculator, Search, Star, Utensils } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import type { ModuleId } from '../../data/mock'

type Report = { to: string; title: string; desc: string; module: ModuleId; cat: 'restaurant' | 'accounting' | 'inventory' }
const REPORTS: Report[] = [
  { to: '/admin/accounting/sales', title: 'All Restaurant Sales Report', desc: 'Total sales of all your outlets, day by day', module: 'sales', cat: 'restaurant' },
  { to: '/admin/online-orders', title: 'Online Orders Report', desc: 'Swiggy, Zomato and Rapido sales per outlet', module: 'sales', cat: 'restaurant' },
  { to: '/admin', title: 'Outlet Statistics', desc: 'Gross, net, online, offline sales and cash per outlet', module: 'dashboard', cat: 'restaurant' },
  { to: '/admin/accounting/costing', title: 'Food Cost Report', desc: 'Ingredients bought vs food sold, per outlet', module: 'accounts', cat: 'restaurant' },
  { to: '/admin/accounting/pnl', title: 'Profit & Loss', desc: 'Income, costs and profit for any month and outlet', module: 'accounts', cat: 'accounting' },
  { to: '/admin/accounting/expenses', title: 'Expenses Report', desc: 'Where the money went', module: 'expenses', cat: 'accounting' },
  { to: '/admin/accounting/purchases', title: 'Purchases Report', desc: 'Vendors, what we still owe and price changes', module: 'purchase', cat: 'accounting' },
  { to: '/admin/accounting/deductions', title: 'Deductions Report', desc: 'Settlement discounts, staff payments, PF and ESI', module: 'deductions', cat: 'accounting' },
  { to: '/admin/accounting/salary', title: 'Salary Report', desc: "This month's staff salaries", module: 'salary', cat: 'accounting' },
  { to: '/admin/accounting/books', title: 'Account Books', desc: 'Cash book, ledgers and registers in Tally format', module: 'accounts', cat: 'accounting' },
  { to: '/admin/inventory/stock', title: 'Stock Summary Report', desc: 'Opening, bought, closing and used per raw material', module: 'indent', cat: 'inventory' },
  { to: '/admin/inventory/closing', title: 'Closing Stock Tracker', desc: 'Which outlets counted their stock each day', module: 'indent', cat: 'inventory' },
  { to: '/admin/inventory/pending-purchases', title: 'Pending Purchases', desc: 'Bills not yet posted to Account Books', module: 'ocr', cat: 'inventory' },
]
const CATS = [
  { id: 'fav', label: 'Favourite', icon: Star },
  { id: 'restaurant', label: 'All Restaurant Reports', icon: Utensils },
  { id: 'accounting', label: 'Accounting Reports', icon: Calculator },
  { id: 'inventory', label: 'Inventory Reports', icon: Boxes },
] as const

function loadFavs(): string[] { try { return JSON.parse(localStorage.getItem('prisim.favReports') ?? '[]') } catch { return [] } }

export default function ReportsCentre() {
  const { can } = useApp()
  const [favs, setFavs] = useState<string[]>(loadFavs)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('fav')
  const toggle = (to: string) => {
    const next = favs.includes(to) ? favs.filter((f) => f !== to) : [...favs, to]
    setFavs(next)
    try { localStorage.setItem('prisim.favReports', JSON.stringify(next)) } catch { /* kept for this visit only */ }
  }
  const term = q.trim().toLowerCase()
  const mine = REPORTS.filter((r) => can(r.module) && (r.title + ' ' + r.desc).toLowerCase().includes(term))

  const Card = ({ r }: { r: Report }) => (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#d9a441] hover:shadow">
      <Link to={r.to} className="block pr-8"><span className="block font-semibold text-slate-900">{r.title}</span><span className="mt-1 block text-sm text-slate-500">{r.desc}</span></Link>
      <button onClick={() => toggle(r.to)} aria-label={favs.includes(r.to) ? `Remove ${r.title} from favourites` : `Add ${r.title} to favourites`} className="absolute right-4 top-4">
        <Star size={18} className={favs.includes(r.to) ? 'fill-[#d9a441] text-[#d9a441]' : 'text-slate-300 hover:text-[#d9a441]'} />
      </button>
    </div>
  )
  const section = (id: string, title: string, sub: string, list: Report[], emptyText: string) => (
    <section key={id} id={'reports-' + id} className="rounded-2xl border border-slate-200 bg-white/60 p-5">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mb-4 text-sm text-slate-500">{sub}</p>
      {list.length ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((r) => <Card key={r.to} r={r} />)}</div>
        : <div className="flex flex-col items-center py-8 text-center"><Star size={34} className="text-[#d9a441]" /><p className="mt-2 font-medium">{emptyText}</p><p className="text-sm text-slate-500">Add reports to favourites with the star.</p></div>}
    </section>
  )

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Reports</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {CATS.map((c) => (
            <button key={c.id} onClick={() => { setCat(c.id); document.getElementById('reports-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className={`flex w-full items-center gap-2.5 rounded-lg border-l-4 px-3 py-2.5 text-left text-sm font-medium ${cat === c.id ? 'border-[#7a2228] bg-[#fbf3e4] text-[#7a2228]' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
              <c.icon size={16} /> {c.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <label className="relative block rounded-2xl bg-slate-100 p-3">
            <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search reports" placeholder="Search for reports here…" className="w-full max-w-md rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {section('fav', 'Favourite', 'Reports you marked to open often', mine.filter((r) => favs.includes(r.to)), 'There are no favourite reports')}
          {section('restaurant', 'All Restaurant Reports', 'Sales and how each outlet is doing', mine.filter((r) => r.cat === 'restaurant'), 'No reports match')}
          {section('accounting', 'Accounting Reports', 'Money in and out, worked out from Imprest Books and bills', mine.filter((r) => r.cat === 'accounting'), 'No reports match')}
          {section('inventory', 'Inventory Reports', 'Stock, closing counts and bills waiting', mine.filter((r) => r.cat === 'inventory'), 'No reports match')}
        </div>
      </div>
    </div>
  )
}
