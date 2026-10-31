import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChefHat, Save } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Table } from '../../components/ui'
import { Tile, downloadCsv, money } from '../../components/report'
import { useApp } from '../../context/AppContext'
import { BRANCHES, branchName, inr } from '../../data/mock'
import { fmtDateTime, niceDate } from '../../data/entries'
import { CK, saveReorderLevels, useCentreKitchen } from '../../data/kitchen'
import { FlowTable } from '../admin/kitchen/CentreKitchen'

const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

// Overall control of the Centre Kitchen: what came in, what went out to each outlet, stock, indents, and reorder levels.
export default function CentreKitchenControl() {
  const { role } = useApp()
  const ck = useCentreKitchen()
  const months = useMemo(() => [...new Set([...ck.flows.map((f) => f.date.slice(0, 7)), ...ck.indents.map((i) => i.date.slice(0, 7))])].sort().reverse(), [ck])
  const [month, setMonth] = useState<string | null>(null)
  const m = month ?? months[0] ?? ''
  const inM = (d: string) => !m || d.startsWith(m)
  const flows = ck.flows.filter((f) => inM(f.date))
  const ins = flows.filter((f) => f.kind === 'in')
  const outs = flows.filter((f) => f.kind === 'out')
  const sum = (fs: typeof flows) => fs.reduce((t, f) => t + f.value, 0)
  const indents = ck.indents.filter((i) => inM(i.date))
  const waiting = ck.indents.filter((i) => i.status === 'open' || i.status === 'part')
  const stockValue = ck.stock.reduce((t, s) => t + s.value, 0)

  // Per outlet: issued value, issues, indents raised / sent / waiting.
  const outlets = BRANCHES.filter((b) => b.id !== CK).map((b) => {
    const o = outs.filter((f) => f.party === b.id)
    const ind = indents.filter((i) => i.branch === b.id)
    return { b, value: sum(o), issues: o.length, raised: ind.length, sent: ind.filter((i) => i.status === 'done').length, waiting: ind.filter((i) => i.status === 'open' || i.status === 'part').length, last: o[0]?.date }
  }).filter((x) => x.value || x.raised).sort((a, b) => b.value - a.value)

  const days = [...new Set(flows.map((f) => f.date))].sort().map((d) => ({
    label: new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    in: Math.round(sum(ins.filter((f) => f.date === d))), out: Math.round(sum(outs.filter((f) => f.date === d))),
  }))
  // Items sent out the most (by value).
  const topOut = useMemo(() => {
    const t = new Map<string, { item: string; unit: string; qty: number; value: number }>()
    for (const f of outs) for (const l of f.lines) { const k = l.item.toLowerCase() + '|' + l.unit; const r = t.get(k) ?? { item: l.item, unit: l.unit, qty: 0, value: 0 }; r.qty += l.qty; r.value += l.qty * l.rate; t.set(k, r) }
    return [...t.values()].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [outs])

  // Reorder levels (admins).
  const [draft, setDraft] = useState<Record<string, { reorder: number; unit: string }> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const levels = draft ?? ck.levels
  const admin = role === 'admin'

  const csv = () => downloadCsv(`BTI-Centre-Kitchen-${m || 'all'}.csv`, [
    ['Date', 'In/Out', 'From/To', 'Item', 'Qty', 'Unit', 'Rate', 'Value', 'Entered by', 'Entered at'],
    ...flows.flatMap((f) => f.lines.map((l) => [f.date, f.kind, f.kind === 'out' ? branchName(f.party) : f.party, l.item, l.qty, l.unit, l.rate, Math.round(l.qty * l.rate), f.by, f.at])),
  ])

  return (
    <>
      <PageHeader title="Centre Kitchen" subtitle="Everything coming in and going out of the Centre Kitchen, stock, indents and reorder levels"
        actions={<>
          <select aria-label="Month" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={m} onChange={(e) => setMonth(e.target.value)}>
            {months.map((x) => <option key={x} value={x}>{monthLabel(x)}</option>)}<option value="">All months</option>
          </select>
          <button onClick={csv} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Download</button>
          <Link to="/admin/kitchen/centre" className="inline-flex items-center gap-1.5 rounded-lg bg-[#7a2228] px-3 py-2 text-sm font-semibold text-white"><ChefHat size={15} /> Open kitchen screen</Link>
        </>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile label="Came in" value={money(sum(ins))} note={`${ins.length} deliveries · ${ins.filter((f) => f.source === 'Bill').length} with bills`} />
        <Tile label="Went out to outlets" value={money(sum(outs))} note={`${outs.length} issues`} />
        <Tile label="In − out" value={money(sum(ins) - sum(outs))} note="Kept in the kitchen this period" />
        <Tile label="Stock on hand" value={money(stockValue)} note={`${ck.stock.length} items`} />
        <Tile label="Indents waiting" value={String(waiting.length)} tone={waiting.length ? 'amber' : 'green'} note={ck.low.length ? `${ck.low.length} item(s) to reorder` : 'no reorder alerts'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="In and out, day by day" className="lg:col-span-3">
          {days.length ? (
            <div className="h-64"><ResponsiveContainer><BarChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v: number) => money(v)} width={60} />
              <Tooltip formatter={(v: number) => inr(v)} /><Legend />
              <Bar dataKey="in" name="Came in" fill="#15803d" isAnimationActive={false} /><Bar dataKey="out" name="Went out" fill="#7a2228" isAnimationActive={false} />
            </BarChart></ResponsiveContainer></div>
          ) : <p className="text-sm text-slate-500">Nothing came in or went out in this period.</p>}
        </Card>
        <Card title="Sent out the most" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {topOut.map((t) => <li key={t.item + t.unit} className="flex justify-between px-4 py-2 text-sm"><span>{t.item} <span className="text-slate-500">· {Math.round(t.qty * 1000) / 1000} {t.unit}</span></span><b className="tabular-nums">{inr(Math.round(t.value))}</b></li>)}
            {!topOut.length && <li className="px-4 py-3 text-sm text-slate-500">Nothing issued yet.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Outlets" className="mt-4" pad={false}>
        <Table head={['Outlet', 'Goods sent', 'Issues', 'Indents raised', 'Sent in full', 'Waiting', 'Last issue']}>
          {outlets.map((o) => (
            <tr key={o.b.id}>
              <td className="font-medium text-slate-900">{o.b.name}</td><td className="font-semibold tabular-nums">{inr(Math.round(o.value))}</td><td className="tabular-nums">{o.issues}</td>
              <td className="tabular-nums">{o.raised}</td><td className="tabular-nums">{o.sent}</td>
              <td>{o.waiting ? <Badge tone="amber">{o.waiting} waiting</Badge> : <span className="text-slate-400">—</span>}</td>
              <td className="text-slate-500">{o.last ? niceDate(o.last) : '—'}</td>
            </tr>
          ))}
          {!outlets.length && <tr><td colSpan={7} className="!py-6 text-center text-slate-500">No issues or indents in this period.</td></tr>}
        </Table>
      </Card>

      {waiting.length > 0 && (
        <Card title={`Indents waiting (${waiting.length})`} className="mt-4" pad={false}>
          <Table head={['Outlet', 'Needed on', 'Items', 'Raised by']}>
            {waiting.map((i) => (
              <tr key={i.id}><td className="font-medium">{branchName(i.branch)}</td><td>{niceDate(i.date)}</td>
                <td className="!whitespace-normal text-slate-600">{i.lines.map((l) => `${l.item} ${l.qty - l.sent} ${l.unit} left`).join(', ')}</td>
                <td><span className="block">{i.addedBy}</span><span className="text-xs text-slate-500">{fmtDateTime(i.addedAt)}</span></td></tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Every movement (who and when)" className="mt-4" pad={false}>
        <FlowTable flows={flows} />
      </Card>

      <Card title="Reorder levels" className="mt-4" pad={false}>
        <p className="px-4 pt-3 text-sm text-slate-500">{admin ? 'Set the stock level at which an item should be reordered. The kitchen screen flags items at or below it.' : 'Set by an admin.'}</p>
        <div className="grid grid-cols-1 gap-x-6 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
          {ck.stock.map((s) => (
            <label key={s.key} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm">
              <span className="min-w-0 truncate">{s.item} <span className="text-slate-400">· on hand {s.onHand} {s.unit}</span></span>
              <input type="number" min="0" step="0.001" aria-label={`Reorder level for ${s.item}`} disabled={!admin} className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                value={levels[s.key]?.reorder ?? ''} placeholder="—" onChange={(e) => { setDraft({ ...levels, [s.key]: { reorder: Number(e.target.value) || 0, unit: s.unit } }); setMsg(null) }} />
            </label>
          ))}
          {!ck.stock.length && <p className="text-sm text-slate-500">Items appear once stock comes in.</p>}
        </div>
        {admin && (
          <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
            <Button icon={Save} disabled={!draft} onClick={() => saveReorderLevels(draft!).then(() => { setDraft(null); setMsg('Saved for everyone.') }).catch((e: Error) => setMsg(e.message))}>Save reorder levels</Button>
            {msg && <span className="text-sm text-slate-600">{msg}</span>}
          </div>
        )}
      </Card>
    </>
  )
}
