import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Layout, { HUBS, type HubId } from './components/Layout'
import { NoAccess } from './components/ui'
import { useApp } from './context/AppContext'
import { MODULES, type ModuleId } from './data/mock'

import Login from './pages/Login'
import Overview from './pages/admin/Overview'
import Branches from './pages/admin/Branches'
import OcrBills from './pages/admin/OcrBills'
import FoodCostReport from './pages/admin/reports/FoodCostReport'
import SalesReport from './pages/admin/reports/SalesReport'
import ExpensesReport from './pages/admin/reports/ExpensesReport'
import PurchasesReport from './pages/admin/reports/PurchasesReport'
import SalaryReport from './pages/admin/reports/SalaryReport'
import DeductionsReport from './pages/admin/reports/DeductionsReport'
import ProfitLoss from './pages/admin/ProfitLoss'
import AccountingHub from './pages/admin/AccountingHub'
import KitchenHub from './pages/admin/KitchenHub'
import SetupHub from './pages/admin/SetupHub'
import BranchesIntegrations from './pages/admin/BranchesIntegrations'
import Indents from './pages/admin/Indents'
import Storage from './pages/admin/Storage'
import PurchaseOrders from './pages/admin/PurchaseOrders'

import ControlHome from './pages/control/ControlHome'
import Restaurants from './pages/control/Restaurants'
import Sales from './pages/control/Sales'
import Expenses from './pages/control/Expenses'
import OcrStatus from './pages/control/OcrStatus'
import Purchases from './pages/control/Purchases'
import Deductions from './pages/control/Deductions'
import Salary from './pages/control/Salary'
import UsersPage from './pages/control/Users'
import Roles from './pages/control/Roles'
import Integrations from './pages/control/Integrations'

function Guard({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { can } = useApp()
  if (!can(module)) return <NoAccess module={MODULES.find((m) => m.id === module)?.name ?? module} />
  return <>{children}</>
}

type R = { path: string; module: ModuleId; el: ReactNode }

// Centre Kitchen Dashboard portal — accounts and kitchen.
const adminRoutes: R[] = [
  { path: '', module: 'dashboard', el: <Overview /> },
  { path: 'branches', module: 'dashboard', el: <Branches /> },
  { path: 'accounting', module: 'dashboard', el: <AccountingHub /> },
  { path: 'kitchen', module: 'dashboard', el: <KitchenHub /> },
  { path: 'setup', module: 'dashboard', el: <SetupHub /> },
  { path: 'accounting/bills', module: 'ocr', el: <OcrBills /> },
  { path: 'accounting/costing', module: 'accounts', el: <FoodCostReport /> },
  { path: 'accounting/sales', module: 'sales', el: <SalesReport /> },
  { path: 'accounting/expenses', module: 'expenses', el: <ExpensesReport /> },
  { path: 'accounting/purchases', module: 'purchase', el: <PurchasesReport /> },
  { path: 'accounting/salary', module: 'salary', el: <SalaryReport /> },
  { path: 'accounting/deductions', module: 'deductions', el: <DeductionsReport /> },
  { path: 'accounting/pnl', module: 'accounts', el: <ProfitLoss /> },
  { path: 'setup/branches', module: 'settings', el: <BranchesIntegrations /> },
  { path: 'kitchen/indents', module: 'indent', el: <Indents /> },
  { path: 'kitchen/storage', module: 'indent', el: <Storage /> },
  { path: 'kitchen/purchase-orders', module: 'purchase', el: <PurchaseOrders /> },
]

// Prisim Control Panel portal — settings, money and access.
const controlRoutes: R[] = [
  { path: '', module: 'settings', el: <ControlHome /> },
  { path: 'restaurants', module: 'settings', el: <Restaurants /> },
  { path: 'sales', module: 'sales', el: <Sales /> },
  { path: 'expenses', module: 'expenses', el: <Expenses /> },
  { path: 'ocr', module: 'ocr', el: <OcrStatus /> },
  { path: 'purchases', module: 'purchase', el: <Purchases /> },
  { path: 'deductions', module: 'deductions', el: <Deductions /> },
  { path: 'salary', module: 'salary', el: <Salary /> },
  { path: 'users', module: 'users', el: <UsersPage /> },
  { path: 'roles', module: 'users', el: <Roles /> },
  { path: 'integrations', module: 'settings', el: <Integrations /> },
]

// The same Control Panel pages, also reachable inside the Centre Kitchen Dashboard.
const controlInAdmin: R[] = controlRoutes.filter((r) => r.path !== '')

// Which big-button group a page belongs to, so it can show a "← back" link.
function hubFor(path: string): HubId | null {
  const full = '/admin/' + path
  return (Object.keys(HUBS) as HubId[]).find((id) => HUBS[id].items.some((i) => i.to === full)) ?? null
}

function BackLink({ hub }: { hub: HubId }) {
  return (
    <Link to={HUBS[hub].to} className="mx-auto mb-3 flex max-w-7xl items-center gap-1.5 text-sm font-medium text-[#7a2228] hover:underline print:hidden">
      <ArrowLeft size={16} /> {HUBS[hub].label}
    </Link>
  )
}

function Portal({ portal, routes }: { portal: 'admin' | 'control'; routes: R[] }) {
  return (
    <Layout portal={portal}>
      <Routes>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={
            <Guard module={r.module}>
              {portal === 'admin' && hubFor(r.path) && <BackLink hub={hubFor(r.path)!} />}
              {r.el}
            </Guard>
          } />
        ))}
        <Route path="*" element={<p className="text-slate-500">Page not found.</p>} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/admin/*" element={<Portal portal="admin" routes={[...adminRoutes, ...controlInAdmin]} />} />
      <Route path="/control/*" element={<Portal portal="control" routes={controlRoutes} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
