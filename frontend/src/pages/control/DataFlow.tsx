import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Brain, Building2, ChefHat, Cloud, Database, FileText, HardDrive, KeyRound, PencilLine, RefreshCw, ScanLine, Server, Settings2, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, PageHeader, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { ROLES, branchName, type ModuleId, type RoleId } from '../../data/mock'
import { fmtDateTime } from '../../data/entries'
import { API_ON, apiHealth, getActivity, listLogins, readUsage, type Activity, type Login, type Usage } from '../../lib/api'

/* ---------- The map: screens, stores, reports and how they connect ---------- */

type Screen = { id: string; label: string; icon: LucideIcon; view: ModuleId[]; write: [ModuleId, ('create' | 'edit' | 'approve')[]][]; writes: string[]; note: string }
const SCREENS: Screen[] = [
  { id: 'entry', label: 'Imprest Book / day entry', icon: PencilLine, view: ['accounts', 'sales'], write: [['accounts', ['create', 'edit']], ['sales', ['create', 'edit']]], writes: ['dayEntries'], note: 'Upload Imprest Book PDFs or type a day in' },
  { id: 'inbox', label: 'OCR Bill Inbox', icon: ScanLine, view: ['ocr'], write: [['ocr', ['create', 'edit']]], writes: ['bills', 'files', 'sarvam'], note: 'Upload bills; handwritten ones read by Sarvam' },
  { id: 'post', label: 'Post bill to ledger', icon: ShieldCheck, view: ['ocr'], write: [['ocr', ['approve']]], writes: ['vouchers'], note: 'Checked bill → purchase voucher' },
  { id: 'books', label: 'Account Books', icon: BookOpen, view: ['accounts'], write: [['accounts', ['create', 'edit']]], writes: ['vouchers', 'files'], note: 'Ledgers, vouchers, receipts' },
  { id: 'reports', label: 'Reports', icon: FileText, view: ['sales', 'expenses', 'purchase', 'deductions', 'salary'], write: [], writes: [], note: 'Read only, worked out automatically' },
  { id: 'kitchen', label: 'Kitchen (indents, stock, POs)', icon: ChefHat, view: ['indent', 'purchase'], write: [['indent', ['create', 'edit']]], writes: ['local'], note: 'Kept in the browser for now' },
  { id: 'control', label: 'Control Panel', icon: Settings2, view: ['users', 'settings'], write: [['users', ['edit']], ['settings', ['edit']]], writes: ['auth', 'settings'], note: 'Logins, permissions, dashboards on/off' },
]
const STORES: { id: string; label: string; where: string; icon: LucideIcon; kinds: string[] }[] = [
  { id: 'dayEntries', label: 'Day entries', where: 'Cloudflare D1', icon: Database, kinds: ['dayEntries'] },
  { id: 'bills', label: 'Bills', where: 'Cloudflare D1', icon: Database, kinds: ['bills'] },
  { id: 'vouchers', label: 'Vouchers & ledgers', where: 'Cloudflare D1', icon: Database, kinds: ['manualVouchers', 'ledgers'] },
  { id: 'files', label: 'Bill & receipt files', where: 'Cloudflare R2', icon: HardDrive, kinds: [] },
  { id: 'sarvam', label: 'Handwriting reader', where: 'Sarvam AI · 10 a day', icon: Brain, kinds: [] },
  { id: 'settings', label: 'Permissions, switch, activity log', where: 'Cloudflare D1', icon: Database, kinds: [] },
  { id: 'auth', label: 'Logins & passwords', where: 'Supabase Auth', icon: KeyRound, kinds: [] },
  { id: 'local', label: 'Kitchen data', where: 'This browser only', icon: Building2, kinds: [] },
]
const REPORTS: { id: string; label: string; to: string; from: string[] }[] = [
  { id: 'r-sales', label: 'Sales Report', to: '/admin/accounting/sales', from: ['dayEntries'] },
  { id: 'r-exp', label: 'Expenses Report', to: '/admin/accounting/expenses', from: ['dayEntries', 'vouchers'] },
  { id: 'r-pur', label: 'Purchases Report', to: '/admin/accounting/purchases', from: ['dayEntries', 'vouchers', 'bills'] },
  { id: 'r-food', label: 'Food Cost Report', to: '/admin/accounting/costing', from: ['dayEntries', 'vouchers'] },
  { id: 'r-pnl', label: 'Profit & Loss', to: '/admin/accounting/pnl', from: ['dayEntries', 'vouchers'] },
  { id: 'r-ded', label: 'Deductions Report', to: '/admin/accounting/deductions', from: ['dayEntries', 'vouchers'] },
  { id: 'r-books', label: 'Account Books', to: '/admin/accounting/books', from: ['dayEntries', 'vouchers', 'files'] },
]
// Sarvam's answer goes back into the bill.
const EXTRA_EDGES: [string, string][] = [['sarvam', 'r-pur']]

/* ---------- Drawing ---------- */

type Edge = { from: string; to: string; kind: 'write' | 'view' | 'feed'; on: boolean }

function Node({ id, refs, on, dim, children, className = '' }: { id: string; refs: React.MutableRefObject<Map<string, HTMLElement>>; on: boolean; dim: boolean; children: ReactNode; className?: string }) {
  return (
    <div ref={(el) => { if (el) refs.current.set(id, el); else refs.current.delete(id) }} data-node={id}
      className={`relative z-10 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm transition ${on ? 'border-[#7a2228] ring-2 ring-[#7a2228]/15' : 'border-slate-200'} ${dim ? 'opacity-35' : ''} ${className}`}>
      {children}
    </div>
  )
}

function Wires({ box, refs, edges, tick }: { box: React.RefObject<HTMLDivElement>; refs: React.MutableRefObject<Map<string, HTMLElement>>; edges: Edge[]; tick: number }) {
  const [paths, setPaths] = useState<{ d: string; e: Edge }[]>([])
  useLayoutEffect(() => {
    const root = box.current?.getBoundingClientRect()
    if (!root) return
    const out: { d: string; e: Edge }[] = []
    for (const e of edges) {
      const a = refs.current.get(e.from)?.getBoundingClientRect()
      const b = refs.current.get(e.to)?.getBoundingClientRect()
      if (!a || !b) continue
      const x1 = a.right - root.left, y1 = a.top + a.height / 2 - root.top
      const x2 = b.left - root.left, y2 = b.top + b.height / 2 - root.top
      const mx = (x1 + x2) / 2
      out.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, e })
    }
    setPaths(out)
  }, [edges, tick, box, refs])
  const color = (e: Edge) => (!e.on ? '#e2e8f0' : e.kind === 'write' ? '#7a2228' : e.kind === 'view' ? '#94a3b8' : '#d9a441')
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        {['#7a2228', '#94a3b8', '#d9a441', '#e2e8f0'].map((c) => (
          <marker key={c} id={'arr' + c.slice(1)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>
        ))}
      </defs>
      {[...paths].sort((p) => (p.e.on ? 1 : -1)).map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={color(p.e)} strokeWidth={p.e.on ? 2 : 1.2} strokeDasharray={p.e.kind === 'view' ? '5 4' : undefined}
          markerEnd={`url(#arr${color(p.e).slice(1)})`} />
      ))}
    </svg>
  )
}

/* ---------- Live connection status ---------- */

type Health = { api: boolean | null; usage: Usage | null }
function StatusPill({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok == null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-xs text-slate-500">{detail}</span></span>
    </div>
  )
}

/** Live status of each service. Loads the activity itself when the page doesn't pass it in. */
export function ConnectionStatus(props: { activity?: Activity | null; logins?: Login[] | null }) {
  const auth = useAuth()
  const [h, setH] = useState<Health>({ api: null, usage: null })
  const [own, setOwn] = useState<Activity | null>(null)
  const activity = props.activity !== undefined ? props.activity : own
  const logins = props.logins ?? null
  const needOwn = props.activity === undefined
  useEffect(() => {
    if (!API_ON) return
    if (needOwn) getActivity(30).then(setOwn).catch(() => setOwn(null))
    void apiHealth().then((api) => setH((x) => ({ ...x, api })))
    readUsage().then((usage) => setH((x) => ({ ...x, usage }))).catch(() => { /* not set up */ })
  }, [needOwn])
  const uploads = activity?.perKind.filter((k) => k.action === 'upload').reduce((s, k) => s + k.n, 0) ?? 0
  const stored = activity?.stored.reduce((s, k) => s + k.n, 0) ?? 0
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatusPill ok={!!auth.session || !auth.enabled ? (auth.enabled ? true : null) : false} label="Supabase (logins)" detail={auth.enabled ? (logins ? `${logins.length} logins` : 'Signed in') : 'Demo mode'} />
      <StatusPill ok={API_ON ? h.api : null} label="BTI API (Cloudflare)" detail={!API_ON ? 'Off' : h.api == null ? 'Checking…' : h.api ? 'Reachable · checks every request' : 'Not reachable'} />
      <StatusPill ok={activity ? true : API_ON ? null : null} label="D1 database" detail={activity ? `${stored} records stored` : 'Waiting for API'} />
      <StatusPill ok={activity ? true : null} label="R2 file storage" detail={activity ? `${uploads} file uploads in ${activity.days} days` : 'Waiting for API'} />
      <StatusPill ok={h.usage ? true : API_ON ? null : null} label="Sarvam (handwriting)" detail={h.usage ? `${h.usage.used} of ${h.usage.limit} read today` : 'Not checked'} />
      <StatusPill ok={true} label="Website (Vercel)" detail={location.host} />
    </div>
  )
}

/* ---------- Page ---------- */

export default function DataFlow() {
  const { permissions } = useApp()
  const [logins, setLogins] = useState<Login[] | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [pick, setPick] = useState('') // '' = everyone, 'role:x', or an email
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const [tick, setTick] = useState(0)

  const load = () => {
    if (!API_ON) return
    setError(null)
    listLogins().then(setLogins).catch((e: Error) => { setLogins(null); setError(e.message) })
    getActivity(30).then(setActivity).catch((e: Error) => setError(e.message))
  }
  useEffect(load, [])
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const can = (r: RoleId, m: ModuleId, a = 'view') => permissions[r]?.[m]?.includes(a as never) ?? false
  const sees = (r: RoleId, s: Screen) => s.view.some((m) => can(r, m))
  const writes = (r: RoleId, s: Screen) => s.write.some(([m, acts]) => acts.some((a) => can(r, m, a)))

  const pickedLogin = logins?.find((l) => l.email === pick)
  const pickedRole: RoleId | null = pick.startsWith('role:') ? (pick.slice(5) as RoleId) : (pickedLogin?.role as RoleId | undefined) ?? null
  const roles = ROLES.filter((r) => !pickedRole || r.id === pickedRole)

  // Which nodes and wires are lit for the current pick.
  const { edges, lit } = useMemo(() => {
    const e: Edge[] = []
    const litSet = new Set<string>()
    for (const r of ROLES) for (const s of SCREENS) {
      if (!sees(r.id, s)) continue
      const on = !pickedRole || r.id === pickedRole
      e.push({ from: 'role:' + r.id, to: s.id, kind: writes(r.id, s) ? 'write' : 'view', on })
      if (on) { litSet.add('role:' + r.id); litSet.add(s.id) }
    }
    for (const s of SCREENS) for (const st of s.writes) {
      const on = litSet.has(s.id) && (!pickedRole || writes(pickedRole, s))
      e.push({ from: s.id, to: st, kind: 'write', on })
      if (on) litSet.add(st)
    }
    const readsReports = !pickedRole || sees(pickedRole, SCREENS.find((s) => s.id === 'reports')!) || can(pickedRole, 'accounts')
    for (const r of REPORTS) for (const f of r.from) {
      const on = readsReports
      e.push({ from: f, to: r.id, kind: 'feed', on })
      if (on) { litSet.add(r.id); litSet.add(f) }
    }
    for (const [f, t] of EXTRA_EDGES) e.push({ from: f, to: t, kind: 'feed', on: readsReports && litSet.has(f) })
    return { edges: e, lit: litSet }
  }, [pickedRole, permissions]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => setTick((t) => t + 1), [pick, logins])

  // What a login (or everyone) actually did in the last 30 days, per kind.
  const did = (email: string | null, kinds: string[], action = 'save') =>
    (activity?.perUser ?? []).filter((u) => (!email || u.email === email) && u.action === action && kinds.includes(u.kind)).reduce((s, u) => s + u.n, 0)
  const storeCount = (st: (typeof STORES)[number]) => {
    if (st.id === 'files') return did(pickedLogin?.email ?? null, ['file'], 'upload')
    if (st.id === 'sarvam') return (activity?.events ?? []).filter((e) => e.action === 'sarvam-read' && (!pickedLogin || e.email === pickedLogin.email)).length
    if (!st.kinds.length) return null
    return pickedLogin ? did(pickedLogin.email, st.kinds) : activity?.stored.filter((s) => st.kinds.includes(s.kind)).reduce((s, k) => s + k.n, 0) ?? 0
  }
  const peopleIn = (r: RoleId) => (logins ?? []).filter((l) => l.role === r)

  return (
    <>
      <PageHeader title="Data Flow & Integrations" subtitle="How data moves from each login, through the screens, into the cloud and out to the reports"
        actions={<>
          <select aria-label="Show flow for" className={inputCls + ' !w-auto'} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Everyone</option>
            <optgroup label="Role">{ROLES.map((r) => <option key={r.id} value={'role:' + r.id}>{r.name}</option>)}</optgroup>
            {logins && logins.length > 0 && <optgroup label="Login">{logins.map((l) => <option key={l.id} value={l.email}>{l.name || l.email}</option>)}</optgroup>}
          </select>
          <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        </>} />
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold text-slate-800">Connections, live</h2>
      <ConnectionStatus activity={activity} logins={logins} />

      <Card className="mt-4" title={pickedLogin ? `Flow for ${pickedLogin.name || pickedLogin.email} (${ROLES.find((r) => r.id === pickedLogin.role)?.name}, ${pickedLogin.branch === 'HO' ? 'all branches' : branchName(pickedLogin.branch)})` : pickedRole ? `Flow for the ${ROLES.find((r) => r.id === pickedRole)?.name} role` : 'Flow for every login'}
        actions={<span className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-[#7a2228]" /> can change</span>
          <span className="flex items-center gap-1"><span className="h-0 w-5 border-t-2 border-dashed border-slate-400" /> view only</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-[#d9a441]" /> feeds report</span>
        </span>}>
        <div className="overflow-x-auto">
          <div ref={box} className="relative grid min-w-[980px] grid-cols-4 gap-x-16 py-2">
            {[
              { title: '1 · Who signs in', items: roles.map((r) => (
                <Node key={r.id} id={'role:' + r.id} refs={refs} on={!!pickedRole} dim={false}>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-slate-500">{logins ? `${peopleIn(r.id).length} login(s)` : r.desc}</p>
                  {pickedLogin && <p className="mt-1 text-xs font-medium text-[#7a2228]">{pickedLogin.email}</p>}
                </Node>
              )) },
              { title: '2 · What they use', items: SCREENS.map((s) => (
                <Node key={s.id} id={s.id} refs={refs} on={!!pickedRole && lit.has(s.id)} dim={!lit.has(s.id)}>
                  <p className="flex items-center gap-1.5 font-medium"><s.icon size={15} className="text-[#7a2228]" />{s.label}</p>
                  <p className="text-xs text-slate-500">{s.note}</p>
                </Node>
              )) },
              { title: '3 · Where it is kept', items: STORES.map((st) => {
                const n = storeCount(st)
                return (
                  <Node key={st.id} id={st.id} refs={refs} on={!!pickedRole && lit.has(st.id)} dim={!lit.has(st.id)}>
                    <p className="flex items-center justify-between gap-2 font-medium"><span className="flex items-center gap-1.5"><st.icon size={15} className="text-slate-500" />{st.label}</span>
                      {n != null && activity && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{n}{pickedLogin ? ' by them' : ''}</span>}</p>
                    <p className="text-xs text-slate-500">{st.where}</p>
                  </Node>
                )
              }) },
              { title: '4 · What it feeds', items: REPORTS.map((r) => (
                <Node key={r.id} id={r.id} refs={refs} on={!!pickedRole && lit.has(r.id)} dim={!lit.has(r.id)}>
                  <Link to={r.to} className="font-medium hover:text-[#7a2228] hover:underline">{r.label}</Link>
                </Node>
              )) },
            ].map((col) => (
              <div key={col.title} className="flex flex-col justify-center gap-2.5">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#7a2228]">{col.title}</p>
                {col.items}
              </div>
            ))}
            {/* Last, so every box above has reported where it is before the arrows are drawn. */}
            <Wires box={box} refs={refs} edges={edges} tick={tick} />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Server size={13} /> Every arrow into the cloud goes through the BTI API, which checks the login, the role's permissions and the branch before saving anything.
          <Cloud size={13} className="ml-1" /> Counts are for the last 30 days.
        </p>
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Every login, at a glance</h2>
      {!logins && <Card><p className="text-sm text-slate-500">{API_ON ? 'Loading logins…' : 'Logins show here when the cloud is on.'}</p></Card>}
      <div className="space-y-2">
        {(logins ?? []).map((l) => {
          const r = l.role as RoleId
          const screens = SCREENS.filter((s) => sees(r, s))
          const changes = SCREENS.filter((s) => writes(r, s))
          const counts = [
            ['day-entry saves', did(l.email, ['dayEntries'])], ['bill saves', did(l.email, ['bills'])], ['voucher/ledger saves', did(l.email, ['manualVouchers', 'ledgers'])],
            ['file uploads', did(l.email, ['file'], 'upload')],
          ].filter(([, n]) => n) as [string, number][]
          const last = (activity?.perUser ?? []).filter((u) => u.email === l.email).map((u) => u.last).sort().pop()
          return (
            <div key={l.id} className={`flex flex-wrap items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm ${l.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <button className="min-w-[180px] text-left" onClick={() => { setPick(l.email); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <span className="block font-semibold text-slate-900 hover:text-[#7a2228]">{l.name || l.email.split('@')[0]}</span>
                <span className="block text-xs text-slate-500">{ROLES.find((x) => x.id === r)?.name} · {l.branch === 'HO' ? 'all branches' : branchName(l.branch)}{l.active ? '' : ' · turned off'}</span>
              </button>
              <ArrowRight size={16} className="text-slate-300" />
              <span className="flex flex-wrap gap-1">
                {screens.map((s) => <Badge key={s.id} tone={changes.includes(s) ? 'blue' : 'slate'}>{s.label}</Badge>)}
                {!screens.length && <span className="text-slate-400">no screens</span>}
              </span>
              <ArrowRight size={16} className="text-slate-300" />
              <span className="text-slate-700">{counts.length ? counts.map(([k, n]) => `${n} ${k}`).join(' · ') : 'nothing saved in 30 days'}</span>
              <span className="ml-auto text-xs text-slate-500">{last ? `last active ${fmtDateTime(last)}` : l.lastSignIn ? `signed in ${fmtDateTime(l.lastSignIn)}` : 'never signed in'}</span>
              <Link to={`/control/activity?email=${encodeURIComponent(l.email)}`} className="text-xs font-medium text-[#7a2228] hover:underline">Activity</Link>
            </div>
          )
        })}
      </div>
    </>
  )
}
