import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '', pad = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, icon: Icon, tone = 'brand' }: {
  label: string; value: string; hint?: string; icon?: LucideIcon; tone?: 'brand' | 'green' | 'amber' | 'red'
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && (
          <span className={`rounded-lg p-1.5 ${tones[tone]}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

const BADGE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

// Maps common status words to a colour so every table looks consistent.
const STATUS_TONE: Record<string, keyof typeof BADGE> = {
  verified: 'green', approved: 'green', issued: 'green', received: 'green', online: 'green', active: 'green', paid: 'green', connected: 'green', billed: 'violet',
  extracted: 'blue', sent: 'blue', processing: 'blue', po_raised: 'violet',
  pending: 'amber', queued: 'amber', partial: 'amber', draft: 'slate',
  failed: 'red', rejected: 'red', offline: 'red', inactive: 'slate', disconnected: 'red',
}

export function Badge({ children, tone }: { children: ReactNode; tone?: keyof typeof BADGE }) {
  const key = tone ?? STATUS_TONE[String(children).toLowerCase()] ?? 'slate'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${BADGE[key]}`}>
      {typeof children === 'string' ? children.replace('_', ' ') : children}
    </span>
  )
}

export function Button({ children, variant = 'primary', size = 'md', icon: Icon, ...rest }: {
  children?: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: LucideIcon
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variant]
  const s = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button {...rest} className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed ${v} ${s} ${rest.className ?? ''}`}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Table({ head, children, dense }: { head: ReactNode[]; children: ReactNode; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`whitespace-nowrap px-4 font-medium ${dense ? 'py-2' : 'py-2.5'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2.5 [&_td]:whitespace-nowrap">{children}</tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function NoAccess({ module }: { module: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-base font-semibold text-slate-800">No access</p>
      <p className="mt-1 text-sm text-slate-500">
        Your role can't view <b>{module}</b>. Ask an admin to grant it under Control Panel → Role Permissions.
      </p>
    </div>
  )
}
