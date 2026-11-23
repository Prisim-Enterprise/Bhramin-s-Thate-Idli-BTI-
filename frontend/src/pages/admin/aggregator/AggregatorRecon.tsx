import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Card, PageHeader, Table, Tabs, inputCls } from '../../../components/ui'
import { Tile } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { BRANCHES, branchName } from '../../../data/mock'
import { inrU, sum } from '../../../data/aggregator/money'
import { autoMatch, lineLeft, looksZomato } from '../../../data/aggregator/recon'
import { useRecon } from '../../../data/aggregator/useRecon'
import StatementImport from './StatementImport'
import WeekDetail, { STATUS_TONE } from './WeekDetail'
import BankMatching from './BankMatching'
import ReconConfig from './ReconConfig'
import ReconReports from './ReconReports'

type Tab = 'dashboard' | 'statements' | 'bank' | 'config' | 'reports'
const PARTNERS = [{ id: 'zomato', name: 'Zomato', ready: true }, { id: 'swiggy', name: 'Swiggy', ready: false }] as const

/**
 * Aggregator Reconciliation (Zomato): weekly statements in, the payout worked out from them, commission and
 * advertisement checked against the agreed terms, and the money matched to the bank credits.
 */
export default function AggregatorRecon() {
  const { can } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const canEdit = can('accounts', 'create') || can('accounts', 'edit')
  const canApprove = can('accounts', 'approve')
  const canConfig = can('settings', 'edit')
  const R = useRecon()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'dashboard')
  const [open, setOpen] = useState<string | null>(params.get('open'))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [branch, setBranch] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  // Match new bank credits on evidence whenever statements or bank lines change.
  const sig = `${R.weeks.length}|${R.lines.length}|${R.matches.length}`
  useEffect(() => { if (canEdit && R.weeks.length && R.lines.some(looksZomato)) autoMatch(R.weeks, R.lines, by) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = useMemo(() => R.weeks.filter((w) => (!from || w.s.date >= from) && (!to || w.s.date <= to) && (!branch || w.s.branch === branch) && (!status || w.status === status)
    && (!q || `${branchName(w.s.branch)} ${w.s.zomato!.resId} ${w.s.date} ${w.s.import?.fileName ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [R.weeks, from, to, branch, status, q])
  const T = {
    expected: sum(weeks.map((w) => w.calc.statementPayout.amount)), received: sum(weeks.map((w) => w.received)),
    recoverable: sum(weeks.map((w) => w.calc.recoverable)),
  }
  const count = (s: string) => weeks.filter((w) => w.status === s).length
  const unmatched = R.lines.filter((l) => looksZomato(l) && lineLeft(l, R.matches) > 0)
  const activity = R.weeks.flatMap((w) => (w.s.history ?? []).map((h) => ({ ...h, w }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  const sel = R.weeks.find((w) => w.s.id === open)
  const go = (t: Tab, id?: string) => { setTab(t); if (id !== undefined) setOpen(id); setParams((p) => { p.set('tab', t); if (id) p.set('open', id); else p.delete('open'); return p }, { replace: true }) }
  const period = from || to ? `${from || 'start'}-to-${to || 'now'}` : new Date().toLocaleDateString('en-CA')

  const list = (
    <Card title="Weekly statements" pad={false}>
      <Table head={['Week', 'Outlet', 'Zomato ID', 'Orders', 'Expected payable', 'Received', 'Difference', 'Recoverable', 'Status', '']}>
        {weeks.map((w) => (
          <tr key={w.s.id} className={`cursor-pointer hover:bg-slate-50 ${open === w.s.id ? 'bg-[#fffaf0]' : ''}`} onClick={() => go('statements', w.s.id)} data-testid="week-row">
            <td>{w.s.date} – {w.s.weekEnd}</td><td className="font-medium text-slate-900">{branchName(w.s.branch)}</td><td className="font-mono text-xs">{w.s.zomato!.resId}</td><td>{w.s.zomato!.orders ?? '—'}</td>
            <td className="tabular-nums">{inrU(w.calc.statementPayout.amount)}</td><td className="tabular-nums">{inrU(w.received)}</td>
            <td className={`tabular-nums ${Math.abs(w.difference) > 10000 ? 'font-semibold text-rose-700' : 'text-emerald-700'}`}>{inrU(w.difference)}</td>
            <td className={`tabular-nums ${w.calc.recoverable ? 'text-rose-700' : 'text-slate-400'}`}>{w.calc.recoverable ? inrU(w.calc.recoverable) : '—'}</td>
            <td><Badge tone={STATUS_TONE[w.status]}>{w.statusLabel}</Badge>{w.s.finalised && <span className="ml-1 text-xs text-slate-400">final</span>}</td>
            <td className="text-sm font-medium text-[#7a2228]">Open</td>
          </tr>
        ))}
        {!weeks.length && <tr><td colSpan={10} className="!py-10 text-center text-slate-500">No Zomato statements{from || to || branch || status || q ? ' match these filters' : ' yet: import the weekly report under Statements'}.</td></tr>}
      </Table>
      {R.older.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{R.older.length} Zomato week(s) were entered on the Reconcile page without the full statement. Import their Excel reports here to reconcile them fully.</p>}
    </Card>
  )

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Aggregator Reconciliation" subtitle="Weekly partner statements: what is owed, what reached the bank, and the difference" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PARTNERS.map((p) => (
          <button key={p.id} disabled={!p.ready} title={p.ready ? '' : 'Statement rules for this partner are not set up yet'}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${p.ready ? 'bg-[#7a2228] text-white' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}>{p.name}{!p.ready && ' (coming)'}</button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <label className="text-xs text-slate-500">From week <input type="date" aria-label="From week" className={inputCls + ' !w-auto !py-1'} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-slate-500">to <input type="date" aria-label="To week" className={inputCls + ' !w-auto !py-1'} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select aria-label="Outlet filter" className={inputCls + ' !w-auto !py-1'} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">All outlets</option>{BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Status filter" className={inputCls + ' !w-auto !py-1'} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries({ pending: 'Pending', partial: 'Partially received', reconciled: 'Reconciled', mismatch: 'Mismatch', review: 'Under review' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input aria-label="Search" className={inputCls + ' !w-44 !py-1'} placeholder="Search outlet, ID, file" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Tabs value={tab} onChange={(t) => go(t, t === 'statements' ? open ?? undefined : undefined)} tabs={[
        { id: 'dashboard', label: 'Dashboard' }, { id: 'statements', label: 'Statements', count: weeks.length },
        { id: 'bank', label: 'Bank matching', count: unmatched.length }, { id: 'config', label: 'Configuration' }, { id: 'reports', label: 'Reports' },
      ]} />

      {tab === 'dashboard' && (
        <div className="space-y-4" data-testid="recon-dashboard">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Expected Zomato payable" value={inrU(T.expected)} note={`${weeks.length} week(s)`} />
            <Tile label="Received in the bank" value={inrU(T.received)} note={`${unmatched.length} Zomato credit(s) not matched`} />
            <Tile label="Difference" value={inrU(T.expected - T.received)} note={T.recoverable ? `+ ${inrU(T.recoverable)} recoverable under terms` : 'expected − received'} tone={Math.abs(T.expected - T.received) > 10000 ? 'red' : 'green'} />
            <Tile label="Statements" value={`${count('reconciled')} reconciled`} note={`${count('pending') + count('partial')} pending · ${count('mismatch')} mismatched · ${count('review')} under review`} tone={count('mismatch') ? 'red' : count('review') ? 'amber' : 'green'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            {list}
            <Card title="Latest activity">
              <ul className="space-y-2 text-sm" data-testid="activity">
                {activity.map((a, i) => <li key={i}><button className="text-left hover:underline" onClick={() => go('statements', a.w.s.id)}><b>{a.action}</b> · {branchName(a.w.s.branch)} {a.w.s.date}<span className="block text-xs text-slate-500">{a.by} · {a.at.slice(0, 16).replace('T', ' ')} · {a.detail}</span></button></li>)}
                {!activity.length && <li className="text-slate-500">Nothing yet.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
      {tab === 'statements' && (
        <div className="space-y-4">
          {canEdit && <StatementImport R={R} by={by} canEdit={canEdit} onImported={(id) => go('statements', id)} />}
          {sel && <WeekDetail key={sel.s.id} w={sel} R={R} by={by} canEdit={canEdit} canApprove={canApprove} onClose={() => go('statements', '')} />}
          {list}
        </div>
      )}
      {tab === 'bank' && <BankMatching R={R} by={by} canEdit={canEdit} />}
      {tab === 'config' && <ReconConfig R={R} by={by} canConfig={canConfig} />}
      {tab === 'reports' && <ReconReports R={R} weeks={weeks} period={period} />}
    </div>
  )
}
