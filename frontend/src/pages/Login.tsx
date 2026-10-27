import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { roleOf, useAuth } from '../context/AuthContext'
import { ROLES, type RoleId } from '../data/mock'
import { Field, inputCls } from '../components/ui'
import { ADMIN_NAV, canSee } from '../components/Layout'
import Logo, { RESTO_NAME } from '../components/Logo'

// Sign-in page. After sign-in the Centre Kitchen Dashboard opens directly.
// Uses Supabase when its keys are set; otherwise a demo role picker.
export default function Login() {
  const { setRole, permissions } = useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const [demoRole, setDemoRole] = useState<RoleId>('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // First Centre Kitchen page this role may view, or null if none.
  const firstPage = (role: RoleId) =>
    ADMIN_NAV.flatMap((g) => g.items).find((i) => canSee(i, (m) => !!permissions[role][m]?.includes('view')))?.to ?? null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await auth.signIn(email.trim(), password))
    setBusy(false)
    setPassword('')
  }

  const openDemo = () => {
    setRole(demoRole)
    navigate(firstPage(demoRole) ?? '/admin')
  }

  // Signed in: go straight to the dashboard.
  const target = auth.session ? firstPage(roleOf(auth.session)) : null
  if (auth.enabled && auth.session && target) return <Navigate to={target} replace />

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-ink-900 to-[#1e1338] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={112} />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">{RESTO_NAME}</h1>
          <p className="text-sm text-slate-500">Sign in to the Centre Kitchen Dashboard</p>
        </div>

        {auth.enabled && auth.loading ? (
          <p className="text-center text-sm text-slate-500">Checking sign-in…</p>
        ) : auth.enabled && auth.session ? (
          // Signed in, but this role can't open any dashboard page.
          <div className="space-y-4 text-center">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>{auth.email}</b> has no access to the dashboard yet. Ask an admin to give you a role.
            </p>
            <button onClick={() => auth.signOut()} className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
          </div>
        ) : auth.enabled ? (
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
          <div className="space-y-3">
            <Field label="Sign in as (demo)">
              <select className={inputCls} value={demoRole} onChange={(e) => setDemoRole(e.target.value as RoleId)}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <button onClick={openDemo} className="w-full rounded-xl bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700">Open dashboard</button>
            <p className="text-center text-xs text-slate-400">Demo only — no real authentication.</p>
          </div>
        )}
      </div>
    </div>
  )
}
