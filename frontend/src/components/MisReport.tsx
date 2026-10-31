import { Fragment, useMemo, useState } from 'react'
import { CheckCircle2, Building, ListTree, Save } from 'lucide-react'
import { Button, Card, inputCls } from './ui'
import { Big, Summary, Tile, downloadCsv, money } from './report'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { BRANCHES, branchName } from '../data/mock'
import { BANK_LEDGER, imprestLedger } from '../data/books'
import { addManualVoucher, deleteManualVoucher, ledgerKey, type ManualVoucher } from '../data/ledgerStore'
import { moneyLines, monthName, type Data, type Scope } from '../data/analytics'
import { HEADS, defaultHead, misPnl, saveMisLayout, useMisLayout, type Head, type Mis } from '../data/mis'

const pct = (v: number, of: number) => (of ? ((v / of) * 100).toFixed(1) + '%' : '—')

/* ---------- Monthly fixed costs (rent, electricity, water) for an outlet ---------- */

const FIXED_FIELDS = [
  { key: 'rentOutlet', ledger: 'Rent - Outlet', label: 'Rent – outlet' },
  { key: 'rentStaff', ledger: 'Rent - Staff Room', label: 'Rent – staff room' },
  { key: 'electricity', ledger: 'Electricity', label: 'Electricity' },
  { key: 'water', ledger: 'Water Charges', label: 'Water' },
] as const
const monthEnd = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).toLocaleDateString('en-CA')
const fixedId = (branch: string, month: string, key: string) => `fixed-${branch}-${month}-${key}`

function FixedCostsForm({ d, month, branch }: { d: Data; month: string; branch: string }) {
  const auth = useAuth()
  const [b, setB] = useState(branch || 'B1')
  const [m, setM] = useState(month || new Date().toLocaleDateString('en-CA').slice(0, 7))
  const [paidFrom, setPaidFrom] = useState<'bank' | 'cash'>('bank')
  const existing = (key: string) => d.manual.find((v) => v.id === fixedId(b, m, key))
  const [vals, setVals] = useState<Record<string, string>>({})
  const [done, setDone] = useState<string | null>(null)
  const value = (key: string) => vals[`${b}|${m}|${key}`] ?? (existing(key)?.amount ? String(existing(key)!.amount) : '')

  const save = () => {
    const now = new Date().toISOString()
    let n = 0
    for (const f of FIXED_FIELDS) {
      const id = fixedId(b, m, f.key)
      const amount = Number(value(f.key)) || 0
      if (d.manual.some((v) => v.id === id)) deleteManualVoucher(id)
      if (!amount) continue
      const v: ManualVoucher = {
        id, type: 'Payment', date: monthEnd(m), branch: b, amount, drLedger: f.ledger,
        crLedger: paidFrom === 'bank' ? BANK_LEDGER : imprestLedger(b),
        narration: `${f.label} for ${monthName(m)}`, addedBy: auth.email ?? 'Demo user', addedAt: now,
      }
      addManualVoucher(v)
      n++
    }
    setVals({})
    setDone(`Saved ${n} fixed cost(s) for ${branchName(b)}, ${monthName(m)}. They are in Account Books as Payment vouchers dated ${monthEnd(m)}.`)
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Building size={16} /> Monthly fixed costs</span>} className="mt-4">
      <p className="mb-3 text-sm text-slate-500">Rent, electricity and water are usually paid from the bank, so they aren't in the Imprest Book. Enter them once a month per outlet.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Outlet
          <select className={inputCls + ' mt-1'} value={b} onChange={(e) => { setB(e.target.value); setDone(null) }}>{BRANCHES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Month
          <input type="month" className={inputCls + ' mt-1'} value={m} onChange={(e) => { if (e.target.value) { setM(e.target.value); setDone(null) } }} /></label>
        <label className="text-xs font-medium text-slate-600">Paid from
          <select className={inputCls + ' mt-1'} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as 'bank' | 'cash')}><option value="bank">Bank</option><option value="cash">Branch cash (imprest)</option></select></label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FIXED_FIELDS.map((f) => (
          <label key={f.key} className="text-xs font-medium text-slate-600">{f.label}
            <input type="number" min="0" step="0.01" aria-label={f.label} className={inputCls + ' mt-1 text-right tabular-nums'} placeholder="0"
              value={value(f.key)} onChange={(e) => { setVals({ ...vals, [`${b}|${m}|${f.key}`]: e.target.value }); setDone(null) }} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button icon={Save} onClick={save}>Save fixed costs</Button>
        {done && <span className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {done}</span>}
      </div>
    </Card>
  )
}

/* ---------- Where each ledger goes ---------- */

function LedgerSorting({ d }: { d: Data }) {
  const { role } = useApp()
  const map = useMisLayout()
  const [draft, setDraft] = useState<Record<string, Head> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const current = draft ?? map
  const ledgers = useMemo(() => {
    const seen = new Map<string, { ledger: string; type: 'expense' | 'purchase' | 'salary' }>()
    for (const l of moneyLines(d, {})) if (!seen.has(ledgerKey(l.ledger))) seen.set(ledgerKey(l.ledger), { ledger: l.ledger, type: l.type })
    return [...seen.values()].sort((a, b) => a.ledger.localeCompare(b.ledger))
  }, [d])
  const admin = role === 'admin'

  return (
    <Card title={<span className="flex items-center gap-2"><ListTree size={16} /> Where each ledger goes</span>} className="mt-4" pad={false}>
      <p className="px-4 pt-3 text-sm text-slate-500">{admin ? 'Change a heading and save. It applies to everyone.' : 'Set by an admin.'} Ledgers not changed use the usual rule (shown as “usual”).</p>
      <div className="grid grid-cols-1 gap-x-6 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
        {ledgers.map((l) => {
          const k = ledgerKey(l.ledger)
          const h = current[k] ?? defaultHead(l)
          return (
            <label key={k} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm">
              <span className="min-w-0 truncate" title={l.ledger}>{l.ledger}</span>
              <select aria-label={`Heading for ${l.ledger}`} disabled={!admin} className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                value={h} onChange={(e) => { setDraft({ ...current, [k]: e.target.value as Head }); setMsg(null) }}>
                {(Object.keys(HEADS) as Head[]).map((x) => <option key={x} value={x}>{HEADS[x].label}{x === defaultHead(l) ? ' (usual)' : ''}</option>)}
              </select>
            </label>
          )
        })}
        {!ledgers.length && <p className="text-sm text-slate-500">No expense ledgers yet.</p>}
      </div>
      {admin && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
          <Button icon={Save} disabled={!draft || busy} onClick={() => { setBusy(true); saveMisLayout(draft!).then(() => { setDraft(null); setMsg('Saved for everyone.') }).catch((e: Error) => setMsg(e.message)).finally(() => setBusy(false)) }}>
            {busy ? 'Saving…' : 'Save headings'}
          </Button>
          {draft && <Button variant="ghost" onClick={() => setDraft(null)}>Undo changes</Button>}
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      )}
    </Card>
  )
}

/* ---------- The MIS statement ---------- */

type Row = { label: string; get: (m: Mis) => number; kind: 'head' | 'line' | 'sub' | 'total' | 'grand'; minus?: boolean; indent?: 1 | 2 }

export default function MisReport({ d, scope }: { d: Data; scope: Scope }) {
  const { can } = useApp()
  const map = useMisLayout()
  const all = misPnl(d, scope, map)
  // One column per outlet that has figures (when looking at all branches).
  const outlets = scope.branch ? [] : BRANCHES.map((b) => ({ b, m: misPnl(d, { ...scope, branch: b.id }, map) })).filter((x) => x.m.sales || x.m.lines.length)
  const cols = outlets.length > 1 ? outlets : []

  // Rows: every ledger that appears anywhere in the period, under its heading.
  const names = (pick: (m: Mis) => { k: string }[]) => [...new Set([all, ...outlets.map((o) => o.m)].flatMap((m) => pick(m).map((x) => x.k)))]
  const find = (list: { k: string; v: number }[], k: string) => list.find((x) => x.k === k)?.v ?? 0
  const rows: Row[] = [
    { label: 'Sales', get: () => 0, kind: 'head' },
    { label: 'Dine-in (cash + UPI)', get: (m) => m.dineIn, kind: 'line', indent: 1 },
    { label: 'Online (Swiggy, Zomato, others)', get: (m) => m.online, kind: 'line', indent: 1 },
    { label: 'Container charges', get: (m) => m.container, kind: 'line', indent: 1 },
    ...(all.roundOff ? [{ label: 'Round off', get: (m: Mis) => m.roundOff, kind: 'line' as const, indent: 1 as const }] : []),
    { label: 'Less: settlement discounts', get: (m) => -m.discount, kind: 'line', indent: 1, minus: true },
    { label: 'Net sales', get: (m) => m.sales, kind: 'total' },
    { label: 'Less: Food cost', get: () => 0, kind: 'head' },
    ...names((m) => m.foodItems).map((k) => ({ label: k, get: (m: Mis) => -find(m.foodItems, k), kind: 'line' as const, indent: 1 as const, minus: true })),
    { label: 'Total food cost', get: (m) => -m.food, kind: 'sub', minus: true },
    { label: 'Gross margin', get: (m) => m.gross, kind: 'total' },
    { label: 'Less: Fixed overheads', get: () => 0, kind: 'head' },
    ...(['rent', 'salaries', 'utilities', 'fixed'] as Head[]).flatMap((h) => {
      const ks = names((m) => m.fixedHeads.find((x) => x.h === h)!.items)
      if (!ks.length) return h === 'rent' || h === 'salaries' || h === 'utilities'
        ? [{ label: HEADS[h].label, get: () => 0, kind: 'line' as const, indent: 1 as const, minus: true }] : []
      return [
        { label: HEADS[h].label, get: (m: Mis) => -m.fixedHeads.find((x) => x.h === h)!.v, kind: 'line' as const, indent: 1 as const, minus: true },
        ...ks.map((k) => ({ label: k, get: (m: Mis) => -find(m.fixedHeads.find((x) => x.h === h)!.items, k), kind: 'line' as const, indent: 2 as const, minus: true })),
      ]
    }),
    { label: 'Total fixed overheads', get: (m) => -m.fixed, kind: 'sub', minus: true },
    { label: 'Less: Variable overheads', get: () => 0, kind: 'head' },
    ...names((m) => m.variableItems).map((k) => ({ label: k, get: (m: Mis) => -find(m.variableItems, k), kind: 'line' as const, indent: 1 as const, minus: true })),
    { label: 'Total variable overheads', get: (m) => -m.variable, kind: 'sub', minus: true },
    { label: 'Net profit', get: (m) => m.net, kind: 'grand' },
  ]

  const csv = () => downloadCsv(`BTI-MIS-${scope.month || 'all'}${scope.branch ? '-' + branchName(scope.branch) : ''}.csv`, [
    ['Particulars', 'Total', '% of sales', ...cols.map((c) => c.b.name)],
    ...rows.map((r) => [r.label, r.kind === 'head' ? '' : r.get(all), r.kind === 'head' ? '' : pct(r.get(all), all.sales), ...cols.map((c) => (r.kind === 'head' ? '' : r.get(c.m)))]),
  ])
  const cell = (v: number, r: Row) => (r.kind === 'head' ? '' : v === 0 && r.kind === 'line' ? '–' : money(v, false))

  return (
    <>
      <Summary points={[
        <>Net sales <Big>{money(all.sales)}</Big>: dine-in {money(all.dineIn)}, online {money(all.online)}{all.sales ? ` (${pct(all.online, all.dineIn + all.online)} online)` : ''}.</>,
        <>After food cost of <Big>{money(all.food)}</Big> ({pct(all.food, all.sales)}), the gross margin is <Big>{money(all.gross)}</Big> ({pct(all.gross, all.sales)}).</>,
        <>Fixed overheads <Big>{money(all.fixed)}</Big> ({pct(all.fixed, all.sales)}) and variable overheads <Big>{money(all.variable)}</Big> ({pct(all.variable, all.sales)}) leave a net {all.net >= 0 ? 'profit' : 'loss'} of <Big>{money(Math.abs(all.net))}</Big>.</>,
        !all.fixedHeads.find((x) => x.h === 'rent')!.v ? <>No rent entered for this period yet. Add it below under <Big>Monthly fixed costs</Big>.</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Net sales" value={money(all.sales)} note={`${all.days} day(s)`} />
        <Tile label="Gross margin" value={money(all.gross)} note={`${pct(all.gross, all.sales)} of sales`} tone={all.gross >= 0 ? 'green' : 'red'} />
        <Tile label="Overheads" value={money(all.fixed + all.variable)} note={`fixed ${money(all.fixed)} · variable ${money(all.variable)}`} />
        <Tile label={all.net >= 0 ? 'Net profit' : 'Net loss'} value={money(all.net)} note={`${pct(all.net, all.sales)} of sales`} tone={all.net >= 0 ? 'green' : 'red'} />
      </div>

      <Card title={`MIS Profit & Loss${scope.branch ? ` · ${branchName(scope.branch)}` : ''}`} className="mt-4" pad={false}
        actions={<button className="text-xs font-medium text-[#7a2228] hover:underline" onClick={csv}>Download</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 560 + cols.length * 120 }}>
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium">Particulars</th>
                <th className="px-4 text-right font-medium">{cols.length ? 'All outlets' : 'Amount'}</th>
                <th className="px-4 text-right font-medium">% of sales</th>
                {cols.map((c) => <th key={c.b.id} className="px-4 text-right font-medium">{c.b.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                  {r.kind === 'head' ? (
                    <tr><td colSpan={3 + cols.length} className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-[#7a2228]">{r.label}</td></tr>
                  ) : (
                    <tr className={r.kind === 'grand' ? 'bg-[#fdf8ee] text-base font-bold' : r.kind === 'total' ? 'border-t border-slate-300 bg-slate-50 font-bold' : r.kind === 'sub' ? 'border-t border-slate-200 font-semibold' : r.indent === 1 && r.minus && rows[i + 1]?.indent === 2 ? 'font-medium' : ''}>
                      <td className={`sticky left-0 bg-inherit px-4 py-1.5 ${r.indent === 2 ? 'pl-12 text-slate-500' : r.indent === 1 ? 'pl-8 text-slate-700' : ''}`}>{r.label}</td>
                      <td className={`px-4 text-right tabular-nums ${(r.kind === 'total' || r.kind === 'grand') && r.get(all) < 0 ? 'text-rose-600' : ''}`}>{cell(r.get(all), r)}</td>
                      <td className="px-4 text-right tabular-nums text-slate-500">{r.get(all) ? pct(Math.abs(r.get(all)), all.sales) : ''}</td>
                      {cols.map((c) => <td key={c.b.id} className={`px-4 text-right tabular-nums ${(r.kind === 'total' || r.kind === 'grand') && r.get(c.m) < 0 ? 'text-rose-600' : ''}`}>{cell(r.get(c.m), r)}</td>)}
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Dine-in and online are split by how each day was paid in the Imprest Book. Food cost includes transport inward (freight / hamali).
          GST is left out (collected for and claimed from the government).
        </p>
      </Card>

      {can('accounts', 'create') && <FixedCostsForm d={d} month={scope.month ?? ''} branch={scope.branch ?? ''} />}
      <LedgerSorting d={d} />
    </>
  )
}
