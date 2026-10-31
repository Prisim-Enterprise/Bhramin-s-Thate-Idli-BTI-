import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Table, inputCls } from '../../components/ui'
import { Tile } from '../../components/report'
import { fmtDateTime } from '../../data/entries'
import { API_ON, getActivity, listLogins, type Activity, type ActivityEvent, type Login } from '../../lib/api'

export const KIND_NAMES: Record<string, string> = {
  dayEntries: 'Day entry', bills: 'Bill', manualVouchers: 'Voucher', ledgers: 'Ledger', file: 'File', bill: 'Bill',
  login: 'Login', settings: 'Settings', system: 'Dashboards',
}

/** One audit row in plain words. */
export function describe(e: ActivityEvent): { text: string; tone: 'green' | 'red' | 'blue' | 'amber' | 'violet' | 'slate' } {
  const what = KIND_NAMES[e.kind] ?? e.kind
  switch (e.action) {
    case 'save': return { text: `Saved ${what.toLowerCase()} ${e.id.length > 24 ? e.id.slice(0, 8) + '…' : e.id}`, tone: 'blue' }
    case 'delete': return { text: `Deleted ${what.toLowerCase()} ${e.id.length > 24 ? e.id.slice(0, 8) + '…' : e.id}`, tone: 'red' }
    case 'upload': return { text: `Uploaded file ${e.id.split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? ''}`, tone: 'violet' }
    case 'sarvam-read': return { text: `Handwritten bill read by Sarvam (${e.id} page${e.id === '1' ? '' : 's'})`, tone: 'violet' }
    case 'login-create': return { text: `Created login ${e.id}`, tone: 'green' }
    case 'login-change': return { text: `Changed login ${e.id}`, tone: 'amber' }
    case 'permissions': return { text: 'Changed role permissions', tone: 'amber' }
    case 'turn-off': return { text: 'Turned the dashboards OFF', tone: 'red' }
    case 'turn-on': return { text: 'Turned the dashboards ON', tone: 'green' }
    default: return { text: `${e.action} ${what} ${e.id}`, tone: 'slate' }
  }
}

// Everything done through the dashboards, from the API's audit log: who, what and when.
export default function ActivityLog() {
  const [params, setParams] = useSearchParams()
  const email = params.get('email') ?? ''
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Activity | null>(null)
  const [logins, setLogins] = useState<Login[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!API_ON) return
    setLoading(true)
    setError(null)
    getActivity(days, email).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [days, email]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (API_ON) listLogins().then(setLogins).catch(() => setLogins([])) }, [])

  const people = useMemo(() => {
    const m = new Map<string, { email: string; saves: number; deletes: number; uploads: number; reads: number; admin: number; last: string }>()
    for (const r of data?.perUser ?? []) {
      const p = m.get(r.email) ?? { email: r.email, saves: 0, deletes: 0, uploads: 0, reads: 0, admin: 0, last: '' }
      if (r.action === 'save') p.saves += r.n
      else if (r.action === 'delete') p.deletes += r.n
      else if (r.action === 'upload') p.uploads += r.n
      else if (r.action === 'sarvam-read') p.reads += r.n
      else p.admin += r.n
      if (r.last > p.last) p.last = r.last
      m.set(r.email, p)
    }
    return [...m.values()].sort((a, b) => b.last.localeCompare(a.last))
  }, [data])

  const count = (action: string) => (data?.perKind ?? []).filter((k) => k.action === action).reduce((s, k) => s + k.n, 0)
  const nameOf = (e: string) => logins.find((l) => l.email === e)?.name || e
  const roleOf = (e: string) => logins.find((l) => l.email === e)?.role

  if (!API_ON) {
    return <><PageHeader title="Activity" subtitle="Who did what, and when" /><Card><p className="text-sm text-slate-600">Activity is recorded by the cloud API. Sign in with the cloud turned on to see it.</p></Card></>
  }

  return (
    <>
      <PageHeader title="Activity" subtitle={email ? `Everything ${nameOf(email)} did` : 'Every save, delete, upload, bill read and setting change, by login'}
        actions={<>
          <select aria-label="Login" className={inputCls + ' !w-auto'} value={email} onChange={(e) => setParams(e.target.value ? { email: e.target.value } : {})}>
            <option value="">Everyone</option>
            {[...new Set([...logins.map((l) => l.email), ...people.map((p) => p.email)])].sort().map((e) => <option key={e} value={e}>{nameOf(e)}</option>)}
          </select>
          <select aria-label="Period" className={inputCls + ' !w-auto'} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d === 1 ? 'Today and yesterday' : `Last ${d} days`}</option>)}
          </select>
          <Button variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
        </>} />
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile label="Records saved" value={String(count('save'))} />
        <Tile label="Deleted" value={String(count('delete'))} tone={count('delete') ? 'amber' : 'slate'} />
        <Tile label="Files uploaded" value={String(count('upload'))} />
        <Tile label="Sarvam bill reads" value={String((data?.events ?? []).filter((e) => e.action === 'sarvam-read').reduce((s, e) => s + (Number(e.id) || 1), 0))} note="pages" />
        <Tile label="Logins active" value={String(people.length)} note={`in ${days === 1 ? '2 days' : days + ' days'}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Actions per day" className="lg:col-span-3">
          {data?.daily.length ? (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={data.daily.map((d) => ({ ...d, label: new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} width={30} />
                  <Tooltip />
                  <Bar dataKey="n" name="Actions" fill="#7a2228" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-500">{loading ? 'Loading…' : 'Nothing happened in this period.'}</p>}
        </Card>
        <Card title="Stored in the cloud now" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {(data?.stored ?? []).map((s) => (
              <li key={s.kind} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span><span className="block font-medium">{KIND_NAMES[s.kind] ?? s.kind}s</span><span className="text-xs text-slate-500">last change {fmtDateTime(s.last)} · {s.people} people</span></span>
                <b className="tabular-nums">{s.n}</b>
              </li>
            ))}
            {!data?.stored.length && <li className="px-4 py-3 text-sm text-slate-500">Nothing stored yet.</li>}
          </ul>
        </Card>
      </div>

      {!email && (
        <Card title="By login" className="mt-4" pad={false}>
          <Table head={['Login', 'Saved', 'Deleted', 'Uploads', 'Bill reads', 'Settings', 'Last active', '']}>
            {people.map((p) => (
              <tr key={p.email}>
                <td><p className="font-medium text-slate-900">{nameOf(p.email)}</p><p className="text-xs text-slate-500">{p.email}{roleOf(p.email) ? ` · ${roleOf(p.email)}` : ''}</p></td>
                <td className="tabular-nums">{p.saves}</td>
                <td className={`tabular-nums ${p.deletes ? 'text-rose-600' : ''}`}>{p.deletes}</td>
                <td className="tabular-nums">{p.uploads}</td>
                <td className="tabular-nums">{p.reads}</td>
                <td className="tabular-nums">{p.admin}</td>
                <td className="text-slate-500">{fmtDateTime(p.last)}</td>
                <td className="text-right"><button className="text-sm font-medium text-[#7a2228] hover:underline" onClick={() => setParams({ email: p.email })}>Details</button></td>
              </tr>
            ))}
            {!people.length && <tr><td colSpan={8} className="!py-6 text-center text-slate-500">No activity in this period.</td></tr>}
          </Table>
        </Card>
      )}

      <Card title={`Latest ${data?.events.length ?? 0} actions`} className="mt-4" pad={false}
        actions={email && <Link to="/control/flow" className="text-xs font-medium text-[#7a2228]">See this login's data flow →</Link>}>
        <Table head={['When', 'Who', 'What']}>
          {(data?.events ?? []).map((e, i) => {
            const d = describe(e)
            return (
              <tr key={i}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(e.at)}</td>
                <td>{nameOf(e.email)}</td>
                <td><Badge tone={d.tone}>{e.action.replace('sarvam-read', 'read')}</Badge> <span className="ml-1">{d.text}</span></td>
              </tr>
            )
          })}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">Recorded by the BTI API for every change; it can't be edited from the dashboards. Sign-in times are on the Users &amp; Login page.</p>
    </>
  )
}
