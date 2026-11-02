import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChefHat, MapPin, User } from 'lucide-react'
import { Badge, Card, PageHeader, Stat, Table } from '../../components/ui'
import { BRANCHES, branchName, inr } from '../../data/mock'
import { niceDate } from '../../data/entries'
import { FOOD_COST_TARGET, daily, monthName, profitLoss, useReportData } from '../../data/analytics'
import { CK, useCentreKitchen } from '../../data/kitchen'

// Each outlet's month at a glance, worked out from the Imprest Books, posted bills and vouchers
// (the same figures as the reports). The Central Kitchen shows its indents, goods in/out and stock.

const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700'

export default function Branches() {
  const R = useReportData()
  const ck = useCentreKitchen()
  const [picked, setPicked] = useState<string | null>(null)
  const scope = { month: R.month || undefined }

  // Month figures for every branch, for the tiles.
  const all = useMemo(() => BRANCHES.map((b) => ({ b, p: profitLoss(R.d, { ...scope, branch: b.id }) })), [R.d, R.month]) // eslint-disable-line react-hooks/exhaustive-deps
  // Until someone picks, open the outlet with the most sales.
  const busiest = [...all].filter((x) => x.b.id !== CK).sort((a, b) => b.p.income - a.p.income)[0]
  const id = picked ?? (busiest?.p.income ? busiest.b.id : 'B1')
  const b = BRANCHES.find((x) => x.id === id)!
  const p = all.find((x) => x.b.id === id)!.p
  const isCK = id === CK
  const period = R.month ? monthName(R.month) : 'all months'

  const openIndents = ck.indents.filter((i) => i.branch === id && (i.status === 'open' || i.status === 'part'))
  const days = daily(R.d, { ...scope, branch: id }).filter((x) => x.food).slice(-14)
  const spends = p.lines.filter((l) => l.type !== 'purchase')
  const spent = p.running + p.staff
  const lastDay = R.d.entries.filter((e) => e.branch === id).map((e) => e.date).sort().pop()

  // Central Kitchen numbers.
  const inMonth = (d: string) => !R.month || d.startsWith(R.month)
  const ckIn = ck.flows.filter((f) => f.kind === 'in' && inMonth(f.date))
  const ckOut = ck.flows.filter((f) => f.kind === 'out' && inMonth(f.date))
  const ckWaiting = ck.indents.filter((i) => i.status === 'open' || i.status === 'part')
  const stockValue = ck.stock.reduce((t, s) => t + s.value, 0)

  return (
    <>
      <PageHeader title="Branch Dashboards" subtitle={`Pick the central kitchen or an outlet to see how it's doing · ${period}`}
        actions={
          <select aria-label="Month" className={sel} value={R.month} onChange={(e) => R.setMonth(e.target.value)}>
            {R.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            <option value="">All months</option>
          </select>
        } />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {all.map(({ b: x, p: xp }) => {
          const live = x.id === CK ? ck.flows.length > 0 : xp.sales.days > 0
          return (
            <button key={x.id} onClick={() => setPicked(x.id)}
              className={`rounded-xl border p-3 text-left transition ${id === x.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{x.id === CK ? 'Central kitchen' : 'Outlet'}</span>
                <span title={live ? 'Has figures this period' : 'Nothing entered this period'} className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">{x.id === CK && <ChefHat size={14} />}{x.name}</p>
              <p className="text-xs text-slate-500">
                {x.id === CK ? `${ckWaiting.length} indent(s) waiting` : xp.sales.days ? `${inr(Math.round(xp.income))} · ${xp.sales.days} day(s)` : 'No Imprest Book yet'}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1"><MapPin size={14} /> {b.city}</span>
        {b.manager && <span className="flex items-center gap-1"><User size={14} /> {b.manager}</span>}
        {!isCK && <span>{lastDay ? `Last Imprest Book: ${niceDate(lastDay)}` : 'No Imprest Book uploaded yet'}</span>}
        <Badge tone={b.ocr ? 'green' : 'slate'}>{b.ocr ? 'OCR on' : 'OCR off'}</Badge>
      </div>

      {isCK ? (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Indents waiting" value={String(ckWaiting.length)} tone={ckWaiting.length ? 'amber' : 'green'} />
            <Stat label="Came in" value={inr(Math.round(ckIn.reduce((t, f) => t + f.value, 0)))} hint={`${ckIn.length} deliveries`} />
            <Stat label="Went out" value={inr(Math.round(ckOut.reduce((t, f) => t + f.value, 0)))} hint={`${ckOut.length} issues to outlets`} />
            <Stat label="Stock on hand" value={inr(Math.round(stockValue))} tone={ck.low.length ? 'red' : 'brand'} hint={ck.low.length ? `${ck.low.length} item(s) low` : `${ck.stock.length} items`} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Indents waiting" pad={false} actions={<Link to="/admin/kitchen/centre" className="text-xs font-medium text-[#7a2228]">Open Centre Kitchen →</Link>}>
              {ckWaiting.length ? (
                <Table head={['Needed by', 'From', 'Items', 'Status']}>
                  {ckWaiting.map((i) => (
                    <tr key={i.id}><td>{niceDate(i.date)}</td><td className="font-medium">{branchName(i.branch)}</td><td>{i.lines.length}</td><td><Badge>{i.status === 'part' ? 'part sent' : 'open'}</Badge></td></tr>
                  ))}
                </Table>
              ) : <p className="p-4 text-sm text-slate-500">No indents waiting.</p>}
            </Card>
            <Card title="Stock on hand" pad={false}>
              {ck.stock.length ? (
                <Table head={['Item', 'On hand', 'Value']}>
                  {[...ck.stock].sort((a, b) => b.value - a.value).slice(0, 12).map((s) => (
                    <tr key={s.key}><td>{s.item}</td><td className="tabular-nums">{s.onHand} {s.unit}</td><td className="tabular-nums">{inr(Math.round(s.value))}</td></tr>
                  ))}
                </Table>
              ) : <p className="p-4 text-sm text-slate-500">Nothing in stock yet. Post kitchen bills or record goods received.</p>}
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Net sales" value={inr(Math.round(p.income))} hint={p.sales.days ? `${p.sales.days} day(s) · cash ${inr(Math.round(p.sales.cash))}` : 'Upload the Imprest Book'} />
            <Stat label="Food cost" value={p.foodPct == null ? '—' : p.foodPct.toFixed(1) + '%'}
              tone={p.foodPct == null ? 'brand' : p.foodPct > FOOD_COST_TARGET ? 'red' : 'green'}
              hint={p.foodPct == null ? undefined : `${inr(Math.round(p.food))} of ingredients · target ${FOOD_COST_TARGET}%`} />
            <Stat label="Open indents" value={String(openIndents.length)} tone="amber" />
            <Stat label="Expenses" value={inr(Math.round(spent))} hint={spent ? `running ${inr(Math.round(p.running))} · staff ${inr(Math.round(p.staff))}` : undefined} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Daily sales">
              {days.length ? (
                <div className="h-60">
                  <ResponsiveContainer>
                    <BarChart data={days}>
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip formatter={(v: number) => inr(v)} />
                      <Bar dataKey="food" name="Food sales" fill="#7a2228" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-10 text-center text-sm text-slate-500">No sales for {b.name} in {period}. Upload its Imprest Book.</p>}
            </Card>
            <Card title="Branch expenses" pad={false}>
              {spends.length ? (
                <Table head={['Date', 'Ledger', 'Amount', 'Type']}>
                  {spends.slice(0, 15).map((l) => (
                    <tr key={l.key}><td>{niceDate(l.date)}</td><td>{l.ledger}</td><td className="tabular-nums">{inr(l.amount)}</td><td><Badge tone={l.type === 'salary' ? 'amber' : 'slate'}>{l.type === 'salary' ? 'staff' : 'running'}</Badge></td></tr>
                  ))}
                </Table>
              ) : <p className="p-4 text-sm text-slate-500">No expenses for {b.name} in {period}.</p>}
              {spends.length > 15 && <p className="px-4 py-2 text-xs text-slate-500">Showing the latest 15 of {spends.length}. See the Expenses Report for all.</p>}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
