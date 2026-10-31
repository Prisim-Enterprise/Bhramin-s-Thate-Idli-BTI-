import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Download, Info, Lightbulb, Printer } from 'lucide-react'
import { Button, Card, EmptyState } from './ui'
import { inr } from '../data/mock'
import { IS_SHARE } from '../config'

// Shared pieces for the plain-language accounting reports.

/** ₹29.66 L for big amounts, ₹45,200 for smaller ones. Negatives as −₹. */
export function money(n: number, short = true) {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (short && a >= 100000) return `${sign}₹${(a / 100000).toFixed(2)} L`
  return sign + inr(Math.round(a))
}

/** "₹23" out of every ₹100 */
export const per100 = (part: number, whole: number) => (whole ? '₹' + ((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0) : '—')

export function ReportHeader({ title, period, actions, onCsv }: { title: string; period: string; actions?: ReactNode; onCsv?: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{period}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {actions}
        {!IS_SHARE && <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>}
        {onCsv && !IS_SHARE && <Button variant="secondary" icon={Download} onClick={onCsv}>Download</Button>}
      </div>
    </div>
  )
}

/** The "In simple words" box at the top of every report. */
export function Summary({ points }: { points: ReactNode[] }) {
  return (
    <section className="mb-5 rounded-2xl border border-[#ecd9b0] bg-[#fdf8ee] p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#7a2228]">
        <Lightbulb size={16} /> In simple words
      </p>
      <ul className="space-y-2 text-[15px] leading-relaxed text-slate-800">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d9a441]" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Big({ children }: { children: ReactNode }) {
  return <b className="font-semibold text-slate-900">{children}</b>
}

export function Tile({ label, value, note, tone = 'slate' }: { label: string; value: string; note?: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' }) {
  const v = { slate: 'text-slate-900', green: 'text-emerald-700', red: 'text-rose-600', amber: 'text-amber-600' }[tone]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${v}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

/** Small "what does this mean?" card. */
export function Explain({ title, amount, children }: { title: string; amount?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Info size={15} className="text-[#7a2228]" />{title}</p>
        {amount && <p className="text-sm font-semibold tabular-nums">{amount}</p>}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  )
}

/** Horizontal bar used in "where the money went" style lists. */
export function ShareBar({ value, max, color = '#7a2228' }: { value: number; max: number; color?: string }) {
  return (
    <span className="block h-2 w-full rounded bg-slate-100">
      <span className="block h-2 rounded" style={{ width: Math.max(2, (value / max) * 100) + '%', background: color }} />
    </span>
  )
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** A report page with nothing to show yet. Keeps the title and any actions (like uploads). */
export function EmptyReport({ title, period, icon, text, actions, children }: {
  title: string; period: string; icon: LucideIcon; text: ReactNode; actions?: ReactNode; children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{period}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <Card><EmptyState icon={icon} title="Nothing to report yet" text={text} /></Card>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

/** Month and branch pickers shown at the top of each report. */
export function ScopePicker({ months, month, setMonth, branch, setBranch, monthName, branches }: {
  months: string[]; month: string; setMonth: (m: string) => void; branch: string; setBranch: (b: string) => void
  monthName: (m: string) => string; branches: { id: string; name: string }[]
}) {
  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700'
  return (
    <>
      <select aria-label="Month" className={sel} value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        <option value="">All months</option>
      </select>
      <select aria-label="Branch" className={sel} value={branch} onChange={(e) => setBranch(e.target.value)}>
        <option value="">All branches</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </>
  )
}
