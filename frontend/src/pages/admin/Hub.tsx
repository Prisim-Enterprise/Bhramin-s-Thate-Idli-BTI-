import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HUBS, type HubId } from '../../components/Layout'
import { useApp } from '../../context/AppContext'

export type HubStat = { value: string; caption: string; tone?: 'good' | 'warn' | 'bad' }
const TONE = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-rose-600' }

/** A page of big buttons, one per section page. Used by Accounting, Kitchen Manager and Setup & Access. */
export default function Hub({ id, stats, action, children }: {
  id: HubId; stats: Record<string, HubStat>; action?: ReactNode; children?: ReactNode
}) {
  const { can } = useApp()
  const hub = HUBS[id]
  const items = hub.items.filter((i) => can(i.module))

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{hub.label}</h1>
          <p className="mt-1 text-sm text-slate-500">{hub.subtitle}</p>
        </div>
        {action}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((i) => {
          const st = stats[i.to]
          return (
            <Link key={i.to} to={i.to}
              className="group flex min-h-[200px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d9a441] hover:shadow-md">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#7a2228] text-[#f6e3b8] transition group-hover:bg-[#5a1a1f]">
                <i.icon size={28} strokeWidth={2} />
              </span>
              <span className="mt-4 text-lg font-semibold text-slate-900">{i.label}</span>
              <span className="mt-0.5 text-sm text-slate-500">{i.desc}</span>
              <span className="mt-auto flex items-end justify-between gap-2 pt-4">
                {st ? (
                  <span>
                    <span className={`block text-xl font-semibold tabular-nums ${st.tone ? TONE[st.tone] : 'text-slate-900'}`}>{st.value}</span>
                    <span className="block text-xs text-slate-500">{st.caption}</span>
                  </span>
                ) : <span />}
                <ArrowRight size={20} className="shrink-0 text-[#7a2228] transition group-hover:translate-x-1" />
              </span>
            </Link>
          )
        })}
      </div>

      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}
