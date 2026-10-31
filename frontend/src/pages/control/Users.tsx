import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, KeyRound, Plus, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { Badge, Button, Card, Field, PageHeader, Table, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { BRANCHES, ROLES, branchName, type RoleId } from '../../data/mock'
import { fmtDateTime } from '../../data/entries'
import { API_ON, createLogin, listLogins, updateLogin, type Login } from '../../lib/api'

const blank = { name: '', email: '', role: 'cashier' as RoleId, branch: 'HO', password: '' }

/** A random temporary password the admin can pass on. */
function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const a = crypto.getRandomValues(new Uint32Array(10))
  return 'Bti-' + [...a].map((n) => chars[n % chars.length]).join('')
}

// Real logins (Supabase), managed through the BTI API. Role and branch decide what each login can see and change.
export default function Users() {
  const { can } = useApp()
  const auth = useAuth()
  const edit = can('users', 'edit')
  const [users, setUsers] = useState<Login[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [nu, setNu] = useState(blank)
  const [busy, setBusy] = useState<string | null>(null)
  const [pwFor, setPwFor] = useState<Login | null>(null)
  const [pw, setPw] = useState('')

  const load = useCallback(() => {
    if (!API_ON) return
    setError(null)
    listLogins().then(setUsers).catch((e: Error) => { setUsers([]); setError(e.message) })
  }, [])
  useEffect(load, [load])

  const run = async (key: string, job: () => Promise<Login>, done: (l: Login) => string) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const l = await job()
      setUsers((us) => (us?.some((u) => u.id === l.id) ? us.map((u) => (u.id === l.id ? l : u)) : [...(us ?? []), l]))
      setNotice(done(l))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  const add = async () => {
    const ok = await run('add', () => createLogin(nu), (l) =>
      `Login created for ${l.email}. Give them this temporary password: ${nu.password} (they sign in at the BTI dashboard with their email).`)
    if (ok) { setNu(blank); setAdding(false) }
  }

  if (!API_ON) {
    return (
      <>
        <PageHeader title="Users & Login" subtitle="Who can sign in, their role and branch" />
        <Card><p className="text-sm text-slate-600">Logins are managed in the cloud. Sign in with the cloud turned on to add or change logins.</p></Card>
      </>
    )
  }

  const active = users?.filter((u) => u.active).length ?? 0
  return (
    <>
      <PageHeader
        title="Users & Login"
        subtitle="Create logins, set each person's role and branch, turn a login off, or set a new password"
        actions={<>
          <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
          {can('users', 'create') && <Button icon={Plus} onClick={() => { setAdding(true); setNu({ ...blank, password: tempPassword() }) }}>Add login</Button>}
        </>}
      />
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p>}
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}

      {adding && (
        <Card title="New login" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Full name"><input autoFocus className={inputCls} value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
            <Field label="Email (used to sign in)"><input type="email" className={inputCls} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
            <Field label="Role">
              <select aria-label="New login role" className={inputCls} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as RoleId })}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select aria-label="New login branch" className={inputCls} value={nu.branch} onChange={(e) => setNu({ ...nu, branch: e.target.value })}>
                <option value="HO">All branches (Head Office)</option>
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name} only</option>)}
              </select>
            </Field>
            <Field label="Temporary password"><input className={inputCls + ' font-mono'} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">{ROLES.find((r) => r.id === nu.role)?.desc}. {nu.branch === 'HO' ? 'Sees every branch.' : `Sees and changes ${branchName(nu.branch)} only.`}</p>
          <div className="mt-3 flex gap-2">
            <Button disabled={busy === 'add' || !nu.email || nu.password.length < 8} onClick={() => void add()}>{busy === 'add' ? 'Creating…' : 'Create login'}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {pwFor && (
        <Card title={`New password for ${pwFor.email}`} className="mb-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="New password (8+ characters)"><input className={inputCls + ' font-mono'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Button disabled={pw.length < 8 || busy === 'pw'} onClick={() => void run('pw', () => updateLogin(pwFor.id, { password: pw }), (l) => `Password changed for ${l.email}. New password: ${pw}`).then((ok) => { if (ok) setPwFor(null) })}>Set password</Button>
            <Button variant="ghost" onClick={() => setPwFor(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card pad={false} title={users ? `${users.length} logins · ${active} active` : 'Loading logins…'}>
        <Table head={['Person', 'Role', 'Branch', 'Last signed in', 'Status', '']}>
          {(users ?? []).map((u) => {
            const me = u.email === auth.email
            return (
              <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                <td><p className="font-medium text-slate-900">{u.name || u.email.split('@')[0]}{me && <span className="ml-1.5 text-xs text-brand-600">(you)</span>}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td>
                  <select aria-label={`Role of ${u.email}`} className={inputCls + ' !w-auto !py-1'} disabled={!edit || me || !!busy} value={u.role}
                    onChange={(e) => void run(u.id, () => updateLogin(u.id, { role: e.target.value }), (l) => `${l.email} is now ${ROLES.find((r) => r.id === l.role)?.name}.`)}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  <select aria-label={`Branch of ${u.email}`} className={inputCls + ' !w-auto !py-1'} disabled={!edit || !!busy} value={u.branch}
                    onChange={(e) => void run(u.id, () => updateLogin(u.id, { branch: e.target.value }), (l) => `${l.email} now works in ${l.branch === 'HO' ? 'all branches' : branchName(l.branch)}.`)}>
                    <option value="HO">All branches</option>
                    {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </td>
                <td className="text-slate-500">{u.lastSignIn ? fmtDateTime(u.lastSignIn) : 'Never'}</td>
                <td><Badge>{u.active ? 'active' : 'inactive'}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  <Link to={`/control/activity?email=${encodeURIComponent(u.email)}`} className="mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"><Activity size={14} /> Activity</Link>
                  {edit && <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => { setPwFor(u); setPw(tempPassword()) }}>Password</Button>}
                  {edit && !me && (
                    <Button size="sm" variant="ghost" icon={u.active ? UserX : UserCheck} disabled={!!busy}
                      onClick={() => { if (u.active && !confirm(`Turn off ${u.email}? They are signed out of the API at once and can't sign in until turned back on.`)) return
                        void run(u.id, () => updateLogin(u.id, { active: !u.active }), (l) => `${l.email} is now ${l.active ? 'on' : 'off'}.`) }}>
                      {u.active ? 'Turn off' : 'Turn on'}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
          {users && !users.length && !error && <tr><td colSpan={6} className="!py-6 text-center text-slate-500">No logins yet. Use “Add login”.</td></tr>}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        A login tied to one branch only sees and changes that branch's day entries, bills and vouchers. What each role can do is set in <Link className="text-[#7a2228] underline" to="/control/roles">Role Permissions</Link>.
        Passwords are never stored here; Supabase keeps them.
      </p>
    </>
  )
}
