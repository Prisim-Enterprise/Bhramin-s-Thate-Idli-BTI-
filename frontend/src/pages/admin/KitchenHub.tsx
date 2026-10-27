import { money } from '../../components/report'
import { INDENTS, PURCHASE_ORDERS, STOCK } from '../../data/mock'
import Hub, { type HubStat } from './Hub'

// Kitchen Manager home: big buttons for indents, stock and purchase orders.
export default function KitchenHub() {
  const waiting = INDENTS.filter((i) => i.status === 'pending' || i.status === 'partial').length
  const out = STOCK.filter((s) => s.qty === 0).length
  const low = STOCK.filter((s) => s.qty > 0 && s.qty <= s.reorder).length
  const openPOs = PURCHASE_ORDERS.filter((p) => p.status !== 'billed')
  const openValue = openPOs.reduce((s, p) => s + p.lines.reduce((t, l) => t + l.qty * l.rate, 0) + p.basket, 0)

  const stats: Record<string, HubStat> = {
    '/admin/kitchen/indents': { value: String(waiting), caption: waiting === 1 ? 'indent waiting' : 'indents waiting', tone: waiting ? 'warn' : 'good' },
    '/admin/kitchen/storage': !STOCK.length
      ? { value: 'Empty', caption: 'no stock recorded yet' }
      : out || low
      ? { value: `${out} out · ${low} low`, caption: 'items need restocking', tone: out ? 'bad' : 'warn' }
      : { value: 'All good', caption: 'everything in stock', tone: 'good' },
    '/admin/kitchen/purchase-orders': { value: String(openPOs.length), caption: `open orders · ${money(openValue, false)}` },
  }

  return <Hub id="kitchen" stats={stats} />
}
