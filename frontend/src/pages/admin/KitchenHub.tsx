import { money } from '../../components/report'
import { PURCHASE_ORDERS } from '../../data/mock'
import { useCentreKitchen } from '../../data/kitchen'
import Hub, { type HubStat } from './Hub'

// Kitchen Manager home: big buttons for the Centre Kitchen, indents, stock and purchase orders.
export default function KitchenHub() {
  const ck = useCentreKitchen()
  const waiting = ck.indents.filter((i) => i.status === 'open' || i.status === 'part').length
  const stockValue = ck.stock.reduce((t, s) => t + s.value, 0)
  const openPOs = PURCHASE_ORDERS.filter((p) => p.status !== 'billed')
  const openValue = openPOs.reduce((s, p) => s + p.lines.reduce((t, l) => t + l.qty * l.rate, 0) + p.basket, 0)
  const today = new Date().toLocaleDateString('en-CA')
  const outToday = ck.flows.filter((f) => f.kind === 'out' && f.date === today)

  const stats: Record<string, HubStat> = {
    '/admin/kitchen/centre': { value: money(outToday.reduce((t, f) => t + f.value, 0)), caption: `sent to outlets today · ${outToday.length} issue(s)` },
    '/admin/kitchen/indents': { value: String(waiting), caption: waiting === 1 ? 'indent waiting' : 'indents waiting', tone: waiting ? 'warn' : 'good' },
    '/admin/kitchen/storage': !ck.stock.length
      ? { value: 'Empty', caption: 'no stock recorded yet' }
      : ck.low.length
      ? { value: `${ck.low.length} to reorder`, caption: `stock worth ${money(stockValue)}`, tone: 'warn' }
      : { value: money(stockValue), caption: `stock on hand · ${ck.stock.length} items`, tone: 'good' },
    '/admin/kitchen/purchase-orders': { value: String(openPOs.length), caption: `open orders · ${money(openValue, false)}` },
  }

  return <Hub id="kitchen" stats={stats} />
}
