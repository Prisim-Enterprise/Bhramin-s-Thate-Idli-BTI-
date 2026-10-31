import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Boxes, Briefcase, Calculator, ChefHat, ChevronDown, ChevronRight, Clock, ClipboardCheck, Contact, FileBarChart, Globe, LayoutDashboard,
  LayoutGrid, ListChecks, Megaphone, PackageSearch, Receipt, Store, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { ModuleId } from '../data/mock'
import { HUBS } from './Layout'

// Sidebar of the Centre Kitchen Dashboard: single tabs, sections and groups that fold open.
export type SideLink = { to: string; label: string; icon: LucideIcon; module: ModuleId; anyOf?: ModuleId[]; badge?: string }
export type SideEntry =
  | ({ kind: 'link' } & SideLink)
  | { kind: 'section'; label: string; items: SideLink[] }
  | { kind: 'group'; label: string; icon: LucideIcon; items: SideLink[] }

const hubItems = (id: 'accounting' | 'kitchen', overview: string): SideLink[] => [
  { to: HUBS[id].to, label: overview, icon: LayoutGrid, module: HUBS[id].items[0].module, anyOf: HUBS[id].items.map((i) => i.module) },
  ...HUBS[id].items.map((i) => ({ to: i.to, label: i.label, icon: i.icon, module: i.module })),
]

// Built on first use: this file and Layout import each other, so HUBS isn't ready while files are still loading.
let cached: SideEntry[] | null = null
export const adminSidebar = (): SideEntry[] => (cached ??= [
  { kind: 'link', to: '/admin', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { kind: 'link', to: '/admin/branches', label: 'Branch Dashboards', icon: Store, module: 'dashboard' },
  { kind: 'section', label: 'Daily Operations', items: [
    { to: '/admin/live-orders', label: 'Live Orders', icon: Clock, module: 'sales' },
    { to: '/admin/online-orders', label: 'Online Orders', icon: Globe, module: 'sales' },
    { to: '/admin/store-actions', label: 'Menu & Store Actions', icon: Receipt, module: 'sales' },
  ] },
  { kind: 'group', label: 'Accounting', icon: Calculator, items: hubItems('accounting', 'All accounting') },
  { kind: 'group', label: 'Kitchen Manager', icon: ChefHat, items: hubItems('kitchen', 'Kitchen overview') },
  { kind: 'link', to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, module: 'sales' },
  { kind: 'group', label: 'Inventory', icon: Boxes, items: [
    { to: '/admin/inventory/stock', label: 'Stock Summary', icon: PackageSearch, module: 'indent', anyOf: ['indent', 'purchase'] },
    { to: '/admin/inventory/closing', label: 'Closing Stock Tracker', icon: ListChecks, module: 'indent', anyOf: ['indent', 'purchase'] },
    { to: '/admin/inventory/po-approval', label: 'Purchase Order Approval', icon: ClipboardCheck, module: 'purchase' },
    { to: '/admin/inventory/pending-purchases', label: 'Pending Purchases', icon: Receipt, module: 'ocr', anyOf: ['ocr', 'purchase'] },
  ] },
  { kind: 'link', to: '/admin/marketing', label: 'Marketing Automation', icon: Megaphone, module: 'sales', badge: 'New' },
  { kind: 'link', to: '/admin/reports', label: 'Reports', icon: FileBarChart, module: 'dashboard' },
  { kind: 'link', to: '/admin/management', label: 'Management', icon: Briefcase, module: 'dashboard' },
  { kind: 'link', to: '/admin/crm', label: 'CRM', icon: Contact, module: 'sales' },
])

/** Every link in the sidebar, in order (used to find a role's first page after sign-in). */
export const allSideLinks = (): SideLink[] => adminSidebar().flatMap((e) => (e.kind === 'link' ? [e] : e.items))

const canOpen = (l: SideLink, can: (m: ModuleId) => boolean) => (l.anyOf ?? [l.module]).some((m) => can(m))

export default function AdminNav({ slim, onPick }: { slim: boolean; onPick: () => void }) {
  const { can } = useApp()
  const { pathname } = useLocation()
  const inGroup = (items: SideLink[]) => items.some((i) => pathname === i.to || (i.to !== '/admin' && pathname.startsWith(i.to + '/')))
  // Groups start open when you're on one of their pages; you can open or close the rest.
  const [open, setOpen] = useState<Record<string, boolean>>({})
  useEffect(() => {
    for (const e of adminSidebar()) if (e.kind === 'group' && inGroup(e.items)) setOpen((o) => (o[e.label] ? o : { ...o, [e.label]: true }))
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const row = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${slim ? 'lg:justify-center lg:px-0' : ''} ${
      active ? 'bg-[#d9a441] font-semibold text-[#2a0f12] shadow' : 'font-medium text-[#f6e3b8]/85 hover:bg-white/5 hover:text-white'}`
  const label = (text: string) => <span className={`min-w-0 flex-1 truncate text-left ${slim ? 'lg:hidden' : ''}`}>{text}</span>
  const link = (l: SideLink, child = false) => (
    <NavLink key={l.to} to={l.to} end={l.to === '/admin' || l.to === HUBS.accounting.to || l.to === HUBS.kitchen.to} onClick={onPick} title={l.label}
      className={({ isActive }) => `${row(isActive)} ${child && !slim ? 'pl-9' : ''}`}>
      <l.icon size={child ? 15 : 17} strokeWidth={2.25} className="shrink-0" />{label(l.label)}
      {l.badge && <span className={`rounded bg-violet-400/25 px-1.5 text-[10px] font-semibold text-violet-200 ${slim ? 'lg:hidden' : ''}`}>{l.badge}</span>}
    </NavLink>
  )

  return (
    <nav className="flex-1 space-y-0.5" aria-label="Dashboard">
      {adminSidebar().map((e) => {
        if (e.kind === 'link') return canOpen(e, can) ? link(e) : null
        const items = e.items.filter((i) => canOpen(i, can))
        if (!items.length) return null
        if (e.kind === 'section') {
          return (
            <div key={e.label} className="pt-3">
              <p className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#d9a441]/80 ${slim ? 'lg:hidden' : ''}`}>{e.label}</p>
              {slim && <div className="mx-3 mb-1 hidden border-t border-white/10 lg:block" />}
              <div className="space-y-0.5">{items.map((i) => link(i))}</div>
            </div>
          )
        }
        const isOpen = !!open[e.label]
        const here = inGroup(items)
        return (
          <div key={e.label}>
            {/* Slim sidebar: the group icon opens its first page. Full sidebar: it folds the group open or shut. */}
            {slim && <NavLink to={items[0].to} title={e.label} onClick={onPick} className={`${row(here)} hidden lg:flex`}><e.icon size={17} strokeWidth={2.25} /></NavLink>}
            <button onClick={() => setOpen((o) => ({ ...o, [e.label]: !isOpen }))} aria-expanded={isOpen}
              className={`${row(false)} ${here && !isOpen ? 'text-white' : ''} ${slim ? 'lg:hidden' : ''}`}>
              <e.icon size={17} strokeWidth={2.25} className="shrink-0" />{label(e.label)}
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {isOpen && <div className={`space-y-0.5 pb-1 ${slim ? 'lg:hidden' : ''}`}>{items.map((i) => link(i, true))}</div>}
          </div>
        )
      })}
    </nav>
  )
}
