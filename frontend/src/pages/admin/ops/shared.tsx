import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PlugZap } from 'lucide-react'
import { useApp } from '../../../context/AppContext'

// Ordering apps BTI sells through. The day totals for Swiggy, Zomato and Rapido come from the Imprest Books.
export const APPS = [
  { id: 'zomato', name: 'Zomato', color: '#e23744', field: 'zomato' as const },
  { id: 'swiggy', name: 'Swiggy', color: '#fc8019', field: 'swiggy' as const },
  { id: 'rapido', name: 'Rapido', color: '#f5b800', field: 'rapido' as const },
  { id: 'magicpin', name: 'Magicpin', color: '#7b2ff7', field: null },
  { id: 'ondc', name: 'ONDC', color: '#1e6fd9', field: null },
]
export type AppId = (typeof APPS)[number]['id']

export function AppMark({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-xl font-bold text-white" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}>
      {name[0]}
    </span>
  )
}

/** Page title row: title on the left, actions on the right (like the other dashboard pages). */
export function OpsHeader({ title, children, after }: { title: string; children?: ReactNode; after?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {after}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/** Shown where figures need the POS or an ordering app connected. */
export function NeedsConnection({ what }: { what: string }) {
  const { role } = useApp()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <PlugZap size={18} className="shrink-0 text-sky-600" />
      <span className="min-w-0 flex-1">{what}</span>
      {role === 'admin' && <Link to="/control/branches" className="font-semibold text-sky-700 underline">Connect in Branch Integrations</Link>}
    </div>
  )
}

export const tabCls = (on: boolean) => `rounded-md px-4 py-1.5 text-sm font-medium ${on ? 'bg-[#fbf3e4] text-[#7a2228]' : 'text-slate-600 hover:text-slate-900'}`
export const selCls = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700'
