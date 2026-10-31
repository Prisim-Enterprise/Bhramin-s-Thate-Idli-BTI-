import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { BRANCHES, BRANCH_INTEGRATIONS, inr, type IntegrationId } from '../../../data/mock'
import { useEntries } from '../../../data/entries'
import { useApp } from '../../../context/AppContext'
import { APPS, AppMark, NeedsConnection, type AppId } from './shared'

// Each ordering app, and for each outlet: is it connected, its store ID, and what it sold through the app.
export default function StoreActions() {
  const { role } = useApp()
  const entries = useEntries()
  const [open, setOpen] = useState<AppId | null>(null)
  const app = APPS.find((a) => a.id === open)
  const outlets = BRANCHES.filter((b) => b.id !== 'CK')

  if (!app) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-2 text-sm"><span className="text-slate-500">All Outlets</span><ChevronRight size={14} className="text-slate-300" /><span className="font-medium text-[#7a2228]">Ordering apps</span></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {APPS.map((a) => {
            const on = outlets.filter((o) => BRANCH_INTEGRATIONS[o.id]?.[a.id as IntegrationId]?.on).length
            return (
              <button key={a.id} onClick={() => setOpen(a.id)} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#d9a441] hover:shadow">
                <AppMark name={a.name} color={a.color} size={52} />
                <span className="flex-1"><span className="block text-lg font-semibold text-slate-900">{a.name}</span>
                  <span className="text-sm text-slate-500">Tap to view · {on ? `${on} of ${outlets.length} outlets connected` : 'not connected yet'}</span></span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm"><button className="text-slate-500 hover:underline" onClick={() => setOpen(null)}>All Outlets</button><ChevronRight size={14} className="text-slate-300" /><span className="font-medium text-[#7a2228]">{app.name}</span></div>
        <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"><ChevronLeft size={15} /> Back</button>
      </div>
      <NeedsConnection what={`Turning a ${app.name} store on or off, and menu changes, work once ${app.name} is connected for the outlet.`} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-5 py-2.5 font-medium">Outlet</th><th className="px-3 font-medium">Connection</th><th className="px-3 font-medium">Store ID</th>
              <th className="px-5 text-right font-medium">{app.field ? `Sold via ${app.name} (Imprest Books)` : 'Sales'}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {outlets.map((o) => {
              const c = BRANCH_INTEGRATIONS[o.id]?.[app.id as IntegrationId]
              const sold = app.field ? entries.filter((e) => e.branch === o.id).reduce((s, e) => s + e[app.field!], 0) : 0
              return (
                <tr key={o.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{o.name}</td>
                  <td className="px-3"><Badge tone={c?.on ? 'green' : 'slate'}>{c?.on ? 'connected' : 'not connected'}</Badge></td>
                  <td className="px-3 text-slate-500">{c?.ref || '—'}</td>
                  <td className="px-5 text-right tabular-nums">{app.field ? (sold ? inr(sold) : '—') : 'Not in Imprest Book'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {role === 'admin' && <p className="mt-3 text-xs text-slate-500">Store IDs are set per outlet in <Link className="text-[#7a2228] underline" to="/control/branches">Control Panel → Branch Integrations</Link>.</p>}
    </div>
  )
}
