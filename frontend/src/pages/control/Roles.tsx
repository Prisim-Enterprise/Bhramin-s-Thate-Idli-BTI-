import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Card, PageHeader } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { ACTIONS, DEFAULT_PERMISSIONS, EMPLOYEES, MODULES, ROLES, type Action, type ModuleId, type RoleId } from '../../data/mock'

export default function Roles() {
  const { permissions, setPermissions, can, role: myRole } = useApp()
  const [role, setRole] = useState<RoleId>('accountant')
  const edit = can('users', 'edit')
  // Admin keeps full access so nobody can lock themselves out.
  const locked = role === 'admin' || !edit

  const has = (m: ModuleId, a: Action) => permissions[role][m].includes(a)

  const toggle = (m: ModuleId, a: Action) => {
    const cur = permissions[role][m]
    let next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]
    if (a === 'view' && cur.includes('view')) next = [] // no view means nothing else either
    if (a !== 'view' && !cur.includes(a) && !next.includes('view')) next.push('view')
    setPermissions({ ...permissions, [role]: { ...permissions[role], [m]: next } })
  }

  const setRow = (m: ModuleId, all: boolean) =>
    setPermissions({ ...permissions, [role]: { ...permissions[role], [m]: all ? [...ACTIONS] : [] } })

  return (
    <>
      <PageHeader
        title="Role Permissions"
        subtitle="Choose what each role can see and do. Changes apply straight away. To check, sign out and sign in as that role."
        actions={edit && <Button variant="secondary" icon={RotateCcw} onClick={() => setPermissions(DEFAULT_PERMISSIONS)}>Reset all to defaults</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <Card pad={false}>
          <ul className="divide-y divide-slate-100">
            {ROLES.map((r) => (
              <li key={r.id}>
                <button onClick={() => setRole(r.id)} className={`w-full px-4 py-3 text-left ${role === r.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <p className="text-sm font-medium">{r.name}{r.id === myRole && <span className="ml-1.5 text-xs text-brand-600">(you)</span>}</p>
                  <p className="text-xs text-slate-500">{r.desc}</p>
                  <p className="mt-1 text-xs text-slate-400">{EMPLOYEES.filter((e) => e.role === r.id).length} users</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`${ROLES.find((r) => r.id === role)!.name} permissions`} pad={false}
          actions={role === 'admin' && <span className="text-xs text-slate-500">Admin always has full access</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Module</th>
                  {ACTIONS.map((a) => <th key={a} className="px-3 text-center font-medium">{a}</th>)}
                  <th className="px-3 text-center font-medium">All</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MODULES.map((m) => {
                  const full = ACTIONS.every((a) => has(m.id, a))
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium">{m.name}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="px-3 text-center">
                          <input type="checkbox" aria-label={`${m.name} ${a}`} className="h-4 w-4 accent-brand-600" disabled={locked} checked={has(m.id, a)} onChange={() => toggle(m.id, a)} />
                        </td>
                      ))}
                      <td className="px-3 text-center">
                        <input type="checkbox" aria-label={`${m.name} all`} className="h-4 w-4 accent-violet-600" disabled={locked} checked={full} onChange={() => setRow(m.id, !full)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {role === 'auditor' && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Auditor is meant to be view only — avoid ticking create, edit, approve or delete.</p>}
        </Card>
      </div>
    </>
  )
}
