import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, BellRing, FileWarning, PackageX, Scale, Volume2, VolumeX, X } from 'lucide-react'
import { playAlertSound, setSoundOn, soundOn } from '../lib/alertSound'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { accountingOnly, branchName } from '../data/mock'
import { niceDate, useEntries } from '../data/entries'
import { LOW_SHARE, useStockAlerts, type StockAlert } from '../data/kitchen'
import { partnerName, reconcileAlerts, usePartnerTerms, useSettlements, type ReconcileAlert } from '../data/settlements'

const store = (key: string) => ({
  read: (): string[] => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } },
  write: (ids: string[]) => { try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* ignore */ } },
})
const once = (key: string) => ({ // the on-screen message shows once each time the dashboard is opened
  done: () => { try { return sessionStorage.getItem(key) === '1' } catch { return false } },
  mark: () => { try { sessionStorage.setItem(key, '1') } catch { /* ignore */ } },
})
const stockSeen = store('prisim.stockAlertsSeen'), stockVisit = once('prisim.stockPopupShown')
const reconSeen = store('prisim.reconcileAlertsSeen'), reconVisit = once('prisim.reconcilePopupShown')
const canPop = () => typeof Notification !== 'undefined'
const notify = (title: string, body: string, tag: string) => {
  if (!canPop() || Notification.permission !== 'granted') return
  try { new Notification(title, { body, tag }) } catch { /* some phones only allow this from the app */ }
}
/** How long the on-screen message stays. */
export const POPUP_MS = 10_000

const why = (a: StockAlert) => (a.why === 'out' ? 'finished' : a.why === 'level' ? `at reorder level (${a.limit} ${a.unit})` : `under ${LOW_SHARE * 100}% of the last delivery`)
const stockLink = (a: StockAlert) => `/admin/inventory/items?tab=low&branch=${a.branch}`
const reconLink = (a: ReconcileAlert) => `/admin/accounting/reconcile?week=${a.week}&open=${encodeURIComponent(a.rowId)}`
const reconTitle = (a: ReconcileAlert) => `${partnerName(a.partner)} · ${branchName(a.branch)}`

/** New alerts since last time are remembered per device; a fixed problem drops out, so it alerts again if it comes back. */
function useFresh<T extends { id: string }>(list: T[], on: boolean, seen: ReturnType<typeof store>, visit: ReturnType<typeof once>, tell: (fresh: T[]) => void) {
  const [popup, setPopup] = useState<T[]>([])
  const ids = list.map((a) => a.id).join(',')
  useEffect(() => {
    if (!on) return
    const before = new Set(seen.read())
    const fresh = list.filter((a) => !before.has(a.id))
    seen.write(list.map((a) => a.id))
    // On screen: everything open when the dashboard is opened, then each new one as it comes up.
    const onScreen = visit.done() ? fresh : list
    if (onScreen.length) { setPopup(onScreen); visit.mark() }
    if (fresh.length) tell(fresh)
  }, [ids, on]) // eslint-disable-line react-hooks/exhaustive-deps
  // The on-screen message closes by itself after 10 seconds.
  useEffect(() => {
    if (!popup.length) return
    const t = setTimeout(() => setPopup([]), POPUP_MS)
    return () => clearTimeout(t)
  }, [popup])
  return [popup, setPopup] as const
}

function Bar({ items, tone }: { items: { id: string }[]; tone: string }) {
  return <div key={items.map((a) => a.id).join()} className={`h-1 origin-left ${tone}`} style={{ animation: `alertPopupBar ${POPUP_MS}ms linear forwards` }} />
}

/**
 * The bell in the header:
 *  - items running low in stock
 *  - Reconcile statements that don't match (sales vs books, net vs statement, received vs net)
 * When the dashboard opens with something to check, or something new comes up, a message pops up on screen
 * for 10 seconds (and as a device notification, once those are turned on). Everything stays listed under the bell.
 */
export default function StockAlerts() {
  const { can, role } = useApp()
  const auth = useAuth()
  const myBranch = (() => { const b = auth.session?.user.app_metadata?.branch as string | undefined; return b && b !== 'HO' ? b : null })()
  const showStock = !accountingOnly(role) && (can('indent') || can('purchase') || can('ocr'))
  const showRecon = can('accounts')
  const stock = useStockAlerts().filter((a) => showStock && (!myBranch || a.branch === myBranch))
  const entries = useEntries()
  const settlements = useSettlements()
  const terms = usePartnerTerms()
  const recon = useMemo(() => showRecon ? reconcileAlerts(entries, settlements, terms).filter((a) => !myBranch || a.branch === myBranch) : [], [entries, settlements, terms, showRecon, myBranch])
  const [sound, setSound] = useState(soundOn())
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState(canPop() ? Notification.permission : 'denied')
  const box = useRef<HTMLDivElement>(null)

  const [stockPop, setStockPop] = useFresh(stock, showStock, stockSeen, stockVisit, (fresh) =>
    notify(fresh.length === 1 ? 'Stock running low' : `${fresh.length} items running low`,
      fresh.slice(0, 4).map((a) => `${a.item}: ${Math.max(0, a.onHand)} ${a.unit} left at ${branchName(a.branch)}`).join('; ') + (fresh.length > 4 ? `; +${fresh.length - 4} more` : ''), 'bti-stock'))
  const [reconPop, setReconPop] = useFresh(recon, showRecon, reconSeen, reconVisit, (fresh) =>
    notify(fresh.length === 1 ? 'Reconcile not matching' : `${fresh.length} statements not matching`,
      fresh.slice(0, 3).map((a) => `${reconTitle(a)}, week of ${niceDate(a.week)}: ${a.problems[0]}`).join('; ') + (fresh.length > 3 ? `; +${fresh.length - 3} more` : ''), 'bti-reconcile'))

  // A reconcile that doesn't match is announced with a sound whenever its message comes up.
  const reconKey = reconPop.map((a) => a.id).join(',')
  useEffect(() => { if (reconKey) playAlertSound() }, [reconKey])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  if (!showStock && !showRecon) return null
  const n = stock.length + recon.length
  const finished = stockPop.filter((a) => a.why === 'out').length
  const label = [stock.length && `${stock.length} items running low`, recon.length && `${recon.length} reconcile not matching`].filter(Boolean).join(', ')

  const messages = (stockPop.length > 0 || reconPop.length > 0) && createPortal(
    <div className="pointer-events-none fixed inset-x-4 top-16 z-[60] mx-auto flex max-w-md flex-col gap-3 sm:left-auto sm:right-6 sm:mx-0 sm:w-[400px]">
      {reconPop.length > 0 && (
        <div role="alert" aria-live="assertive" data-testid="reconcile-popup" className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-2xl">
          <div className="flex items-start gap-3 bg-amber-50 px-4 py-3">
            <Scale size={20} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{reconPop.length === 1 ? 'Reconcile is not matching' : `${reconPop.length} statements are not matching`}</p>
              <p className="text-xs text-amber-800">Check the statement in Reconcile.</p>
            </div>
            <button aria-label="Close reconcile message" className="text-amber-500 hover:text-amber-800" onClick={() => setReconPop([])}><X size={18} /></button>
          </div>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
            {reconPop.slice(0, 4).map((a) => (
              <li key={a.id}>
                <Link to={reconLink(a)} onClick={() => setReconPop([])} className="block px-4 py-2 text-sm hover:bg-slate-50">
                  <b className="font-medium text-slate-900">{reconTitle(a)}</b> <span className="text-slate-500">· week of {niceDate(a.week)}</span>
                  <span className="block text-xs text-amber-800">{a.problems.join('; ')}</span>
                </Link>
              </li>
            ))}
            {reconPop.length > 4 && <li className="px-4 py-2 text-xs text-slate-500">+{reconPop.length - 4} more, see the bell</li>}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <Link to={reconPop.length === 1 ? reconLink(reconPop[0]) : `/admin/accounting/reconcile?week=${reconPop[0].week}`} onClick={() => setReconPop([])} className="text-sm font-medium text-[#7a2228] hover:underline">Check reconcile</Link>
            <span className="text-xs text-slate-400">Saved under the bell</span>
          </div>
          <Bar items={reconPop} tone="bg-amber-400" />
        </div>
      )}
      {stockPop.length > 0 && (
        <div role="alert" aria-live="assertive" data-testid="stock-popup" className="pointer-events-auto overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl">
          <div className="flex items-start gap-3 bg-rose-50 px-4 py-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-800">{stockPop.length === 1 ? 'This item is getting over' : `These ${stockPop.length} items are getting over`}</p>
              <p className="text-xs text-rose-700">{finished ? `${finished} already finished. ` : ''}Reorder or raise an indent.</p>
            </div>
            <button aria-label="Close message" className="text-rose-400 hover:text-rose-700" onClick={() => setStockPop([])}><X size={18} /></button>
          </div>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
            {stockPop.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0"><b className="font-medium text-slate-900">{a.item}</b> <span className="text-slate-500">· {branchName(a.branch)}</span></span>
                <span className={`shrink-0 font-semibold tabular-nums ${a.why === 'out' ? 'text-rose-600' : 'text-amber-700'}`}>{a.why === 'out' ? 'finished' : `${a.onHand} ${a.unit || ''} left`}</span>
              </li>
            ))}
            {stockPop.length > 6 && <li className="px-4 py-2 text-xs text-slate-500">+{stockPop.length - 6} more, see the bell</li>}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <Link to="/admin/inventory/items?tab=low" onClick={() => setStockPop([])} className="text-sm font-medium text-[#7a2228] hover:underline">View items</Link>
            <span className="text-xs text-slate-400">Saved under the bell</span>
          </div>
          <Bar items={stockPop} tone="bg-rose-400" />
        </div>
      )}
      <style>{'@keyframes alertPopupBar { from { transform: scaleX(1) } to { transform: scaleX(0) } } @media (prefers-reduced-motion: reduce) { [role=alert] .origin-left { animation: none !important } }'}</style>
    </div>,
    document.body,
  )

  return (
    <div className="relative" ref={box}>
      {messages}
      <button className="relative text-slate-500 hover:text-slate-800" aria-label={n ? `Notifications: ${label}` : 'Notifications'} onClick={() => setOpen(!open)}>
        {n ? <BellRing size={18} className="text-rose-600" /> : <Bell size={18} />}
        {n > 0 && <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="max-h-[70vh] overflow-y-auto">
            {showRecon && (
              <section>
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Reconcile not matching</p>
                  <p className="text-xs text-slate-500">Partner statements where sales, net payout or money received don't tally, or commission or advertisement is above the agreed terms.</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {recon.map((a) => (
                    <li key={a.id}>
                      <Link to={reconLink(a)} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <FileWarning size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{reconTitle(a)} <span className="font-normal text-slate-500">· week of {niceDate(a.week)}</span></span>
                          {a.problems.map((p) => <span key={p} className="block text-xs text-slate-500">{p}</span>)}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {!recon.length && <li className="px-4 py-4 text-center text-sm text-slate-500">Everything matches.</li>}
                </ul>
              </section>
            )}
            {showStock && (
              <section className={showRecon ? 'border-t-4 border-slate-100' : ''}>
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Stock running low</p>
                  <p className="text-xs text-slate-500">From posted bills, goods sent from the Centre Kitchen and closing counts.</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {stock.map((a) => (
                    <li key={a.id}>
                      <Link to={stockLink(a)} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <PackageX size={16} className={`mt-0.5 shrink-0 ${a.why === 'out' ? 'text-rose-600' : 'text-amber-600'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{a.item} <span className="font-normal text-slate-500">· {branchName(a.branch)}</span></span>
                          <span className="block text-xs text-slate-500">{Math.max(0, a.onHand)} {a.unit || 'N/A'} left · {why(a)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                  {!stock.length && <li className="px-4 py-4 text-center text-sm text-slate-500">Nothing running low.</li>}
                </ul>
              </section>
            )}
          </div>
          {showRecon && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs">
              <button aria-label={sound ? 'Turn alert sound off' : 'Turn alert sound on'} className="inline-flex items-center gap-1.5 font-medium text-[#7a2228] hover:underline"
                onClick={() => { const next = !sound; setSoundOn(next); setSound(next); if (next) playAlertSound(true) }}>
                {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} Alert sound {sound ? 'on' : 'off'}
              </button>
              {sound && <button className="text-slate-500 hover:underline" onClick={() => playAlertSound(true)}>Play test sound</button>}
            </div>
          )}
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
