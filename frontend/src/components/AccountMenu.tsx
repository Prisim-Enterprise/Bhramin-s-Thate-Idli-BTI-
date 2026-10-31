import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, CalendarClock, Check, LogOut, Mail, ShieldCheck, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { MODULES, ROLES } from '../data/mock'
import { fmtDateTime } from '../data/entries'

// The avatar in the top bar. Click it to see who is signed in, their role and what it allows.

const ACTION_WORD: Record<string, string> = { view: 'view', create: 'add', edit: 'edit', approve: 'approve', delete: 'delete' }

export default function AccountMenu() {
  const { role, permissions } = useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const inControl = useLocation().pathname.startsWith('/control')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const user = auth.session?.user
  const email = auth.email ?? (auth.enabled ? '' : 'Demo user')
  const name = (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || email.split('@')[0]
  const initials = (name || 'U').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'U'
  const roleInfo = ROLES.find((r) => r.id === role)
  // Control Panel settings aren't listed here.
  const access = MODULES
    .filter((m) => m.id !== 'settings')
    .map((m) => ({ name: m.name, actions: permissions[role]?.[m.id] ?? [] }))
    .filter((m) => m.actions.length)
  const viewOnly = access.every((m) => m.actions.every((a) => a === 'view'))

  // Close on outside click or Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Account: ${email}`}
        className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-0.5 hover:bg-slate-100 sm:pr-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[180px] truncate text-xs font-semibold text-slate-800">{name}</span>
          <span className="block text-[11px] text-slate-500">{roleInfo?.name}</span>
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label="Signed-in account" className="absolute right-0 z-40 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white">{initials}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-slate-500"><Mail size={12} /> {email}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ShieldCheck size={15} className="text-[#7a2228]" /> {roleInfo?.name}</p>
            <p className="text-xs text-slate-500">{roleInfo?.desc}</p>
            {viewOnly && <p className="mt-1 text-xs text-amber-700">View only. Ask an admin if you need to add or change records.</p>}
          </div>

          <dl className="mt-3 space-y-1 text-xs text-slate-600">
            {user?.last_sign_in_at && (
              <div className="flex items-center gap-1.5"><CalendarClock size={13} className="text-slate-400" /><dt>Signed in</dt><dd className="ml-auto font-medium text-slate-800">{fmtDateTime(user.last_sign_in_at)}</dd></div>
            )}
            {user?.created_at && (
              <div className="flex items-center gap-1.5"><CalendarClock size={13} className="text-slate-400" /><dt>Account since</dt><dd className="ml-auto font-medium text-slate-800">{fmtDateTime(user.created_at)}</dd></div>
            )}
            {!auth.enabled && <p className="text-amber-700">Demo sign-in: nothing is saved to the cloud.</p>}
          </dl>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">What you can do</p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs">
            {access.map((m) => (
              <li key={m.name} className="flex items-start gap-1.5">
                <Check size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                <span><b className="font-medium text-slate-800">{m.name}</b> <span className="text-slate-500">· {m.actions.map((a) => ACTION_WORD[a] ?? a).join(', ')}</span></span>
              </li>
            ))}
            {!access.length && <li className="text-slate-500">No access yet. Ask an admin to give you a role.</li>}
          </ul>

          {role === 'admin' && (
            <Link to={inControl ? '/admin' : '/control'} onClick={() => setOpen(false)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#7a2228] px-3 py-2 text-sm font-medium text-white hover:bg-[#651b20]">
              <ArrowLeftRight size={15} /> {inControl ? 'Centre Kitchen Dashboard' : 'Prisim Control Panel'}
            </Link>
          )}
          <button onClick={async () => { setOpen(false); await auth.signOut(); navigate('/') }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
