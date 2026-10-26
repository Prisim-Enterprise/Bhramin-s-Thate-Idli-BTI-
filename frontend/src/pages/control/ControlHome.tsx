import { Link } from 'react-router-dom'
import { CONTROL_NAV, usePortalPath } from '../../components/Layout'
import { PageHeader } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES, EMPLOYEES, EXPENSES, PURCHASE_ORDERS, RESTAURANTS, computePay, inr } from '../../data/mock'

export default function ControlHome() {
  const { ocrEnabled, deductions, can } = useApp()
  const path = usePortalPath()
  const payroll = EMPLOYEES.reduce((s, e) => s + computePay(e, deductions).net, 0)

  const summary: Record<string, string> = {
    '/control/restaurants': `${RESTAURANTS[0].name} · ${BRANCHES.length} locations`,
    '/control/sales': inr(BRANCHES.reduce((s, b) => s + b.sales, 0)) + ' this month',
    '/control/expenses': `${EXPENSES.filter((e) => e.status === 'pending').length} awaiting approval`,
    '/control/ocr': `${Object.values(ocrEnabled).filter(Boolean).length} of ${BRANCHES.length} branches active`,
    '/control/purchases': `${PURCHASE_ORDERS.filter((p) => p.status !== 'billed').length} open purchase orders`,
    '/control/deductions': `PF ${deductions.pfPct}% · ESI ${deductions.esiPct}% · PT ₹${deductions.ptAmount}`,
    '/control/salary': inr(payroll) + ' net payroll',
    '/control/users': `${EMPLOYEES.filter((e) => e.active).length} active logins`,
    '/control/roles': '6 roles configured',
    '/control/integrations': 'POS, aggregators, AI models, network',
  }

  return (
    <>
      <PageHeader title="Prisim Control Panel" subtitle="Configure every restaurant, branch, money flow and user from one place" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CONTROL_NAV.filter((n) => n.to !== '/control' && can(n.module)).map((n) => {
          const Icon = n.icon
          return (
            <Link key={n.to} to={path(n.to)} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Icon size={18} /></span>
                <p className="font-medium text-slate-900 group-hover:text-brand-700">{n.label}</p>
              </div>
              <p className="mt-3 text-sm text-slate-500">{summary[n.to]}</p>
            </Link>
          )
        })}
      </div>
    </>
  )
}
