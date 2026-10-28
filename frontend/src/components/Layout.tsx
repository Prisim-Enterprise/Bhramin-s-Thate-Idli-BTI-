import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ScanLine, BookOpenCheck, ClipboardList, Warehouse, ShoppingCart, Store,
  Settings2, Building2, IndianRupee, Receipt, Cpu, PackagePlus, MinusCircle, Wallet, Users, ShieldCheck,
  Plug, Scale, Calculator, Library, ChevronRight, ChefHat, SlidersHorizontal, Menu, X, Bell, LogOut, type LucideIcon,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { IS_DEMO } from '../config'
import Logo, { RESTO_NAME } from './Logo'
import { ROLES, type ModuleId } from '../data/mock'

export type NavItem = {
  to: string; label: string; icon: LucideIcon; module: ModuleId
  anyOf?: ModuleId[] // shown if the role can view any of these
  big?: boolean      // rendered as a large button
}
/** Can this role open the nav item? */
export const canSee = (i: NavItem, can: (m: ModuleId) => boolean) => (i.anyOf ?? [i.module]).some((m) => can(m))
export type NavGroup = { section: string; items: NavItem[] }

export const CONTROL_NAV: NavItem[] = [
  { to: '/control', label: 'Control Overview', icon: Settings2, module: 'settings' },
  { to: '/control/restaurants', label: 'Restaurants & Branches', icon: Building2, module: 'settings' },
  { to: '/control/sales', label: 'Sales', icon: IndianRupee, module: 'sales' },
  { to: '/control/expenses', label: 'Expenses', icon: Receipt, module: 'expenses' },
  { to: '/control/ocr', label: 'OCR Status', icon: Cpu, module: 'ocr' },
  { to: '/control/purchases', label: 'Purchases & Vendors', icon: PackagePlus, module: 'purchase' },
  { to: '/control/deductions', label: 'Deductions', icon: MinusCircle, module: 'deductions' },
  { to: '/control/salary', label: 'Salary', icon: Wallet, module: 'salary' },
  { to: '/control/users', label: 'Users & Login', icon: Users, module: 'users' },
  { to: '/control/roles', label: 'Role Permissions', icon: ShieldCheck, module: 'users' },
  { to: '/control/integrations', label: 'Integrations & AI', icon: Plug, module: 'settings' },
]
const CONTROL_GROUPS: NavGroup[] = [
  { section: 'Setup', items: CONTROL_NAV.slice(0, 2) },
  { section: 'Money', items: CONTROL_NAV.slice(2, 8) },
  { section: 'Access & System', items: CONTROL_NAV.slice(8) },
]

// Control Panel pages also live inside the Centre Kitchen Dashboard, under /admin/...
// ('/control' itself becomes '/admin/settings').
export const toAdminPath = (controlPath: string) =>
  controlPath === '/control' ? '/admin/settings' : controlPath.replace(/^\/control/, '/admin')
const inAdmin = (path: string): NavItem => {
  const item = CONTROL_NAV.find((n) => n.to === path)!
  return { ...item, to: toAdminPath(item.to) }
}

// Sidebar "big buttons". Each opens a page of large tiles (see pages/admin/Hub.tsx).
export type HubItem = NavItem & { desc: string }
export type HubId = 'accounting' | 'kitchen' | 'setup'
export const HUBS: Record<HubId, { label: string; icon: LucideIcon; to: string; subtitle: string; items: HubItem[] }> = {
  accounting: {
    label: 'Accounting', icon: Calculator, to: '/admin/accounting', subtitle: 'October 2026 · pick a report to open it',
    items: [
      { to: '/admin/accounting/books', label: 'Account Books', icon: Library, module: 'accounts', desc: 'Cash book, ledgers and registers for every branch' },
      { to: '/admin/accounting/pnl', label: 'Profit & Loss', icon: Scale, module: 'accounts', desc: 'Did we make money this month?' },
      { to: '/admin/accounting/sales', label: 'Sales Report', icon: IndianRupee, module: 'sales', desc: 'How much each outlet sold' },
      { to: '/admin/accounting/expenses', label: 'Expenses Report', icon: Receipt, module: 'expenses', desc: 'Where the money went' },
      { to: '/admin/accounting/purchases', label: 'Purchases Report', icon: PackagePlus, module: 'purchase', desc: 'What we bought and still owe' },
      { to: '/admin/accounting/costing', label: 'Food Cost Report', icon: BookOpenCheck, module: 'accounts', desc: 'Ingredient cost vs selling price' },
      { to: '/admin/accounting/salary', label: 'Salary Report', icon: Wallet, module: 'salary', desc: "This month's staff salaries" },
      { to: '/admin/accounting/deductions', label: 'Deductions Report', icon: MinusCircle, module: 'deductions', desc: 'PF, ESI and other cuts explained' },
      { to: '/admin/accounting/bills', label: 'OCR Bill Inbox', icon: ScanLine, module: 'ocr', desc: 'Check bills read by OCR' },
    ],
  },
  kitchen: {
    label: 'Kitchen Manager', icon: ChefHat, to: '/admin/kitchen', subtitle: 'Indents from outlets, stock in the central kitchen, and orders to vendors',
    items: [
      { to: '/admin/kitchen/indents', label: 'Branch Indents', icon: ClipboardList, module: 'indent', desc: 'What outlets have asked for' },
      { to: '/admin/kitchen/storage', label: 'Storage / Stock', icon: Warehouse, module: 'indent', desc: 'What we have in the kitchen' },
      { to: '/admin/kitchen/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, module: 'purchase', desc: 'Orders placed with vendors' },
    ],
  },
  setup: {
    label: 'Setup & Access', icon: SlidersHorizontal, to: '/admin/setup', subtitle: 'Branches, connected apps, bill scanning and who can log in',
    items: [
      { to: '/admin/setup/branches', label: 'Branches & Integrations', icon: Building2, module: 'settings', desc: 'Locations, Swiggy, Zomato, POS and AI' },
      { ...inAdmin('/control/ocr'), desc: 'Turn bill scanning on or off per branch' },
      { ...inAdmin('/control/users'), desc: 'Who can log in, and login rules' },
      { ...inAdmin('/control/roles'), desc: 'What each role can see and do' },
    ],
  },
}
const hubButton = (id: HubId): NavItem => ({
  to: HUBS[id].to, label: HUBS[id].label, icon: HUBS[id].icon, module: HUBS[id].items[0].module, big: true,
  anyOf: HUBS[id].items.map((i) => i.module),
})

export const ADMIN_NAV: NavGroup[] = [
  // All big buttons. Accounting, Kitchen Manager and Setup & Access open a page of tiles.
  { section: '', items: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', big: true },
    { to: '/admin/branches', label: 'Branch Dashboards', icon: Store, module: 'dashboard', big: true },
    hubButton('accounting'), hubButton('kitchen'), hubButton('setup'),
  ] },
]

// Turns a Control Panel link into the right link for whichever portal you're in.
export function usePortalPath() {
  const { pathname } = useLocation()
  const admin = pathname.startsWith('/admin')
  return (controlPath: string) => (admin ? toAdminPath(controlPath) : controlPath)
}

// Each portal has its own look so it's obvious which one you're in.
const PORTALS = {
  admin: {
    name: 'Centre Kitchen Dashboard', sub: RESTO_NAME, home: '/admin', nav: ADMIN_NAV,
    aside: 'bg-[#2a0f12]', logo: 'bg-[#7a2228]', active: 'bg-[#d9a441]/20 text-[#f6e3b8]', chip: 'bg-[#fbf3e4] text-[#7a2228]',
  },
  control: {
    name: 'Prisim Control Panel', sub: 'Settings, money & access', home: '/control', nav: CONTROL_GROUPS,
    aside: 'bg-[#1e1338]', logo: 'bg-violet-500', active: 'bg-violet-500/20 text-white', chip: 'bg-violet-100 text-violet-700',
  },
}

export default function Layout({ portal, children }: { portal: keyof typeof PORTALS; children: ReactNode }) {
  const { role, can } = useApp()
  const auth = useAuth()
  const initials = (auth.email ?? 'AL').slice(0, 2).toUpperCase()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const p = PORTALS[portal]
  const close = () => setOpen(false)

  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-y-auto px-3 py-4 transition lg:static lg:translate-x-0 ${p.aside} ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {portal === 'admin' ? (
          // Big centred restaurant logo for the Centre Kitchen Dashboard.
          <div className="relative mb-6 border-b border-white/10 pb-5">
            <button className="absolute right-0 top-0 text-slate-400 lg:hidden" onClick={close} aria-label="Close menu"><X size={18} /></button>
            <Link to={p.home} className="flex flex-col items-center text-center">
              <Logo size={128} />
              <p className="mt-3 text-base font-semibold text-white">{p.name}</p>
              <p className="text-xs text-[#d9a441]">{p.sub}</p>
            </Link>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between px-2">
            <Link to={p.home} className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-lg font-bold text-white ${p.logo}`}>P</div>
              <div>
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-[11px] text-slate-400">{p.sub}</p>
              </div>
            </Link>
            <button className="text-slate-400 lg:hidden" onClick={close} aria-label="Close menu"><X size={18} /></button>
          </div>
        )}

        <nav className="flex-1">
          {p.nav.map((g) => {
            const items = g.items.filter((i) => canSee(i, can))
            if (!items.length) return null
            return (
              <div key={g.section} className="mb-4">
                {g.section && <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.section}</p>}
                <div className={items.some((i) => i.big) ? 'space-y-2.5' : 'space-y-0.5'}>
                  {items.map((i) => i.big ? (
                    <NavLink key={i.to} to={i.to} end={i.to === p.home} onClick={close}
                      className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? 'bg-[#d9a441] text-[#2a0f12] shadow' : 'bg-[#d9a441]/15 text-[#f6e3b8] ring-1 ring-[#d9a441]/40 hover:bg-[#d9a441]/25'}`}>
                      <i.icon size={17} strokeWidth={2.25} /><span className="flex-1">{i.label}</span><ChevronRight size={16} />
                    </NavLink>
                  ) : (
                    <NavLink key={i.to} to={i.to} end={i.to === p.home} onClick={close}
                      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${isActive ? p.active + ' font-semibold' : 'font-medium text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                      <i.icon size={17} strokeWidth={2.25} />{i.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
          <button onClick={async () => { await auth.signOut(); navigate('/') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:px-6">
          <button className="text-slate-600 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className={`hidden rounded-md px-2 py-0.5 text-xs font-semibold sm:inline ${p.chip}`}>{p.name}</span>
          <span className="hidden text-sm text-slate-500 md:inline">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {IS_DEMO && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Demo · sample data</span>}
          <div className="ml-auto flex items-center gap-3">
            <button className="relative text-slate-500 hover:text-slate-800" aria-label="Notifications">
              <Bell size={18} /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
            </button>
            <div title={`Signed in as ${auth.email ? auth.email + ' · ' : ''}${ROLES.find((r) => r.id === role)?.name}`} className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white">{initials}</div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
