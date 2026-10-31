import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, PackagePlus } from 'lucide-react'
import { Card, Table } from '../../../components/ui'
import { Big, EmptyReport, ReportHeader, ScopePicker, ShareBar, Summary, Tile, downloadCsv, money } from '../../../components/report'
import { AddEntryButtons } from '../../../components/DayEntries'
import { useApp } from '../../../context/AppContext'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { niceDate } from '../../../data/entries'
import { monthName, purchases, useReportData } from '../../../data/analytics'

// What we bought, from whom, what we still owe, and which prices went up.
// Built from bills posted in the OCR Bill Inbox and purchases paid from branch cash (Imprest Book).
export default function PurchasesReport() {
  const { can } = useApp()
  const R = useReportData()
  const p = purchases(R.d, R.scope)
  const rises = p.prices.filter((x) => x.pct > 0.5)
  const picker = <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />

  if (!p.lines.length) {
    return <EmptyReport title="Purchases Report" period={R.hasData ? `${R.label} · no purchases yet` : 'Worked out from bills and Imprest Books'} icon={PackagePlus}
      actions={<>{R.hasData && picker}<AddEntryButtons disabled={!can('accounts', 'create')} /></>}
      text={<>Bills posted from the <Link className="font-medium text-[#7a2228] underline" to="/admin/accounting/bills">OCR Bill Inbox</Link> and groceries, vegetables or milk paid from branch cash show up here automatically, with vendor totals, what is still owed and price changes.</>}>
      {p.waiting > 0 && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{p.waiting} bill(s) are waiting in the OCR Bill Inbox. Check and post them to see them here.</p>}
    </EmptyReport>
  }

  const csv = () => downloadCsv(`BTI-Purchases-${R.month || 'all'}.csv`, [
    ['Date', 'Branch', 'Ledger', 'Vendor', 'From', 'Amount (without GST)'],
    ...p.lines.map((l) => [l.date, branchName(l.branch), l.ledger, l.vendor ?? '', l.from, l.amount]),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Purchases Report" period={`${R.label} · ${R.branch ? branchName(R.branch) : 'all branches'} · what we bought, from whom, and what we still owe`}
        actions={picker} onCsv={csv} />

      <Summary points={[
        <>BTI bought <Big>{money(p.total)}</Big> of ingredients and supplies (without GST): {money(p.fromBills)} from posted bills and {money(p.fromEntries)} paid from branch cash.</>,
        p.byLedger[0] && <>Most went on <Big>{p.byLedger[0].k}</Big> ({money(p.byLedger[0].v)}).</>,
        p.vendors[0] ? <>The biggest vendor is <Big>{p.vendors[0].vendor}</Big> ({money(p.vendors[0].bought)} across {p.vendors[0].bills} bill(s)).</> : <>No vendor bills posted yet; these purchases were paid from branch cash.</>,
        p.owedTotal > 0 ? <>We still owe vendors <Big>{money(p.owedTotal)}</Big>{p.owedList[0] ? <>, most of it to <Big>{p.owedList[0].vendor}</Big> ({money(p.owedList[0].v)})</> : null}.</> : <>Nothing is owed to vendors.</>,
        rises.length ? <>Prices went up for <Big>{rises.slice(0, 3).map((r) => r.item).join(', ')}</Big>. {rises[0].item} rose the most, by <Big>{rises[0].pct.toFixed(0)}%</Big>.</> : <>No price rises found between bills.</>,
        p.waiting ? <><Big>{p.waiting} bill(s)</Big> are still waiting in the OCR Bill Inbox and are not counted yet.</> : null,
      ].filter(Boolean)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total bought" value={money(p.total)} note={`${p.posted} posted bill(s) + cash purchases`} />
        <Tile label="Still to pay vendors" value={money(p.owedTotal)} tone={p.owedTotal ? 'amber' : 'green'} note={p.owedList.length ? `${p.owedList.length} vendor(s)` : 'Nothing due'} />
        <Tile label="GST paid on bills" value={money(p.gstPaid)} note="Claimable as input credit" />
        <Tile label="Prices gone up" value={String(rises.length)} tone={rises.length ? 'red' : 'green'} note={rises.length ? rises.slice(0, 2).map((r) => r.item).join(', ') : 'None'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Vendors" className="lg:col-span-3" pad={false}>
          {p.vendors.length ? (
            <Table head={['Vendor', 'Bills', 'Bought', 'Still to pay']}>
              {p.vendors.map((v) => (
                <tr key={v.vendor}>
                  <td className="font-medium text-slate-900">{v.vendor}<span className="block text-xs font-normal text-slate-500">{v.credit ? 'On credit' : 'Paid in cash'}</span></td>
                  <td className="tabular-nums">{v.bills}</td>
                  <td className="tabular-nums">{inr(v.bought)}</td>
                  <td className={`tabular-nums font-medium ${v.owed > 0.5 ? 'text-amber-700' : 'text-emerald-600'}`}>{v.owed > 0.5 ? inr(v.owed) : 'Nothing due'}</td>
                </tr>
              ))}
            </Table>
          ) : <p className="px-4 py-3 text-sm text-slate-500">No vendor bills posted in this period.</p>}
        </Card>
        <Card title="What we spent on" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {p.byLedger.map(({ k, v }) => (
              <li key={k} className="px-4 py-2.5">
                <div className="mb-1.5 flex justify-between text-sm"><span>{k}</span><b className="tabular-nums">{money(v)}</b></div>
                <ShareBar value={v} max={p.byLedger[0].v} color="#d9a441" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Price changes between bills" pad={false}>
          {p.prices.length ? (
            <ul className="divide-y divide-slate-100">
              {p.prices.slice(0, 15).map((c) => {
                const Icon = c.pct >= 0 ? ArrowUpRight : ArrowDownRight
                return (
                  <li key={c.item + c.unit} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1"><span className="block font-medium">{c.item}</span><span className="text-xs text-slate-500">since {niceDate(c.since)} · {c.vendor}</span></span>
                    <span className="tabular-nums text-slate-500">₹{c.before} → <b className="text-slate-900">₹{c.now}</b>{c.unit ? ` / ${c.unit}` : ''}</span>
                    <span className={`flex w-16 items-center justify-end gap-0.5 text-xs font-medium ${c.pct > 0.5 ? 'text-rose-600' : c.pct < -0.5 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <Icon size={14} />{Math.abs(c.pct).toFixed(0)}%
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-4 py-3 text-sm text-slate-500">Price changes appear once the same item is on two posted bills from different days.</p>}
        </Card>
        <Card title="Items we spent the most on (posted bills)" pad={false}>
          {p.items.length ? (
            <ul className="divide-y divide-slate-100">
              {p.items.map(({ k, v }) => (
                <li key={k} className="px-4 py-2.5">
                  <div className="mb-1.5 flex justify-between text-sm"><span>{k}</span><b className="tabular-nums">{money(v, false)}</b></div>
                  <ShareBar value={v} max={p.items[0].v} />
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-3 text-sm text-slate-500">No posted bills in this period.</p>}
        </Card>
      </div>

      <Card title="Every purchase" className="mt-4" pad={false}>
        <Table head={['Date', 'Branch', 'Ledger', 'Vendor / from', 'Amount']}>
          {p.lines.map((l) => (
            <tr key={l.key}>
              <td>{niceDate(l.date)}</td>
              <td className="font-medium text-slate-900">{branchName(l.branch)}</td>
              <td>{l.ledger}</td>
              <td className="text-slate-500">{l.vendor ?? l.from}{l.billId && <Link className="ml-2 text-[#7a2228] hover:underline" to={`/admin/accounting/bills?id=${l.billId}`}>{l.billId}</Link>}</td>
              <td className="tabular-nums">{inr(l.amount)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold"><td colSpan={4}>Total</td><td className="tabular-nums">{inr(p.total)}</td></tr>
        </Table>
      </Card>
    </div>
  )
}
