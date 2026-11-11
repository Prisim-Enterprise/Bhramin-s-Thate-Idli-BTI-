import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, BellRing, PackageX, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { branchName } from '../data/mock'
import { LOW_SHARE, useStockAlerts, type StockAlert } from '../data/kitchen'

const SEEN = 'prisim.stockAlertsSeen'
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN) ?? '[]') } catch { return [] } }
const write = (ids: string[]) => { try { localStorage.setItem(SEEN, JSON.stringify(ids)) } catch { /* ignore */ } }
const canPop = () => typeof Notification !== 'undefined'
const SESSION = 'prisim.stockPopupShown' // the on-screen message shows once each time the dashboard is opened
const shownThisVisit = () => { try { return sessionStorage.getItem(SESSION) === '1' } catch { return false } }
const markShown = () => { try { sessionStorage.setItem(SESSION, '1') } catch { /* ignore */ } }
/** How long the on-screen message stays. */
export const POPUP_MS = 10_000

const why = (a: StockAlert) => (a.why === 'out' ? 'finished' : a.why === 'level' ? `at reorder level (${a.limit} ${a.unit})` : `under ${LOW_SHARE * 100}% of the last delivery`)
const linkFor = (a: StockAlert) => `/admin/inventory/items?tab=low&branch=${a.branch}`

/**
 * The bell in the header: items running low in stock.
 * When the dashboard opens with items running low, or a new item starts running low, a message pops up on screen
 * for 10 seconds (and as a device notification, once those are turned on). The items stay listed under the bell.
 */
export default function StockAlerts() {
  const { can } = useApp()
  const auth = useAuth()
  const myBranch = (() => { const b = auth.session?.user.app_metadata?.branch as string | undefined; return b && b !== 'HO' ? b : null })()
  const alerts = useStockAlerts().filter((a) => !myBranch || a.branch === myBranch)
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState<StockAlert[]>([])
  const [perm, setPerm] = useState(canPop() ? Notification.permission : 'denied')
  const box = useRef<HTMLDivElement>(null)
  const show = can('indent') || can('purchase') || can('ocr')

  // Tell people about items that have just started running low (each once, until it is restocked).
  const ids = alerts.map((a) => a.id).join(',')
  useEffect(() => {
    if (!show) return
    const seen = new Set(read())
    const fresh = alerts.filter((a) => !seen.has(a.id))
    write(alerts.map((a) => a.id)) // restocked items drop out, so they alert again next time
    // On screen: everything running low when the dashboard is opened, then each new item as it starts running low.
    const onScreen = shownThisVisit() ? fresh : alerts
    if (onScreen.length) { setPopup(onScreen); markShown() }
    if (!fresh.length || !canPop() || Notification.permission !== 'granted') return
    const body = fresh.slice(0, 4).map((a) => `${a.item}: ${Math.max(0, a.onHand)} ${a.unit} left at ${branchName(a.branch)}`).join('; ') + (fresh.length > 4 ? `; +${fresh.length - 4} more` : '')
    try { new Notification(fresh.length === 1 ? 'Stock running low' : `${fresh.length} items running low`, { body, tag: 'bti-stock' }) } catch { /* some phones only allow this from the app */ }
  }, [ids, show]) // eslint-disable-line react-hooks/exhaustive-deps

  // The on-screen message closes by itself after 10 seconds.
  useEffect(() => {
    if (!popup.length) return
    const t = setTimeout(() => setPopup([]), POPUP_MS)
    return () => clearTimeout(t)
  }, [popup])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  if (!show) return null
  const n = alerts.length
  const finished = popup.filter((a) => a.why === 'out').length
  const message = popup.length > 0 && createPortal(
    <div role="alert" aria-live="assertive" data-testid="stock-popup"
      className="fixed inset-x-4 top-16 z-[60] mx-auto max-w-md overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:mx-0 sm:w-[400px]">
      <div className="flex items-start gap-3 bg-rose-50 px-4 py-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-800">{popup.length === 1 ? 'This item is getting over' : `These ${popup.length} items are getting over`}</p>
          <p className="text-xs text-rose-700">{finished ? `${finished} already finished. ` : ''}Reorder or raise an indent.</p>
        </div>
        <button aria-label="Close message" className="text-rose-400 hover:text-rose-700" onClick={() => setPopup([])}><X size={18} /></button>
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {popup.slice(0, 6).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0"><b className="font-medium text-slate-900">{a.item}</b> <span className="text-slate-500">· {branchName(a.branch)}</span></span>
            <span className={`shrink-0 font-semibold tabular-nums ${a.why === 'out' ? 'text-rose-600' : 'text-amber-700'}`}>{a.why === 'out' ? 'finished' : `${a.onHand} ${a.unit || ''} left`}</span>
          </li>
        ))}
        {popup.length > 6 && <li className="px-4 py-2 text-xs text-slate-500">+{popup.length - 6} more, see the bell</li>}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <Link to="/admin/inventory/items?tab=low" onClick={() => setPopup([])} className="text-sm font-medium text-[#7a2228] hover:underline">View items</Link>
        <span className="text-xs text-slate-400">Saved under the bell</span>
      </div>
      {/* Time left before it closes */}
      <div key={popup.map((a) => a.id).join()} className="h-1 origin-left bg-rose-400" style={{ animation: `stockPopupBar ${POPUP_MS}ms linear forwards` }} />
      <style>{'@keyframes stockPopupBar { from { transform: scaleX(1) } to { transform: scaleX(0) } } @media (prefers-reduced-motion: reduce) { [data-testid=stock-popup] .origin-left { animation: none !important } }'}</style>
    </div>,
    document.body,
  )

  return (
    <div className="relative" ref={box}>
      {message}
      <button className="relative text-slate-500 hover:text-slate-800" aria-label={n ? `Notifications: ${n} items running low` : 'Notifications'} onClick={() => setOpen(!open)}>
        {n ? <BellRing size={18} className="text-rose-600" /> : <Bell size={18} />}
        {n > 0 && <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Stock running low</p>
            <p className="text-xs text-slate-500">From posted bills, goods sent from the Centre Kitchen and closing counts.</p>
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link to={linkFor(a)} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <PackageX size={16} className={`mt-0.5 shrink-0 ${a.why === 'out' ? 'text-rose-600' : 'text-amber-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{a.item} <span className="font-normal text-slate-500">· {branchName(a.branch)}</span></span>
                    <span className="block text-xs text-slate-500">{Math.max(0, a.onHand)} {a.unit || 'N/A'} left · {why(a)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {!n && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing running low.</li>}
          </ul>
          {canPop() && perm !== 'granted' && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs">
              {perm === 'denied'
                ? <span className="text-slate-500">Pop-up alerts are blocked in this browser's site settings.</span>
                : <button className="font-medium text-[#7a2228] hover:underline" onClick={() => Notification.requestPermission().then(setPerm)}>Turn on pop-up alerts on this device</button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
