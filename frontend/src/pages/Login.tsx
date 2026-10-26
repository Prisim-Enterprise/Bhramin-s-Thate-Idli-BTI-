import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ROLES, type RoleId } from '../data/mock'
import { Field, inputCls } from '../components/ui'
import { ADMIN_NAV, CONTROL_NAV, canSee } from '../components/Layout'
import Logo, { RESTO_NAME } from '../components/Logo'

// Demo sign-in: no real authentication yet. Picks a role and a portal.
export default function Login() {
  const { setRole, permissions } = useApp()
  const navigate = useNavigate()
  const [role, setSelRole] = useState<RoleId>('admin')
  const [email, setEmail] = useState('admin@prisim.in')
  const [password, setPassword] = useState('demo1234')

  // First page in the portal this role may view, or null if none.
  const firstPage = (portal: 'admin' | 'control') => {
    const items = portal === 'admin' ? ADMIN_NAV.flatMap((g) => g.items) : CONTROL_NAV
    return items.find((i) => canSee(i, (m) => !!permissions[role][m]?.includes('view')))?.to ?? null
  }
  const canOpen = (portal: 'admin' | 'control') => firstPage(portal) !== null

  const go = (portal: 'admin' | 'control') => {
    setRole(role)
    navigate(firstPage(portal)!)
  }

  const portals = [
    { id: 'admin' as const, title: 'Centre Kitchen Dashboard', desc: 'Accounts, OCR bills, food costing, indents, storage and purchase orders', icon: LayoutDashboard, tone: 'bg-brand-600 hover:bg-brand-700' },
    { id: 'control' as const, title: 'Prisim Control Panel', desc: 'Sales, expenses, OCR status, purchases, deductions, salary, login & roles', icon: Settings2, tone: 'bg-violet-600 hover:bg-violet-700' },
  ]

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-ink-900 to-[#1e1338] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={112} />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">{RESTO_NAME}</h1>
          <p className="text-sm text-slate-500">Sign in to Prisim RMIS</p>
        </div>

        <div className="space-y-3">
          <Field label="Email"><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Sign in as (demo)">
            <select className={inputCls} value={role} onChange={(e) => setSelRole(e.target.value as RoleId)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>

        <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Open</p>
        <div className="space-y-2">
          {portals.map((pt) => {
            const ok = canOpen(pt.id)
            return (
              <button key={pt.id} disabled={!ok} onClick={() => go(pt.id)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${pt.tone}`}>
                <pt.icon size={20} className="mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">{pt.title}</span>
                  <span className="block text-xs text-white/80">{ok ? pt.desc : 'Your role has no access here'}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Demo only — no real authentication yet.</p>
      </div>
    </div>
  )
}
