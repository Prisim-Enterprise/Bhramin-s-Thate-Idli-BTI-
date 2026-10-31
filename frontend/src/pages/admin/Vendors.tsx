import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, Truck } from 'lucide-react'
import { Badge, Card } from '../../components/ui'
import { ScopePicker, Tile, downloadCsv, money } from '../../components/report'
import { BRANCHES, branchName, inr, type Bill } from '../../data/mock'
import { niceDate } from '../../data/entries'
import { billSums } from '../../data/billStore'
import { groupOf, ledgerKey, sides } from '../../data/ledgerStore'
import { imprestLedger } from '../../data/books'
import { monthName, useReportData } from '../../data/analytics'

// Every vendor we buy from: how much, how many bills, and what we still owe.
// A vendor's bills are added up under one name, however the name was written on each bill.
type VendorRow = { key: string; name: string; bills: Bill[]; base: number; total: number; credit: number; cash: number; owed: number; last: string; branches: string[] }

export default function Vendors() {
  const R = useReportData()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sort, setSort] = useState<'total' | 'name' | 'last'>('total')
  const [allTime, setAllTime] = useState(true)

  const rows = useMemo(() => {
    const vouchers = new Set(R.d.manual.map((m) => m.id))
    const inScope = (b: Bill) => (allTime || !R.scope.month || b.date.startsWith(R.scope.month)) && (!R.scope.branch || b.branch === R.scope.branch)
    const posted = R.d.bills.filter((b) => b.voucherId && vouchers.has(b.voucherId) && b.vendor.trim() && inScope(b))
    // One spelling per vendor: the ledger name if there is one, otherwise the first one used.
    const names = new Map<string, string>()
    R.d.custom.filter((c) => c.group === 'creditors').forEach((c) => names.set(ledgerKey(c.name), c.name))
    // What we owe: credits to the vendor's ledger less payments to it (all time).
    const owed = new Map<string, number>()
    for (const m of R.d.manual) {
      const ls = m.lines?.length ? m.lines : [{ ledger: sides(m, imprestLedger).dr, dr: m.amount, cr: 0 }, { ledger: sides(m, imprestLedger).cr, dr: 0, cr: m.amount }]
      for (const l of ls) if (groupOf(l.ledger, R.d.custom) === 'creditors') owed.set(ledgerKey(l.ledger), (owed.get(ledgerKey(l.ledger)) ?? 0) + l.cr - l.dr)
    }
    const map = new Map<string, VendorRow>()
    for (const b of [...posted].sort((a, z) => a.date.localeCompare(z.date))) {
      const k = ledgerKey(b.vendor)
      if (!names.has(k)) names.set(k, b.vendor.trim())
      const r = map.get(k) ?? { key: k, name: names.get(k)!, bills: [], base: 0, total: 0, credit: 0, cash: 0, owed: Math.round((owed.get(k) ?? 0) * 100) / 100, last: '', branches: [] }
      const s = billSums(b)
      r.bills.push(b)
      r.base += s.subtotal
      r.total += s.total
      if (b.type === 'credit') r.credit += s.total; else r.cash += s.total
      if (b.date > r.last) r.last = b.date
      if (!r.branches.includes(b.branch)) r.branches.push(b.branch)
      map.set(k, r)
    }
    return [...map.values()]
  }, [R.d, R.scope.month, R.scope.branch, allTime])

  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'last' ? b.last.localeCompare(a.last) : b.total - a.total))
  const sum = (f: (r: VendorRow) => number) => shown.reduce((t, r) => t + f(r), 0)
  const period = allTime ? 'All time' : R.label

  const csv = () => downloadCsv(`BTI-Vendors-${allTime ? 'all-time' : R.month}.csv`, [
    ['Vendor', 'Bills', 'Purchase without GST', 'Purchase with GST', 'On credit', 'Paid in cash', 'Still to pay', 'Last bill', 'Branches'],
    ...shown.map((r) => [r.name, r.bills.length, Math.round(r.base), Math.round(r.total), Math.round(r.credit), Math.round(r.cash), Math.round(r.owed), r.last, r.branches.map(branchName).join(' / ')]),
  ])
  const ledgerLink = (name: string) => `/admin/accounting/books?book=ledger&ledger=${encodeURIComponent(name)}`

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">{period} · {R.branch ? branchName(R.branch) : 'all branches'} · every vendor and how much we bought from each</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            <button onClick={() => setAllTime(true)} className={`rounded-md px-3 py-1.5 font-medium ${allTime ? 'bg-[#7a2228] text-white' : 'text-slate-600'}`}>All time</button>
            <button onClick={() => setAllTime(false)} className={`rounded-md px-3 py-1.5 font-medium ${!allTime ? 'bg-[#7a2228] text-white' : 'text-slate-600'}`}>By month</button>
          </div>
          {R.hasData && <ScopePicker months={allTime ? [] : R.months} month={allTime ? '' : R.month} setMonth={(m) => { setAllTime(!m); R.setMonth(m) }} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />}
          <button onClick={csv} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Download</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Vendors" value={String(shown.length)} />
        <Tile label="Total purchase (with GST)" value={money(sum((r) => r.total))} note={`${money(sum((r) => r.base))} without GST`} />
        <Tile label="Bills" value={String(sum((r) => r.bills.length))} />
        <Tile label="Still to pay vendors" value={money(rows.reduce((t, r) => t + Math.max(0, r.owed), 0))} tone={rows.some((r) => r.owed > 0.5) ? 'amber' : 'green'} note="All time, credit bills less payments" />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search vendor" placeholder="Search vendor" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select aria-label="Sort" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="total">Most bought first</option><option value="last">Latest bill first</option><option value="name">A to Z</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>{['Vendor', 'Bills', 'Purchase (no GST)', 'Purchase (with GST)', 'On credit', 'Paid in cash', 'Still to pay', 'Last bill'].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i && i < 7 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const isOpen = open === r.key
                return (
                  <Fragment key={r.key}>
                    <tr className="cursor-pointer hover:bg-[#fdf8ee]" onClick={() => setOpen(isOpen ? null : r.key)}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-slate-900">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Truck size={15} className="text-[#7a2228]" />{r.name}</span>
                        <span className="ml-[46px] block text-xs text-slate-500">{r.branches.map(branchName).join(', ')}</span>
                      </td>
                      <td className="px-4 text-right tabular-nums">{r.bills.length}</td>
                      <td className="px-4 text-right tabular-nums">{inr(Math.round(r.base))}</td>
                      <td className="px-4 text-right font-semibold tabular-nums">{inr(Math.round(r.total))}</td>
                      <td className="px-4 text-right tabular-nums">{r.credit ? inr(Math.round(r.credit)) : '—'}</td>
                      <td className="px-4 text-right tabular-nums">{r.cash ? inr(Math.round(r.cash)) : '—'}</td>
                      <td className={`px-4 text-right font-medium tabular-nums ${r.owed > 0.5 ? 'text-amber-700' : 'text-emerald-600'}`}>{r.owed > 0.5 ? inr(Math.round(r.owed)) : 'Nothing due'}</td>
                      <td className="px-4 text-slate-500">{r.last ? niceDate(r.last) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#fffaf0]">
                        <td colSpan={8} className="px-4 pb-4 pt-1">
                          <div className="mb-2 flex flex-wrap gap-4 text-sm">
                            {r.credit > 0 && <Link className="font-medium text-[#7a2228] hover:underline" to={ledgerLink(r.name)}>Open {r.name} ledger</Link>}
                            <span className="text-slate-500">{r.bills.length} bill(s) · {inr(Math.round(r.total))}</span>
                          </div>
                          <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500"><tr><th className="py-1 text-left font-medium">Bill date</th><th className="text-left font-medium">Bill no.</th><th className="text-left font-medium">Branch</th><th className="text-left font-medium">Paid</th><th className="text-right font-medium">Amount</th><th /></tr></thead>
                            <tbody>
                              {[...r.bills].reverse().map((b) => (
                                <tr key={b.id} className="border-t border-slate-200/60">
                                  <td className="py-1.5">{niceDate(b.date)}</td><td>{b.invoiceNo || '—'}</td><td>{branchName(b.branch)}</td>
                                  <td><Badge tone={b.type === 'credit' ? 'amber' : 'green'}>{b.type === 'credit' ? 'on credit' : 'cash'}</Badge></td>
                                  <td className="text-right tabular-nums">{inr(billSums(b).total)}</td>
                                  <td className="pl-4 text-right"><Link className="font-medium text-[#7a2228] hover:underline" to={`/admin/accounting/bills?id=${b.id}`}>{b.id}</Link></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {!shown.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No vendors yet. Vendors appear here once their bills are posted from the OCR Bill Inbox.</td></tr>}
              {shown.length > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2.5">Total</td><td className="px-4 text-right tabular-nums">{sum((r) => r.bills.length)}</td>
                  <td className="px-4 text-right tabular-nums">{inr(Math.round(sum((r) => r.base)))}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(sum((r) => r.total)))}</td>
                  <td className="px-4 text-right tabular-nums">{inr(Math.round(sum((r) => r.credit)))}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(sum((r) => r.cash)))}</td>
                  <td className="px-4 text-right tabular-nums">{inr(Math.round(sum((r) => Math.max(0, r.owed))))}</td><td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Click a vendor to see each bill. Bills from the same vendor are added up under one name even if the name was written slightly differently.</p>
      </Card>
    </div>
  )
}
