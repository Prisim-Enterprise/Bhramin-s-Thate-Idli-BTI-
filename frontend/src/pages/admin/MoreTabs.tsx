import { Link } from 'react-router-dom'
import { Gift, Megaphone, MessageCircle, Phone, Search, Star, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { Badge } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES, BRANCH_INFO, RECIPES, inr } from '../../data/mock'
import { useEntries } from '../../data/entries'
import { NeedsConnection, OpsHeader } from './ops/shared'

function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fbf3e4] text-[#7a2228]"><Icon size={22} /></span>
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      <p className="max-w-lg text-sm text-slate-500">{text}</p>
    </div>
  )
}

/** Menu: dishes with their price and ingredient cost. Filled from the POS menu once it is connected. */
export function MenuPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Menu" />
      <NeedsConnection what="The menu (dishes, prices, categories) is synced from the POS once it is connected." />
      {RECIPES.length ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2.5 font-medium">Dish</th><th className="font-medium">Category</th><th className="px-3 text-right font-medium">Price</th><th className="px-3 text-right font-medium">Ingredient cost</th><th className="px-5 text-right font-medium">Food cost</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {RECIPES.map((r) => <tr key={r.dish}><td className="px-5 py-3 font-medium">{r.dish}</td><td>{r.category}</td><td className="px-3 text-right">{inr(r.price)}</td><td className="px-3 text-right">{inr(r.cost)}</td><td className="px-5 text-right">{((r.cost / r.price) * 100).toFixed(0)}%</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={UtensilsCrossed} title="No menu items yet" text="Dishes, prices and categories appear here once the POS menu is connected. Each dish's food cost is then worked out from its recipe." />}
    </div>
  )
}

/** Marketing: offers and messages to customers. Needs WhatsApp/SMS and customer data from the POS. */
export function MarketingPage() {
  const ideas: [LucideIcon, string, string][] = [
    [MessageCircle, 'WhatsApp campaigns', 'Send offers to customers who ordered in the last 30 days.'],
    [Gift, 'Birthday and anniversary offers', 'Automatic greetings with a coupon on the day.'],
    [Star, 'Ask for reviews', 'A thank-you message with a review link after each order.'],
    [Users, 'Win back regulars', "Reach customers who haven't ordered in a while."],
  ]
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Marketing Automation" after={<Badge tone="violet">New</Badge>} />
      <NeedsConnection what="Campaigns need customer phone numbers from the POS and a WhatsApp or SMS account. Nothing is sent until both are connected." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ideas.map(([Icon, t, d]) => (
          <div key={t} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fbf3e4] text-[#7a2228]"><Icon size={20} /></span>
            <span><span className="block font-semibold text-slate-900">{t}</span><span className="text-sm text-slate-500">{d}</span><span className="mt-2 block"><Badge tone="slate">not set up</Badge></span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Management: every outlet with its details and how it is reporting. */
export function ManagementPage() {
  const { role } = useApp()
  const entries = useEntries()
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Management · Outlets">
        {role === 'admin' && <Link to="/control/branches" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Edit outlets</Link>}
      </OpsHeader>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2.5 font-medium">Outlet</th><th className="font-medium">Manager</th><th className="font-medium">Phone</th><th className="font-medium">Hours</th><th className="font-medium">Last Imprest Book</th><th className="px-5 font-medium">POS</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {BRANCHES.map((b) => {
              const info = BRANCH_INFO[b.id]
              const last = entries.filter((e) => e.branch === b.id).map((e) => e.date).sort().pop()
              return (
                <tr key={b.id}>
                  <td className="px-5 py-3"><span className="font-medium text-slate-900">{b.name}</span><span className="block text-xs text-slate-500">{info?.address || b.city}</span></td>
                  <td>{b.manager || '—'}</td>
                  <td>{info?.phone ? <span className="inline-flex items-center gap-1"><Phone size={13} />{info.phone}</span> : '—'}</td>
                  <td>{info?.hours || '—'}</td>
                  <td>{last ? new Date(last + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="text-slate-400">none yet</span>}</td>
                  <td className="px-5"><Badge tone={b.status === 'online' ? 'green' : 'slate'}>{b.status === 'online' ? 'online' : 'not connected'}</Badge></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** CRM: customers, their orders and feedback. Comes from POS bills once connected. */
export function CrmPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="CRM · Customers">
        <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input disabled aria-label="Search customers" placeholder="Search by name or phone" className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" /></label>
      </OpsHeader>
      <NeedsConnection what="Customer names, phone numbers, visits and feedback come from POS bills and the ordering apps once connected." />
      <Empty icon={Megaphone} title="No customers yet" text="Once the POS is connected you'll see each customer's visits, total spend, favourite dishes and feedback here." />
    </div>
  )
}
