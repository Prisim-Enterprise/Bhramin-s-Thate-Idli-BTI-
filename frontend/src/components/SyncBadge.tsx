import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { syncAll, useSyncStatus } from '../data/cloudStore'

/** Top-bar indicator: is everything saved to the cloud? Click to sync now. */
export default function SyncBadge() {
  const s = useSyncStatus()
  if (!s.on) return null
  const base = 'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium'
  let body
  if (s.error) {
    body = <span className={`${base} bg-rose-50 text-rose-700`}><AlertTriangle size={13} /> Not saved to cloud{s.waiting ? ` (${s.waiting} waiting)` : ''}</span>
  } else if (s.busy || !s.synced) {
    body = <span className={`${base} bg-slate-100 text-slate-600`}><RefreshCw size={13} className="animate-spin" /> Saving to cloud…</span>
  } else if (s.waiting) {
    body = <span className={`${base} bg-amber-50 text-amber-800`}><CloudOff size={13} /> {s.waiting} waiting</span>
  } else {
    body = <span className={`${base} bg-emerald-50 text-emerald-700`}><Cloud size={13} /> Saved to cloud{s.moved ? ` · ${s.moved} moved from this browser` : ''}</span>
  }
  return (
    <button onClick={() => void syncAll()} title={s.error ? `${s.error} — click to try again` : 'Click to sync now'} className="shrink-0">
      {body}
    </button>
  )
}
