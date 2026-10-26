import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Badge, Card } from '../../../components/ui'
import { Big, ReportHeader, ShareBar, Summary, Tile, downloadCsv, money } from '../../../components/report'
import { PRICE_CHANGES, PURCHASE_ORDERS, VENDOR_SPEND } from '../../../data/mock'

const PO_STATUS: Record<string, [string, 'blue' | 'amber' | 'green' | 'slate']> = {
  draft: ['Not sent yet', 'slate'],
  sent: ['Ordered, not received', 'blue'],
  received: ['Received, bill pending', 'amber'],
  billed: ['Received & billed', 'green'],
}

const niceDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export default function PurchasesReport() {
  const bought = VENDOR_SPEND.reduce((s, v) => s + v.bought, 0)
  const paid = VENDOR_SPEND.reduce((s, v) => s + v.paid, 0)
  const due = bought - paid
  const vendors = [...VENDOR_SPEND].sort((a, b) => b.bought - a.bought)
  const owed = VENDOR_SPEND.filter((v) => v.bought > v.paid).sort((a, b) => a.dueBy.localeCompare(b.dueBy))

  const byCat = Object.entries(VENDOR_SPEND.reduce<Record<string, number>>((m, v) => ({ ...m, [v.category]: (m[v.category] ?? 0) + v.bought }), {}))
    .sort((a, b) => b[1] - a[1])

  const changes = PRICE_CHANGES.map((p) => ({ ...p, pct: ((p.now - p.before) / p.before) * 100 })).sort((a, b) => b.pct - a.pct)
  const rises = changes.filter((c) => c.pct > 0)

  const csv = () => downloadCsv('BTI-Purchases-Report-Oct-2026.csv', [
    ['Vendor', 'Supplies', 'Bought', 'Paid', 'Still to pay', 'Payment terms', 'Pay by'],
    ...vendors.map((v) => [v.vendor, v.category, v.bought, v.paid, v.bought - v.paid, v.terms, v.dueBy]),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title="Purchases Report" period="October 2026 · what we bought, from whom, and what we still owe" onCsv={csv} />

      <Summary points={[
        <>BTI bought <Big>{money(bought)}</Big> worth of goods from <Big>{VENDOR_SPEND.length} vendors</Big> this month.</>,
        <>The most was bought from <Big>{vendors[0].vendor}</Big> ({money(vendors[0].bought)}, {vendors[0].category.toLowerCase()}).</>,
        due > 0
          ? <>We still owe vendors <Big>{money(due)}</Big>. The next payment is <Big>{money(owed[0].bought - owed[0].paid)}</Big> to {owed[0].vendor}, due by <Big>{niceDate(owed[0].dueBy)}</Big>.</>
          : <>All vendors have been paid in full.</>,
        rises.length
          ? <>Prices went up for <Big>{rises.map((r) => r.item).join(', ')}</Big>. {rises[0].item} rose the most, by <Big>{rises[0].pct.toFixed(0)}%</Big>.</>
          : <>No price increases this month.</>,
      ]} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total bought" value={money(bought)} note={`From ${VENDOR_SPEND.length} vendors`} />
        <Tile label="Already paid" value={money(paid)} tone="green" />
        <Tile label="Still to pay" value={money(due)} note={owed.length ? `${owed.length} vendors` : 'Nothing due'} tone={due ? 'amber' : 'green'} />
        <Tile label="Prices gone up" value={String(rises.length)} note={rises.length ? rises.map((r) => r.item).join(', ') : 'None'} tone={rises.length ? 'red' : 'green'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Vendors this month" className="lg:col-span-3" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 text-right font-medium">Bought</th>
                  <th className="px-3 text-right font-medium">Paid</th>
                  <th className="px-3 text-right font-medium">Still to pay</th>
                  <th className="px-4 text-left font-medium">How we pay them</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => {
                  const left = v.bought - v.paid
                  return (
                    <tr key={v.vendor}>
                      <td className="px-4 py-2.5"><span className="block font-medium">{v.vendor}</span><span className="text-xs text-slate-500">{v.category}</span></td>
                      <td className="px-3 text-right tabular-nums">{money(v.bought, false)}</td>
                      <td className="px-3 text-right tabular-nums text-slate-500">{money(v.paid, false)}</td>
                      <td className={`px-3 text-right font-medium tabular-nums ${left ? 'text-amber-700' : 'text-emerald-600'}`}>{left ? money(left, false) : 'Paid ✓'}</td>
                      <td className="px-4 text-xs text-slate-600">{v.terms}{left > 0 && v.dueBy && <span className="block text-amber-700">Pay by {niceDate(v.dueBy)}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="What we spent on" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-slate-100">
            {byCat.map(([cat, v]) => (
              <li key={cat} className="px-4 py-2.5">
                <div className="mb-1.5 flex justify-between text-sm"><span>{cat}</span><b className="tabular-nums">{money(v)}</b></div>
                <ShareBar value={v} max={byCat[0][1]} color="#d9a441" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Price changes since last month" pad={false}>
          <ul className="divide-y divide-slate-100">
            {changes.map((c) => {
              const Icon = c.pct > 0 ? ArrowUpRight : c.pct < 0 ? ArrowDownRight : Minus
              const tone = c.pct > 0 ? 'text-rose-600' : c.pct < 0 ? 'text-emerald-600' : 'text-slate-400'
              return (
                <li key={c.item} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 font-medium">{c.item}</span>
                  <span className="text-slate-500 tabular-nums">₹{c.before} → <b className="text-slate-900">₹{c.now}</b> per {c.unit}</span>
                  <span className={`flex w-20 items-center justify-end gap-0.5 text-xs font-medium ${tone}`}>
                    <Icon size={14} />{c.pct === 0 ? 'Same' : Math.abs(c.pct).toFixed(0) + '%'}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Red means we are paying more than last month.</p>
        </Card>

        <Card title="Recent purchase orders" pad={false}>
          <ul className="divide-y divide-slate-100">
            {PURCHASE_ORDERS.map((po) => {
              const total = po.lines.reduce((s, l) => s + l.qty * l.rate, 0) + po.basket
              const [label, tone] = PO_STATUS[po.status] ?? [po.status, 'slate']
              return (
                <li key={po.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{po.vendor}</span>
                    <span className="block truncate text-xs text-slate-500">{po.lines.map((l) => `${l.item} ${l.qty} ${l.unit}`).join(', ')} · {niceDate(po.date)}</span>
                  </span>
                  <b className="text-sm tabular-nums">{money(total, false)}</b>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
