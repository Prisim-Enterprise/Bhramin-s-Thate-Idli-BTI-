import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { CONTROL_NAV, usePortalPath } from '../../components/Layout'
import { Card, PageHeader, Table } from '../../components/ui'
import { Tile } from '../../components/report'
import { DashboardPowerCard } from '../../components/DashboardPower'
import { useApp } from '../../context/AppContext'
import { BRANCHES, ROLES, branchName } from '../../data/mock'
import { fmtDateTime, niceDate } from '../../data/entries'
import { useReportData } from '../../data/analytics'
import { pettyLines } from '../../data/petty'
import { CK, useCentreKitchen } from '../../data/kitchen'
import { API_ON, getActivity, listLogins, readUsage, type Activity, type Login, type Usage } from '../../lib/api'
import { ConnectionStatus } from './DataFlow'

// The Control Panel is for Prisim to keep watch over the BTI dashboards:
// are the services up, who is using the dashboards, is every branch sending its data, and what needs fixing.
// (Business figures live in the dashboards themselves.)

const ACTION: Record<string, string> = { save: 'saved', delete: 'deleted', upload: 'uploaded', 'sarvam-read': 'read a handwritten bill' }
const KIND: Record<string, string> = {
  dayEntries: 'an Imprest Book day', bills: 'a bill', ledgers: 'a ledger', manualVouchers: 'a voucher', closingStock: 'a closing stock count',
  stockMoves: 'kitchen goods in/out', indents: 'an indent', files: 'a file', settings: 'a setting', permissions: 'permissions', system: 'the dashboard switch', users: 'a login',
}
const KIND_NAME: Record<string, string> = {
  dayEntries: 'Imprest Book days', bills: 'Bills', ledgers: 'Ledgers', manualVouchers: 'Vouchers', closingStock: 'Closing stock counts',
  stockMoves: 'Kitchen goods in/out', indents: 'Indents',
}
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).getTime()) / 86400000) : null)
const ago = (iso: string | null) => {
  const d = daysSince(iso)
  return d == null ? 'never' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

export default function ControlHome() {
  const { can } = useApp()
  const path = usePortalPath()
  const R = useReportData()
  const ck = useCentreKitchen()
  const [logins, setLogins] = useState<Login[] | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!API_ON) return
    setErrors([])
    const fail = (what: string) => (e: Error) => setErrors((x) => [...x, `${what}: ${e.message}`])
    listLogins().then(setLogins).catch(fail('Logins could not be loaded'))
    getActivity(30).then(setActivity).catch(fail('Activity could not be loaded'))
    readUsage().then(setUsage).catch(() => setUsage(null))
  }, [tick])

  // What each branch has sent, from the saved data itself.
  const branches = useMemo(() => BRANCHES.map((b) => {
    const days = R.d.entries.filter((e) => e.branch === b.id)
    const bills = R.d.bills.filter((x) => x.branch === b.id)
    const petty = pettyLines(R.d, { branch: b.id })
    const lastBook = days.map((e) => e.date).sort().pop() ?? null
    const lastBill = bills.map((x) => x.uploadedAt || x.date).filter(Boolean).sort().pop() ?? null
    const lastPetty = petty.map((l) => l.at || l.date).filter(Boolean).sort().pop() ?? null
    const lastAny = [lastBook, lastBill, lastPetty].filter(Boolean).sort().pop() ?? null
    return { b, books: days.length, lastBook, bills: bills.length, lastBill, petty: petty.length, lastAny }
  }), [R.d])
  const outlets = branches.filter((x) => x.b.id !== CK)
  const silent = outlets.filter((x) => (daysSince(x.lastAny) ?? 999) > 2)

  const active = logins?.filter((l) => l.active) ?? []
  const neverIn = active.filter((l) => !l.lastSignIn)
  const usedWeek = active.filter((l) => (daysSince(l.lastSignIn) ?? 999) <= 7)
  const events = activity ? [...activity.events].sort((a, b) => b.at.localeCompare(a.at)) : []
  const deletes = events.filter((e) => e.action === 'delete' && (daysSince(e.at) ?? 99) <= 7)
  const waitingBills = R.d.bills.filter((b) => !b.voucherId || !R.d.manual.some((m) => m.id === b.voucherId)).length
  const roleName = (id: string) => ROLES.find((r) => r.id === id)?.name ?? id
  const who = (email: string) => logins?.find((l) => l.email === email)?.name || email

  const issues: { tone: 'red' | 'amber'; text: string; to: string }[] = []
  errors.forEach((e) => issues.push({ tone: 'red', text: e, to: '/control/flow' }))
  if (silent.length) issues.push({ tone: 'amber', text: `${silent.length} outlet(s) have sent nothing in 2+ days: ${silent.map((x) => x.b.name).join(', ')}`, to: '/control/branches' })
  if (neverIn.length) issues.push({ tone: 'amber', text: `${neverIn.length} login(s) have never signed in: ${neverIn.map((l) => l.name || l.email).join(', ')}`, to: '/control/users' })
  if (waitingBills) issues.push({ tone: 'amber', text: `${waitingBills} bill(s) uploaded but not posted yet`, to: '/admin/accounting/bills' })
  if (deletes.length) issues.push({ tone: 'amber', text: `${deletes.length} record(s) deleted in the last 7 days`, to: '/control/activity' })
  if (usage && usage.used >= usage.limit) issues.push({ tone: 'amber', text: `All ${usage.limit} handwritten bill reads used today`, to: '/control/ocr' })
  if (ck.low.length) issues.push({ tone: 'amber', text: `${ck.low.length} Centre Kitchen item(s) at or below reorder level`, to: '/control/kitchen' })

  const summary: Record<string, string> = {
    '/control/restaurants': `Brahmins' Thatte Idli · ${BRANCHES.length} locations`,
    '/control/branches': `${outlets.filter((x) => x.lastBook).length} of ${outlets.length} outlets sending Imprest Books`,
    '/control/kitchen': `${ck.indents.filter((i) => i.status === 'open' || i.status === 'part').length} indent(s) waiting · ${ck.flows.length} movements`,
    '/control/sales': 'Payment modes and sales rules',
    '/control/expenses': 'Expense categories, budgets, approval limits',
    '/control/ocr': usage ? `${usage.used} of ${usage.limit} handwritten reads used today` : 'Sarvam for handwritten · 10 a day',
    '/control/purchases': 'Vendor and purchase rules',
    '/control/deductions': 'PF, ESI, professional tax and TDS rules',
    '/control/salary': 'Staff and monthly pay',
    '/control/users': logins ? `${active.length} active login(s) · ${logins.length - active.length} turned off` : 'Add logins, set role and branch, turn off, reset password',
    '/control/roles': `${ROLES.length} roles · saved for everyone, enforced by the server`,
    '/control/activity': activity ? `${activity.events.length} action(s) in the last 30 days` : 'Who saved, deleted, uploaded or changed what, and when',
    '/control/flow': 'Picture of how data flows from each login to the reports',
    '/control/integrations': 'POS, aggregators, AI models, network',
  }

  return (
    <>
      <PageHeader title="Prisim Control Panel" subtitle="Keep watch over the BTI dashboards: services, logins, usage and data from every branch"
        actions={API_ON && (
          <button onClick={() => setTick((t) => t + 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw size={15} /> Refresh
          </button>
        )} />
      <DashboardPowerCard />

      <h2 className="mb-2 text-sm font-semibold text-slate-800">Services</h2>
      <ConnectionStatus key={tick} activity={activity} logins={logins} />

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Active logins" value={logins ? String(active.length) : '—'} note={logins ? `${usedWeek.length} signed in this week · ${logins.length - active.length} turned off` : API_ON ? 'loading…' : 'not on the cloud'} />
        <Tile label="Actions (30 days)" value={activity ? String(activity.events.length) : '—'} note={activity ? `${new Set(activity.events.map((e) => e.email)).size} people · last ${events[0] ? ago(events[0].at) : 'never'}` : undefined} />
        <Tile label="Outlets sending data" value={`${outlets.filter((x) => (daysSince(x.lastAny) ?? 999) <= 2).length} / ${outlets.length}`} tone={silent.length ? 'amber' : 'green'} note="in the last 2 days" />
        <Tile label="Handwritten reads today" value={usage ? `${usage.used} / ${usage.limit}` : '—'} tone={usage && usage.used >= usage.limit ? 'amber' : 'slate'} note="Sarvam, shared by all logins" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Needs attention">
          {issues.length ? (
            <ul className="space-y-2">
              {issues.map((t) => (
                <li key={t.text}>
                  <Link to={t.to.startsWith('/control') ? path(t.to) : t.to} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm hover:opacity-80 ${t.tone === 'red' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />{t.text}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> All services up, every outlet sending data, nothing waiting.</p>}
        </Card>

        <Card title="Use per day (30 days)">
          {activity?.daily.length ? (
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={activity.daily.map((d) => ({ ...d, label: new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))}>
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} width={32} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="n" name="Actions" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-500">{API_ON ? 'No activity yet.' : 'Activity is tracked on the cloud.'}</p>}
        </Card>
      </div>

      <Card title="Data from each branch" className="mt-4" pad={false} actions={<Link to={path('/control/branches')} className="text-xs font-medium text-[#7a2228]">Branch Integrations →</Link>}>
        <Table head={['Branch', 'Imprest Books', 'Last Imprest Book', 'Bills', 'Last bill', 'Petty entries', 'Last sent']}>
          {branches.map((x) => {
            const d = daysSince(x.lastAny)
            return (
              <tr key={x.b.id}>
                <td className="font-medium text-slate-900">{x.b.name}</td>
                <td className="tabular-nums">{x.b.id === CK ? '—' : x.books}</td>
                <td className={x.lastBook ? '' : 'text-slate-400'}>{x.b.id === CK ? '—' : x.lastBook ? niceDate(x.lastBook) : 'none yet'}</td>
                <td className="tabular-nums">{x.bills}</td>
                <td className={x.lastBill ? '' : 'text-slate-400'}>{x.lastBill ? niceDate(x.lastBill.slice(0, 10)) : 'none yet'}</td>
                <td className="tabular-nums">{x.petty}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d == null ? 'bg-slate-100 text-slate-500' : d <= 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ago(x.lastAny)}</span></td>
              </tr>
            )
          })}
        </Table>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Logins" pad={false} actions={can('users') && <Link to={path('/control/users')} className="text-xs font-medium text-[#7a2228]">Manage →</Link>}>
          {logins ? (
            <Table head={['Name', 'Role · branch', 'Last signed in']}>
              {[...logins].sort((a, b) => (b.lastSignIn ?? '').localeCompare(a.lastSignIn ?? '')).map((l) => (
                <tr key={l.id}>
                  <td><p className="font-medium text-slate-900">{l.name || l.email}</p>{l.name && <p className="text-xs text-slate-500">{l.email}</p>}</td>
                  <td>{roleName(l.role)} · {!l.branch || l.branch === 'HO' ? 'All branches' : branchName(l.branch)}</td>
                  <td className={!l.active ? 'text-rose-600' : l.lastSignIn ? 'text-slate-600' : 'text-amber-600'}>{!l.active ? 'Turned off' : l.lastSignIn ? fmtDateTime(l.lastSignIn) : 'Never'}</td>
                </tr>
              ))}
            </Table>
          ) : <p className="p-4 text-sm text-slate-500">{API_ON ? 'Loading…' : 'Logins are managed on the cloud.'}</p>}
        </Card>

        <Card title="Latest activity" pad={false} actions={<Link to={path('/control/activity')} className="text-xs font-medium text-[#7a2228]">All activity →</Link>}>
          {events.length ? (
            <Table head={['When', 'Who', 'What']}>
              {events.slice(0, 12).map((e, i) => (
                <tr key={i}><td className="whitespace-nowrap text-slate-500">{fmtDateTime(e.at)}</td><td>{who(e.email)}</td>
                  <td>{ACTION[e.action] ?? e.action}{e.action === 'sarvam-read' ? '' : ' ' + (KIND[e.kind] ?? e.kind)}</td></tr>
              ))}
            </Table>
          ) : <p className="p-4 text-sm text-slate-500">{API_ON ? 'Nothing yet.' : 'Activity is tracked on the cloud.'}</p>}
        </Card>
      </div>

      {activity && activity.stored.length > 0 && (
        <Card title="Stored on the cloud" className="mt-4" pad={false}>
          <Table head={['What', 'Records', 'People who added them', 'Last change']}>
            {activity.stored.map((s) => (
              <tr key={s.kind}><td className="font-medium text-slate-900">{KIND_NAME[s.kind] ?? s.kind}</td><td className="tabular-nums">{s.n}</td><td className="tabular-nums">{s.people}</td><td className="text-slate-500">{s.last ? fmtDateTime(s.last) : '—'}</td></tr>
            ))}
          </Table>
        </Card>
      )}

      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-800">Settings</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CONTROL_NAV.filter((n) => n.to !== '/control' && can(n.module)).map((n) => {
          const Icon = n.icon
          return (
            <Link key={n.to} to={path(n.to)} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Icon size={18} /></span>
                <p className="font-medium text-slate-900 group-hover:text-brand-700">{n.label}</p>
              </div>
              <p className="mt-3 text-sm text-slate-500">{summary[n.to]}</p>
            </Link>
          )
        })}
      </div>
    </>
  )
}
