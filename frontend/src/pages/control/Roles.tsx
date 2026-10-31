import { useEffect, useState } from 'react'
import { CheckCircle2, RotateCcw, Save } from 'lucide-react'
import { Button, Card, PageHeader } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { fillPermissions } from '../../context/AuthContext'
import { ACTIONS, DEFAULT_PERMISSIONS, MODULES, ROLES, type Action, type ModuleId, type PermissionMatrix, type RoleId } from '../../data/mock'
import { fmtDateTime } from '../../data/entries'
import { API_ON, getPermissions, listLogins, putPermissions, type Login } from '../../lib/api'

// What each role can see and do. Saved on the server, so it applies to every login on every device,
// and the server itself refuses anything a role isn't allowed to do.
export default function Roles() {
  const { permissions, setPermissions, can, role: myRole } = useApp()
  const [role, setRole] = useState<RoleId>('accountant')
  const [draft, setDraft] = useState<PermissionMatrix>(permissions)
  const [saved, setSaved] = useState<{ at?: string | null; by?: string | null }>({})
  const [logins, setLogins] = useState<Login[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const edit = can('users', 'edit')
  const locked = role === 'admin' || !edit // admin keeps full access so nobody can lock themselves out
  const dirty = JSON.stringify(draft) !== JSON.stringify(permissions)

  useEffect(() => {
    if (!API_ON) return
    getPermissions<PermissionMatrix>().then((r) => {
      const m = fillPermissions(r.matrix)
      setPermissions(m)
      setDraft(m)
      setSaved({ at: r.at, by: r.by })
    }).catch(() => { /* offline: show what this browser knows */ })
    listLogins().then(setLogins).catch(() => setLogins([]))
  }, [setPermissions])

  const has = (m: ModuleId, a: Action) => draft[role][m].includes(a)
  const setCell = (m: ModuleId, next: Action[]) => setDraft({ ...draft, [role]: { ...draft[role], [m]: next } })
  const toggle = (m: ModuleId, a: Action) => {
    const cur = draft[role][m]
    let next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]
    if (a === 'view' && cur.includes('view')) next = [] // no view means nothing else either
    if (a !== 'view' && !cur.includes(a) && !next.includes('view')) next.push('view')
    setCell(m, next)
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      if (API_ON) {
        const r = await putPermissions(draft)
        const m = fillPermissions(r.matrix)
        setPermissions(m)
        setDraft(m)
        setSaved({ at: new Date().toISOString(), by: 'you' })
      } else setPermissions(draft)
      setMsg({ ok: true, text: 'Saved. Every login gets these rules the next time their page checks in (within a minute, or when they switch back to the tab).' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const people = (r: RoleId) => logins.filter((l) => l.role === r)

  return (
    <>
      <PageHeader
        title="Role Permissions"
        subtitle="Choose what each role can see and do. Saved for everyone; the server also blocks anything not allowed here."
        actions={edit && (
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setDraft(DEFAULT_PERMISSIONS)}>Defaults</Button>
            <Button icon={Save} disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving…' : dirty ? 'Save for everyone' : 'Saved'}</Button>
          </>
        )}
      />
      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}
      {!msg && saved.at && !dirty && (
        <p className="mb-4 flex items-center gap-1.5 text-sm text-slate-500"><CheckCircle2 size={15} className="text-emerald-600" /> Last saved {fmtDateTime(saved.at)}{saved.by ? ` by ${saved.by}` : ''}</p>
      )}
      {dirty && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You have changes that aren't saved yet. Press <b>Save for everyone</b> to apply them.</p>}

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <Card pad={false}>
          <ul className="divide-y divide-slate-100">
            {ROLES.map((r) => (
              <li key={r.id}>
                <button onClick={() => setRole(r.id)} className={`w-full px-4 py-3 text-left ${role === r.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <p className="text-sm font-medium">{r.name}{r.id === myRole && <span className="ml-1.5 text-xs text-brand-600">(you)</span>}</p>
                  <p className="text-xs text-slate-500">{r.desc}</p>
                  <p className="mt-1 text-xs text-slate-400">{people(r.id).length} login{people(r.id).length === 1 ? '' : 's'}</p>
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
                  const changed = JSON.stringify(draft[role][m.id]) !== JSON.stringify(permissions[role][m.id])
                  return (
                    <tr key={m.id} className={changed ? 'bg-amber-50/60' : ''}>
                      <td className="px-4 py-2.5 font-medium">{m.name}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="px-3 text-center">
                          <input type="checkbox" aria-label={`${m.name} ${a}`} className="h-4 w-4 accent-brand-600" disabled={locked} checked={has(m.id, a)} onChange={() => toggle(m.id, a)} />
                        </td>
                      ))}
                      <td className="px-3 text-center">
                        <input type="checkbox" aria-label={`${m.name} all`} className="h-4 w-4 accent-violet-600" disabled={locked} checked={full} onChange={() => setCell(m.id, full ? [] : [...ACTIONS])} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {people(role).length > 0 && (
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Logins with this role: {people(role).map((l) => l.name || l.email).join(', ')}</p>
          )}
          {role === 'auditor' && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Auditor is meant to be view only. Avoid ticking create, edit, approve or delete.</p>}
        </Card>
      </div>
    </>
  )
}
