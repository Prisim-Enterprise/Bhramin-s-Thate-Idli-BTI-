import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { ROLES, type RoleId } from '../data/mock'
import { Field, inputCls } from '../components/ui'
import { ADMIN_NAV, CONTROL_NAV, canSee } from '../components/Layout'
import Logo, { RESTO_NAME } from '../components/Logo'

type PortalId = 'admin' | 'control'

const PORTALS = [
  { id: 'admin' as const, title: 'Centre Kitchen Dashboard', desc: 'Accounts, OCR bills, food costing, indents, storage and purchase orders', icon: LayoutDashboard, tone: 'bg-brand-600 hover:bg-brand-700' },
  { id: 'control' as const, title: 'Prisim Control Panel', desc: 'Sales, expenses, OCR status, purchases, deductions, salary, login & roles', icon: Settings2, tone: 'bg-violet-600 hover:bg-violet-700' },
]

// Sign-in page. Uses Supabase when its keys are set; otherwise a demo role picker.
export default function Login() {
  const { role: currentRole, setRole, permissions } = useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const [demoRole, setDemoRole] = useState<RoleId>('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const role = auth.enabled ? currentRole : demoRole
  const signedIn = !auth.enabled || !!auth.session

  // First page in the portal this role may view, or null if none.
  const firstPage = (portal: PortalId) => {
    const items = portal === 'admin' ? ADMIN_NAV.flatMap((g) => g.items) : CONTROL_NAV
    return items.find((i) => canSee(i, (m) => !!permissions[role][m]?.includes('view')))?.to ?? null
  }

  const go = (portal: PortalId) => {
    if (!auth.enabled) setRole(demoRole)
    navigate(firstPage(portal)!)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await auth.signIn(email.trim(), password))
    setBusy(false)
    setPassword('')
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-ink-900 to-[#1e1338] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={112} />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">{RESTO_NAME}</h1>
          <p className="text-sm text-slate-500">Sign in to Prisim RMIS</p>
        </div>

        {auth.enabled && auth.loading ? (
          <p className="text-center text-sm text-slate-500">Checking sign-in…</p>
        ) : !signedIn ? (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email"><input type="email" required autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input type="password" required autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center text-xs text-slate-400">No account? Ask your admin to add you.</p>
          </form>
        ) : (
          <>
            {auth.enabled ? (
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <p className="text-slate-500">Signed in as</p>
                <p className="font-medium text-slate-900">{auth.email}</p>
                <p className="text-slate-600">{ROLES.find((r) => r.id === role)?.name}</p>
              </div>
            ) : (
              <Field label="Sign in as (demo)">
                <select className={inputCls} value={demoRole} onChange={(e) => setDemoRole(e.target.value as RoleId)}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            )}

            <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Open</p>
            <div className="space-y-2">
              {PORTALS.map((pt) => {
                const ok = firstPage(pt.id) !== null
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

            {auth.enabled ? (
              <button onClick={() => auth.signOut()} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-800">Sign out</button>
            ) : (
              <p className="mt-6 text-center text-xs text-slate-400">Demo only — no real authentication.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
