import { money, per100 } from '../../components/report'
import { UploadBookButton, UploadedBooks } from '../../components/BookUpload'
import { useApp } from '../../context/AppContext'
import { BILLS, EMPLOYEES, RECIPES, VENDOR_SPEND, computePay } from '../../data/mock'
import { OUTLETS, buildPnl } from '../../data/pnl'
import Hub, { type HubStat } from './Hub'

// Accounting home: one big button per report, plus Cashbook upload.
export default function AccountingHub() {
  const { can, deductions } = useApp()
  const p = buildPnl(OUTLETS.map((b) => b.id), 'this')
  const pay = EMPLOYEES.filter((e) => e.basic > 0).map((e) => computePay(e, deductions))
  const owed = VENDOR_SPEND.reduce((s, v) => s + v.bought - v.paid, 0)
  const foodSold = RECIPES.reduce((s, r) => s + r.price * r.sold, 0)
  const foodCost = RECIPES.reduce((s, r) => s + r.cost * r.sold, 0)
  const toCheck = BILLS.filter((b) => b.status === 'extracted' || b.status === 'failed').length

  const stats: Record<string, HubStat> = {
    '/admin/accounting/pnl': !p.sales && !p.opex ? { value: '—', caption: 'no figures yet' } : { value: money(p.net), caption: p.net >= 0 ? 'profit this month' : 'loss this month', tone: p.net >= 0 ? 'good' : 'bad' },
    '/admin/accounting/sales': { value: money(p.sales), caption: 'sold this month' },
    '/admin/accounting/expenses': { value: money(p.opex + p.depreciation), caption: 'running costs' },
    '/admin/accounting/purchases': { value: money(owed), caption: 'still to pay vendors', tone: owed ? 'warn' : 'good' },
    '/admin/accounting/costing': { value: per100(foodCost, foodSold), caption: 'ingredients per ₹100 sold' },
    '/admin/accounting/salary': { value: money(pay.reduce((s, x) => s + x.net, 0)), caption: 'staff take-home' },
    '/admin/accounting/deductions': { value: money(pay.reduce((s, x) => s + x.deductions, 0), false), caption: 'cut from salaries' },
    '/admin/accounting/bills': { value: String(toCheck), caption: toCheck === 1 ? 'bill to check' : 'bills to check', tone: toCheck ? 'warn' : 'good' },
  }

  return (
    <Hub id="accounting" stats={stats} action={<UploadBookButton kind="cashbook" disabled={!can('accounts', 'create')} />}>
      <UploadedBooks kind="cashbook" canDelete={can('accounts', 'delete')} />
    </Hub>
  )
}
