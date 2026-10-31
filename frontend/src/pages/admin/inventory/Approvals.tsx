import { Link } from 'react-router-dom'
import { ClipboardCheck, ScanLine } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { BRANCHES, PURCHASE_ORDERS, branchName, inr } from '../../../data/mock'
import { niceDate } from '../../../data/entries'
import { billSums, useBills } from '../../../data/billStore'
import { useManualVouchers } from '../../../data/ledgerStore'
import { OpsHeader } from '../ops/shared'

const empty = (icon: typeof ScanLine, title: string, text: React.ReactNode) => {
  const Icon = icon
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon size={22} /></span>
      <p className="mt-3 font-medium text-slate-800">{title}</p>
      <p className="max-w-md text-sm text-slate-500">{text}</p>
    </div>
  )
}

// Purchase orders raised by the kitchen that still need someone to approve or send them.
export function PoApproval() {
  const waiting = PURCHASE_ORDERS.filter((p) => p.status === 'draft' || p.status === 'sent')
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Purchase Order Approval" />
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {waiting.length ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2.5 font-medium">PO</th><th className="font-medium">Vendor</th><th className="font-medium">Date</th><th className="font-medium">Items</th><th className="px-5 text-right font-medium">Amount</th><th className="px-5 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {waiting.map((p) => (
                <tr key={p.id}><td className="px-5 py-3 font-medium">{p.id}</td><td>{p.vendor}</td><td>{niceDate(p.date)}</td><td>{p.lines.length}</td>
                  <td className="px-5 text-right tabular-nums">{inr(p.lines.reduce((s, l) => s + l.qty * l.rate, 0) + p.basket)}</td><td className="px-5"><Badge>{p.status}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        ) : empty(ClipboardCheck, 'No purchase orders waiting', <>Orders raised in <Link className="text-[#7a2228] underline" to="/admin/kitchen/purchase-orders">Kitchen Manager → Purchase Orders</Link> show here until they are approved and sent.</>)}
      </div>
    </div>
  )
}

// Bills that came in (goods already bought and used) but aren't posted to Account Books yet.
export function PendingPurchases() {
  const bills = useBills()
  const vouchers = useManualVouchers()
  const ids = new Set(vouchers.map((v) => v.id))
  const pending = bills.filter((b) => !(b.voucherId && ids.has(b.voucherId))).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const total = pending.reduce((s, b) => s + billSums(b).total, 0)
  const byOutlet = BRANCHES.map((b) => ({ b, n: pending.filter((x) => x.branch === b.id).length })).filter((x) => x.n)

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Pending Purchases" />
      <p className="-mt-2 mb-4 text-sm text-slate-500">Bills uploaded or entered but not yet checked and posted. Until they are posted they don't count in stock, purchases or food cost.</p>
      {byOutlet.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">{byOutlet.map(({ b, n }) => <span key={b.id} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-slate-200">{b.name} <b>{n}</b></span>)}</div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {pending.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2.5 font-medium">Bill</th><th className="font-medium">Vendor</th><th className="font-medium">Outlet</th><th className="font-medium">Bill date</th><th className="px-3 text-right font-medium">Amount</th><th className="px-5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pending.map((b) => (
                <tr key={b.id}><td className="px-5 py-3 font-medium">{b.id}</td><td>{b.vendor || '—'}</td><td>{branchName(b.branch)}</td><td>{b.date ? niceDate(b.date) : '—'}</td>
                  <td className="px-3 text-right tabular-nums">{inr(billSums(b).total)}</td>
                  <td className="px-5 text-right"><Link className="font-medium text-[#7a2228] hover:underline" to={`/admin/accounting/bills?id=${b.id}`}>Check &amp; post</Link></td></tr>
              ))}
              <tr className="bg-slate-50 font-semibold"><td className="px-5 py-2.5" colSpan={4}>{pending.length} bill(s)</td><td className="px-3 text-right tabular-nums">{inr(total)}</td><td /></tr>
            </tbody>
          </table>
        ) : empty(ScanLine, 'Nothing pending', 'Every bill in the OCR Bill Inbox is posted to Account Books.')}
      </div>
    </div>
  )
}
