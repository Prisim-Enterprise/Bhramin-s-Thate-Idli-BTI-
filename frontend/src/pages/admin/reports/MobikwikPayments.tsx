import { useMemo, useState } from 'react'
import { Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react'
import { EmptyReport, ReportHeader, ScopePicker, Tile, downloadCsv, money } from '../../../components/report'
import { Badge, inputCls } from '../../../components/ui'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { monthName, useReportData } from '../../../data/analytics'
import { inMonth, niceDate } from '../../../data/entries'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { payDays, saveSplit, usePaySplits, type PayDay } from '../../../data/settlements'

const r2 = (n: number) => Math.round(n * 100) / 100

/** UPI and card typed for one day; card fills in as Mobikwik − UPI. */
function SplitCells({ d, editable, by }: { d: PayDay; editable: boolean; by: string }) {
  const [upi, setUpi] = useState(d.upi != null ? String(d.upi) : '')
  const [card, setCard] = useState(d.card != null ? String(d.card) : '')
  const save = (u: string, c: string) => {
    if (u === '' && c === '') return
    saveSplit({ branch: d.branch, date: d.date, upi: r2(+u || 0), card: r2(+c || 0), addedBy: by, addedAt: new Date().toISOString() })
  }
  if (!editable) return <><td className="tabular-nums">{d.upi != null ? inr(d.upi) : <span className="text-amber-600">N/A</span>}</td><td className="tabular-nums">{d.card != null ? inr(d.card) : <span className="text-amber-600">N/A</span>}</td></>
  const box = inputCls + ' !w-28 !py-1 text-right placeholder:text-amber-600'
  return (
    <>
      <td><input type="number" step="0.01" aria-label={`UPI ${d.branch} ${d.date}`} className={box} placeholder="N/A" value={upi}
        onChange={(e) => { setUpi(e.target.value); const c = e.target.value === '' ? '' : String(r2(d.mobikwik - +e.target.value)); setCard(c) }}
        onBlur={() => save(upi, card)} /></td>
      <td><input type="number" step="0.01" aria-label={`Card ${d.branch} ${d.date}`} className={box} placeholder="N/A" value={card}
        onChange={(e) => setCard(e.target.value)} onBlur={() => save(upi, card)} /></td>
    </>
  )
}

// Mobikwik: every rupee taken at the counter, by how it was paid — cash, UPI and card.
export default function MobikwikPayments() {
  const R = useReportData()
  const { can } = useApp()
  const auth = useAuth()
  const all = usePaySplits()
  const editable = can('accounts', 'edit') || can('sales', 'edit')
  const [onlyOpen, setOnlyOpen] = useState(false)

  const days = useMemo(() => payDays(inMonth(R.d.entries, R.scope.month).filter((e) => !R.branch || e.branch === R.branch), all), [R.d.entries, R.scope.month, R.branch, all])
  const rows = days.filter((d) => !onlyOpen || (d.mobikwik > 0 && !d.split))
  const sum = (f: (d: PayDay) => number) => days.reduce((s, d) => s + f(d), 0)
  const cash = sum((d) => d.cash), mk = sum((d) => d.mobikwik), total = sum((d) => d.total)
  const upi = sum((d) => d.upi ?? 0), card = sum((d) => d.card ?? 0)
  const unsplit = days.filter((d) => d.mobikwik > 0 && !d.split)
  const off = days.filter((d) => d.split && Math.abs((d.upi ?? 0) + (d.card ?? 0) - d.mobikwik) > 1)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) + '%' : '—')

  const csv = () => downloadCsv(`BTI-Mobikwik-Payments-${R.month || 'all'}.csv`, [
    ['Date', 'Outlet', 'Cash', 'UPI', 'Card', 'Mobikwik (UPI + card)', 'Total collected'],
    ...days.map((d) => [d.date, branchName(d.branch), d.cash, d.upi ?? 'N/A', d.card ?? 'N/A', d.mobikwik, d.total]),
  ])
  const picker = <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES.filter((b) => b.id !== 'CK')} />

  if (!days.length) return <EmptyReport title="Mobikwik Payments" period={R.label} icon={Wallet} actions={picker} text="Cash, UPI and card figures appear once Imprest Books are uploaded for this period." />

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Mobikwik Payments" period={R.label} actions={picker} onCsv={csv} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total collected at the counter" value={money(total)} note={`${days.length} outlet-days`} />
        <Tile label="Cash" value={money(cash)} note={`${pct(cash)} of the total`} />
        <Tile label="UPI" value={unsplit.length && !upi ? 'N/A' : money(upi)} note={unsplit.length ? `${unsplit.length} day(s) not split yet` : `${pct(upi)} of the total`} tone={unsplit.length ? 'amber' : 'slate'} />
        <Tile label="Credit / debit card" value={unsplit.length && !card ? 'N/A' : money(card)} note={`Mobikwik total ${money(mk)}`} tone={unsplit.length ? 'amber' : 'slate'} />
      </div>

      {/* How the money came in */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">How customers paid</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <span title="Cash" style={{ width: pct(cash) }} className="bg-emerald-500" />
          <span title="UPI" style={{ width: pct(upi) }} className="bg-sky-500" />
          <span title="Card" style={{ width: pct(card) }} className="bg-violet-500" />
          <span title="Mobikwik, not split" style={{ width: pct(Math.max(0, mk - upi - card)) }} className="bg-amber-300" />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Banknote size={14} className="text-emerald-600" />Cash {pct(cash)}</span>
          <span className="inline-flex items-center gap-1.5"><Smartphone size={14} className="text-sky-600" />UPI {pct(upi)}</span>
          <span className="inline-flex items-center gap-1.5"><CreditCard size={14} className="text-violet-600" />Card {pct(card)}</span>
          {mk - upi - card > 1 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-300" />Mobikwik not split {pct(mk - upi - card)}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-600">Cash and the Mobikwik total come from the Imprest Book. {editable ? 'Type the UPI figure from the Mobikwik report; card fills in as the rest.' : ''}</p>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only days not split ({unsplit.length})</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{['Date', 'Outlet', 'Cash', 'UPI', 'Card', 'Mobikwik (UPI + card)', 'Total', ''].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2">
              {rows.map((d) => {
                const bad = d.split && Math.abs((d.upi ?? 0) + (d.card ?? 0) - d.mobikwik) > 1
                return (
                  <tr key={d.branch + d.date}>
                    <td className="whitespace-nowrap">{niceDate(d.date)}</td>
                    <td>{branchName(d.branch)}</td>
                    <td className="tabular-nums">{inr(d.cash)}</td>
                    <SplitCells key={d.split?.addedAt ?? 'none'} d={d} editable={editable && d.mobikwik > 0} by={auth.email ?? 'Demo user'} />
                    <td className="tabular-nums">{inr(d.mobikwik)}</td>
                    <td className="font-semibold tabular-nums">{inr(d.total)}</td>
                    <td>{d.mobikwik <= 0 ? null : bad ? <Badge tone="red">UPI + card ≠ Mobikwik</Badge> : d.split ? <Badge tone="green">split</Badge> : <Badge tone="amber">not split</Badge>}</td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={8} className="!py-8 text-center text-slate-500">Every day is split.</td></tr>}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold [&_td]:px-4 [&_td]:py-2.5">
              <tr><td colSpan={2}>Total</td><td className="tabular-nums">{inr(r2(cash))}</td><td className="tabular-nums">{inr(r2(upi))}</td><td className="tabular-nums">{inr(r2(card))}</td><td className="tabular-nums">{inr(r2(mk))}</td><td className="tabular-nums">{inr(r2(total))}</td><td>{off.length ? <Badge tone="red">{off.length} to fix</Badge> : null}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
