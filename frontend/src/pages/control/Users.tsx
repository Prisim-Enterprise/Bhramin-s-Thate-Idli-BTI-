import { useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { Badge, Button, Card, Field, PageHeader, Table, Toggle, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES, EMPLOYEES, ROLES, branchName, type RoleId } from '../../data/mock'

export default function Users() {
  const { can } = useApp()
  const edit = can('users', 'edit')
  const [users, setUsers] = useState(EMPLOYEES)
  const [adding, setAdding] = useState(false)
  const [nu, setNu] = useState({ name: '', email: '', role: 'cashier' as RoleId, branch: 'B1' })
  const [policy, setPolicy] = useState({ minLen: 8, expiryDays: 90, sessionMins: 30, otp: true, lockAfter: 5, ipRestrict: false })
  const [notice, setNotice] = useState('')

  const patch = (id: string, p: Partial<(typeof EMPLOYEES)[number]>) => setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...p } : u)))

  const add = () => {
    if (!nu.name || !nu.email) return
    setUsers([...users, { id: 'E' + String(users.length + 1).padStart(2, '0'), ...nu, basic: 0, hra: 0, allow: 0, active: true, lastLogin: 'Never' }])
    setNotice(`Invite sent to ${nu.email}`)
    setNu({ name: '', email: '', role: 'cashier', branch: 'B1' })
    setAdding(false)
  }

  return (
    <>
      <PageHeader
        title="Users & Login"
        subtitle="Who can sign in, their role and branch, and login security"
        actions={can('users', 'create') && <Button icon={Plus} onClick={() => setAdding(true)}>Add user</Button>}
      />
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {adding && (
        <Card title="New user" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Full name"><input autoFocus className={inputCls} value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
            <Field label="Email (login)"><input type="email" className={inputCls} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputCls} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as RoleId })}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select className={inputCls} value={nu.branch} onChange={(e) => setNu({ ...nu, branch: e.target.value })}>
                <option value="HO">Head Office (all)</option>
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={add}>Create &amp; send invite</Button><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card pad={false}>
          <Table head={['User', 'Role', 'Branch', 'Last login', 'Status', 'Active', '']}>
            {users.map((u) => (
              <tr key={u.id}>
                <td><p className="font-medium">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td>
                  <select className={inputCls + ' !w-auto !py-1'} disabled={!edit} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value as RoleId })}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>{branchName(u.branch)}</td>
                <td className="text-slate-500">{u.lastLogin}</td>
                <td><Badge>{u.active ? 'active' : 'inactive'}</Badge></td>
                <td><Toggle checked={u.active} disabled={!edit} label={`Enable ${u.name}`} onChange={() => patch(u.id, { active: !u.active })} /></td>
                <td>{edit && <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setNotice(`Password reset link sent to ${u.email}`)}>Reset</Button>}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Login policy">
          <div className="space-y-3 text-sm">
            <Field label="Minimum password length"><input type="number" className={inputCls} disabled={!edit} value={policy.minLen} onChange={(e) => setPolicy({ ...policy, minLen: +e.target.value })} /></Field>
            <Field label="Password expires after (days)"><input type="number" className={inputCls} disabled={!edit} value={policy.expiryDays} onChange={(e) => setPolicy({ ...policy, expiryDays: +e.target.value })} /></Field>
            <Field label="Auto logout after idle (minutes)"><input type="number" className={inputCls} disabled={!edit} value={policy.sessionMins} onChange={(e) => setPolicy({ ...policy, sessionMins: +e.target.value })} /></Field>
            <Field label="Lock account after failed attempts"><input type="number" className={inputCls} disabled={!edit} value={policy.lockAfter} onChange={(e) => setPolicy({ ...policy, lockAfter: +e.target.value })} /></Field>
            <div className="flex items-center justify-between">OTP on login <Toggle checked={policy.otp} disabled={!edit} label="OTP on login" onChange={() => setPolicy({ ...policy, otp: !policy.otp })} /></div>
            <div className="flex items-center justify-between">Allow login only from branch network <Toggle checked={policy.ipRestrict} disabled={!edit} label="Restrict by network" onChange={() => setPolicy({ ...policy, ipRestrict: !policy.ipRestrict })} /></div>
          </div>
        </Card>
      </div>
    </>
  )
}
