import { useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Download, Plus, Trash2, X } from 'lucide-react'
import { Button, inputCls } from '../../../components/ui'
import { downloadCsv } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { BRANCHES, branchName } from '../../../data/mock'
import { fmtDateTime } from '../../../data/entries'
import { rawMaterials, saveClosingCount, useClosingCounts, usePostedBills, type CountLine } from '../../../data/inventory'
import { OpsHeader } from '../ops/shared'

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const day = (s: string) => new Date(s + 'T00:00:00')

/** Counting the stock left at an outlet at the end of a day. */
function CountDialog({ branch, date, onClose }: { branch: string; date: string; onClose: () => void }) {
  const auth = useAuth()
  const counts = useClosingCounts()
  const posted = usePostedBills()
  const existing = counts.find((c) => c.branch === branch && c.date === date)
  // Start from this count if it exists, otherwise from the outlet's last count, otherwise every known item.
  const last = counts.filter((c) => c.branch === branch && c.date < date).sort((a, b) => b.date.localeCompare(a.date))[0]
  const [lines, setLines] = useState<CountLine[]>(() => existing?.lines.map((l) => ({ ...l }))
    ?? (last ? last.lines.map((l) => ({ ...l, qty: 0 })) : rawMaterials(posted, counts).map((m) => ({ ...m, qty: 0 }))))
  const set = (i: number, p: Partial<CountLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const save = () => { saveClosingCount({ branch, date, lines, addedBy: auth.email ?? 'Demo user', addedAt: new Date().toISOString() }); onClose() }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-label="Closing stock count">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><p className="text-lg font-semibold">Closing stock · {branchName(branch)}</p>
            <p className="text-sm text-slate-500">{day(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{existing && ` · last saved ${fmtDateTime(existing.addedAt)} by ${existing.addedBy}`}</p></div>
          <button aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 text-left font-medium">Raw material</th><th className="w-24 text-left font-medium">Unit</th><th className="w-32 text-right font-medium">Left in stock</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Raw material" className={inputCls + ' !py-1.5'} value={l.item} onChange={(e) => set(i, { item: e.target.value })} /></td>
                  <td className="pr-2"><input aria-label="Unit" className={inputCls + ' !py-1.5'} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} /></td>
                  <td><input aria-label={`Quantity of ${l.item}`} type="number" step="0.001" min="0" className={inputCls + ' !py-1.5 text-right'} value={l.qty || ''} placeholder="0" onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="pl-2"><button aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#7a2228] hover:underline" onClick={() => setLines((ls) => [...ls, { item: '', unit: 'kg', qty: 0 }])}><Plus size={15} /> Add item</button>
          {!lines.length && <p className="mt-2 text-sm text-slate-500">No raw materials known yet. Add items, or post bills first so their items are listed here.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={CheckCircle2} disabled={!lines.some((l) => l.item.trim())} onClick={save}>Save closing stock</Button>
        </div>
      </div>
    </div>
  )
}

// Which outlets have counted their closing stock on each of the last 7 days.
export default function ClosingStock() {
  const { can } = useApp()
  const counts = useClosingCounts()
  const [end, setEnd] = useState(iso(new Date()))
  const [open, setOpen] = useState<{ branch: string; date: string } | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => { const d = day(end); d.setDate(d.getDate() - (6 - i)); return iso(d) })
  const done = (b: string, d: string) => counts.some((c) => c.branch === b && c.date === d)
  const today = days[6]
  const closedToday = BRANCHES.filter((b) => done(b.id, today)).length
  const updates = BRANCHES.reduce((s, b) => s + days.filter((d) => done(b.id, d)).length, 0)
  const canCount = can('indent', 'create') || can('indent', 'edit') || can('purchase', 'create')

  const csv = () => downloadCsv(`BTI-Closing-Stock-Tracker-${days[0]}-to-${today}.csv`, [
    ['Outlet', ...days, 'Updated (7d)'],
    ...BRANCHES.map((b) => [b.name, ...days.map((d) => (done(b.id, d) ? 'Updated' : 'Pending')), `${days.filter((d) => done(b.id, d)).length}/7`]),
  ])
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => day(d).toLocaleDateString('en-IN', o)

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Closing Stock Tracker — Consolidated">
        <button onClick={csv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Download size={15} /> Export</button>
      </OpsHeader>
      <p className="-mt-2 mb-4 text-sm text-slate-500">Closing-stock status across all outlets for the last 7 days. Click a day to count or change the stock left. Follow up with outlets that haven't counted before mismatches build up.</p>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-slate-200 border-b border-slate-200 md:grid-cols-4 md:divide-x">
          {[
            [String(BRANCHES.length), 'Outlets tracked', ''],
            [`${closedToday}`, `Closed (${fmt(today, { day: 'numeric', month: 'short' })})`, `/ ${BRANCHES.length}`],
            [String(BRANCHES.length - closedToday), `Pending (${fmt(today, { day: 'numeric', month: 'short' })})`, ''],
            [String(updates), 'Updates in these 7 days', `/ ${BRANCHES.length * 7}`],
          ].map(([v, l, of], i) => (
            <div key={l} className="p-5">
              <p className={`text-2xl font-semibold ${i === 1 ? 'text-emerald-700' : i === 2 && v !== '0' ? 'text-rose-600' : 'text-slate-900'}`}>{v}<span className="ml-1 text-base font-normal text-slate-400">{of}</span></p>
              <p className="text-sm text-slate-500">{l}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span className="flex gap-4 text-sm text-slate-600"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Updated</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Pending</span></span>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            <CalendarDays size={15} className="text-slate-500" /> 7 days ending
            <input type="date" aria-label="Last day" className="bg-transparent outline-none" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-5 py-3 text-left font-medium">Outlet</th>
                {days.map((d) => (
                  <th key={d} className={`px-2 text-center font-medium ${d === today ? 'bg-[#fbf3e4] text-[#7a2228]' : ''}`}>{fmt(d, { weekday: 'short' })}<span className="block text-sm font-semibold text-slate-800">{fmt(d, { day: 'numeric', month: 'short' })}</span></th>
                ))}
                <th className="px-5 text-left font-medium">Updated (7d)</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BRANCHES.map((b) => {
                const n = days.filter((d) => done(b.id, d)).length
                return (
                  <tr key={b.id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{b.name}<span className="block text-xs font-normal text-slate-400">{b.id}</span></td>
                    {days.map((d) => (
                      <td key={d} className={`px-2 text-center ${d === today ? 'bg-[#fdf8ee]' : ''}`}>
                        <button disabled={!canCount} onClick={() => setOpen({ branch: b.id, date: d })} aria-label={`${b.name} ${d}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset disabled:cursor-default ${done(b.id, d) ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-rose-200 hover:bg-rose-100'}`}>
                          {done(b.id, d) ? <CheckCircle2 size={13} /> : <Clock size={13} />} {done(b.id, d) ? 'Updated' : 'Pending'}
                        </button>
                      </td>
                    ))}
                    <td className="px-5"><span className="font-semibold">{n}/7</span><span className="ml-2 inline-block h-1.5 w-16 rounded bg-slate-100 align-middle"><span className="block h-1.5 rounded bg-emerald-500" style={{ width: (n / 7) * 100 + '%' }} /></span></td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50 text-center text-xs text-slate-600">
                <td className="px-5 py-3 text-left text-sm">Outlets updated</td>
                {days.map((d) => { const k = BRANCHES.filter((b) => done(b.id, d)).length; return <td key={d} className={d === today ? 'bg-[#fbf3e4]' : ''}><b className="block text-sm text-slate-800">{k}/{BRANCHES.length}</b>{Math.round((k / BRANCHES.length) * 100)}%</td> })}
                <td className="px-5 text-left text-sm font-semibold">{updates}/{BRANCHES.length * 7}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {!canCount && <p className="mt-3 text-xs text-slate-500">Your role can view this tracker but not enter counts.</p>}
      {open && <CountDialog branch={open.branch} date={open.date} onClose={() => setOpen(null)} />}
    </div>
  )
}
