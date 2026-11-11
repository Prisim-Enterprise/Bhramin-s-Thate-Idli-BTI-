import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Info } from 'lucide-react'
import { Badge, Table, Tabs } from '../../../components/ui'
import { downloadCsv } from '../../../components/report'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { niceDate } from '../../../data/entries'
import { itemKey, useClosingCounts, usePostedBills } from '../../../data/inventory'
import { CK, LOW_SHARE, lowState, stockAt, useReorderLevels, useStockMoves, type Low, type StockItem } from '../../../data/kitchen'
import { isTransportInward } from '../../../data/analytics'
import { OpsHeader, selCls } from '../ops/shared'

type TabId = 'all' | 'bought' | 'low'
type Bought = { qty: number; value: number; lastDate: string; lastVendor: string; lastRate: number; ledger: string; bills: number }
type Row = StockItem & { branch: string; low: Low | null; bought: Bought | null }

const n = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const status = (r: Row) => (r.onHand < 0 ? 'check count' : r.low?.why === 'out' ? 'finished' : r.low ? 'running low' : 'in stock')
const why = (l: Low, unit: string) => (l.why === 'out' ? 'nothing left' : l.why === 'level' ? `reorder level ${l.limit} ${unit}` : `under ${LOW_SHARE * 100}% of last delivery (${l.limit} ${unit})`)

function StatusBadge({ r }: { r: Row }) {
  const s = status(r)
  return <Badge tone={s === 'in stock' ? 'green' : s === 'running low' || s === 'check count' ? 'amber' : 'red'}>{s}</Badge>
}

/** Every item in stock at each location: what was bought, what's on hand, and what is running out. */
export default function InventoryItems() {
  const posted = usePostedBills()
  const moves = useStockMoves()
  const counts = useClosingCounts()
  const levels = useReorderLevels()
  const [params, setParams] = useSearchParams()
  const tab = (['all', 'bought', 'low'].includes(params.get('tab') ?? '') ? params.get('tab') : 'all') as TabId
  const setTab = (t: TabId) => { const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }) }
  // Location lives in the address, so a bell alert opens straight onto its location.
  const place = params.get('branch') ?? ''
  const setPlace = (b: string) => { const p = new URLSearchParams(params); if (b) p.set('branch', b); else p.delete('branch'); setParams(p, { replace: true }) }
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    // Purchases per location and item, from posted bills (freight / hamali are charges, not goods).
    const buys = new Map<string, Bought>()
    for (const b of [...posted].sort((x, y) => x.date.localeCompare(y.date))) {
      for (const l of b.lines) {
        if (!l.item.trim() || l.qty <= 0 || isTransportInward(l.ledger ?? '') || isTransportInward(l.item)) continue
        const k = b.branch + '|' + itemKey(l.item, l.unit)
        const cur = buys.get(k) ?? { qty: 0, value: 0, lastDate: '', lastVendor: '', lastRate: 0, ledger: '', bills: 0 }
        buys.set(k, { qty: cur.qty + l.qty, value: cur.value + l.qty * l.rate, lastDate: b.date, lastVendor: b.vendor, lastRate: l.rate, ledger: l.ledger || cur.ledger, bills: cur.bills + 1 })
      }
    }
    const out: Row[] = []
    for (const br of BRANCHES) {
      for (const s of stockAt(br.id, posted, moves, counts)) {
        out.push({ ...s, branch: br.id, low: lowState(s, br.id === CK ? levels[s.key]?.reorder : undefined), bought: buys.get(br.id + '|' + s.key) ?? null })
      }
    }
    return out
  }, [posted, moves, counts, levels])

  const mine = rows.filter((r) => (!place || r.branch === place) && r.item.toLowerCase().includes(q.trim().toLowerCase()))
  const lists: Record<TabId, Row[]> = {
    all: mine,
    bought: mine.filter((r) => r.bought).sort((a, b) => b.bought!.lastDate.localeCompare(a.bought!.lastDate)),
    low: mine.filter((r) => r.low).sort((a, b) => (a.low!.why === 'out' ? 0 : 1) - (b.low!.why === 'out' ? 0 : 1) || a.onHand - b.onHand),
  }
  const list = lists[tab]
  const value = mine.reduce((s, r) => s + r.value, 0)

  const csv = () => downloadCsv(`BTI-Inventory-Items-${tab}.csv`, [
    ['Item', 'Unit', 'Location', 'Category', 'On hand', 'Status', 'Bought (all bills)', 'Bought value', 'Last bought', 'Last vendor', 'Last rate', 'Stock value'],
    ...list.map((r) => [r.item, r.unit, branchName(r.branch), r.bought?.ledger ?? '', r.onHand, status(r), r.bought?.qty ?? '', r.bought ? Math.round(r.bought.value) : '', r.bought?.lastDate ?? '', r.bought?.lastVendor ?? '', r.rate || '', Math.round(r.value)]),
  ])

  const itemCell = (r: Row) => (
    <td><span className="font-medium text-slate-900">{r.item}</span> <span className="text-slate-500">[{r.unit || 'N/A'}]</span>{r.bought?.ledger && <span className="block text-xs text-slate-400">{r.bought.ledger}</span>}</td>
  )
  const placeCell = (r: Row) => <td className="whitespace-nowrap">{branchName(r.branch)}</td>
  const empty = (cols: number, text: string) => !list.length && <tr><td colSpan={cols} className="!py-10 text-center text-slate-500">{text}</td></tr>

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Inventory Items">
        <button onClick={csv} className={selCls + ' inline-flex items-center gap-1.5 font-medium hover:bg-slate-50'}><Download size={15} /> Export</button>
      </OpsHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Items in stock</p><p className="mt-1 text-2xl font-semibold tabular-nums">{mine.filter((r) => r.onHand > 0).length}</p><p className="text-xs text-slate-500">worth {inr(Math.round(value))}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Purchased items</p><p className="mt-1 text-2xl font-semibold tabular-nums">{lists.bought.length}</p><p className="text-xs text-slate-500">from posted bills</p></div>
        <button onClick={() => setTab('low')} className={`rounded-xl border p-4 text-left ${lists.low.length ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
          <p className="text-xs text-slate-500">Running low / out of stock</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${lists.low.length ? 'text-rose-700' : ''}`}>{lists.low.length}</p>
          <p className="text-xs text-slate-500">{lists.low.filter((r) => r.low?.why === 'out').length} finished</p>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="text-xs font-semibold text-slate-600">Location
            <select className={selCls + ' mt-1 block'} value={place} onChange={(e) => setPlace(e.target.value)}><option value="">All locations</option>{BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Item<input className={selCls + ' mt-1 block'} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <Tabs<TabId> value={tab} onChange={setTab} tabs={[
          { id: 'all', label: 'All items', count: lists.all.length },
          { id: 'bought', label: 'Purchased items', count: lists.bought.length },
          { id: 'low', label: 'Running low / out of stock', count: lists.low.length },
        ]} />

        {tab === 'all' && (
          <Table head={['Item', 'Location', 'On hand', 'Last count', 'In since', 'Out since', 'Last rate', 'Value', 'Status']}>
            {list.map((r) => (
              <tr key={r.branch + r.key}>
                {itemCell(r)}{placeCell(r)}
                <td className={`font-semibold tabular-nums ${r.onHand <= 0 ? 'text-rose-600' : ''}`}>{n(r.onHand)}</td>
                <td className="tabular-nums">{r.counted != null ? <>{n(r.counted)}<span className="block text-xs text-slate-400">{niceDate(r.countedOn!)}</span></> : '—'}</td>
                <td className="tabular-nums text-emerald-700">+{n(r.inQty)}</td>
                <td className="tabular-nums text-sky-700">−{n(r.outQty)}</td>
                <td className="tabular-nums text-slate-500">{r.rate ? '₹' + r.rate : '—'}</td>
                <td className="tabular-nums">{inr(Math.round(r.value))}</td>
                <td><StatusBadge r={r} /></td>
              </tr>
            ))}
            {empty(9, 'No items yet. Items appear once bills are posted, goods are received or stock is counted.')}
          </Table>
        )}

        {tab === 'bought' && (
          <Table head={['Item', 'Location', 'Bought (all bills)', 'Bought value', 'Bills', 'Last bought', 'Last vendor', 'Last rate', 'On hand', 'Status']}>
            {list.map((r) => (
              <tr key={r.branch + r.key}>
                {itemCell(r)}{placeCell(r)}
                <td className="tabular-nums text-emerald-700">{n(r.bought!.qty)} {r.unit}</td>
                <td className="tabular-nums">{inr(Math.round(r.bought!.value))}</td>
                <td className="tabular-nums">{r.bought!.bills}</td>
                <td className="whitespace-nowrap">{niceDate(r.bought!.lastDate)}</td>
                <td>{r.bought!.lastVendor || 'N/A'}</td>
                <td className="tabular-nums">₹{r.bought!.lastRate}</td>
                <td className="font-semibold tabular-nums">{n(r.onHand)}</td>
                <td><StatusBadge r={r} /></td>
              </tr>
            ))}
            {empty(10, 'No purchased items yet. Post bills from the OCR Bill Inbox and they show up here.')}
          </Table>
        )}

        {tab === 'low' && (
          <Table head={['Item', 'Location', 'Left', 'Why', 'Last delivery', 'Last vendor', 'Status', '']}>
            {list.map((r) => (
              <tr key={r.branch + r.key} className={r.low!.why === 'out' ? 'bg-rose-50/60' : ''}>
                {itemCell(r)}{placeCell(r)}
                <td className="font-semibold tabular-nums text-rose-700">{n(Math.max(0, r.onHand))} {r.unit}</td>
                <td className="text-slate-600">{why(r.low!, r.unit)}</td>
                <td className="tabular-nums">{r.lastIn ? `${n(r.lastIn)} ${r.unit}` : '—'}</td>
                <td>{r.bought?.lastVendor || (r.branch === CK ? '—' : 'Centre Kitchen')}</td>
                <td><StatusBadge r={r} /></td>
                <td className="text-right">
                  <Link to={r.branch === CK ? '/admin/kitchen/purchase-orders' : '/admin/kitchen/indents'} className="whitespace-nowrap text-sm font-medium text-[#7a2228] hover:underline">
                    {r.branch === CK ? 'Order more' : 'Raise indent'}
                  </Link>
                </td>
              </tr>
            ))}
            {empty(8, 'Nothing is running low.')}
          </Table>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>On hand = last closing count + posted bills + goods from the Centre Kitchen − goods sent out. An item is running low at its reorder level (Centre Kitchen, set in the Control Panel), or under {LOW_SHARE * 100}% of its last delivery; the bell warns when one starts running low. Outlets show what they used at their next <Link to="/admin/inventory/closing" className="text-[#7a2228] underline">closing count</Link>.</span>
      </p>
    </div>
  )
}
