// Logins, managed from the Control Panel through Supabase's admin API.
// Needs the Worker secret SUPABASE_SECRET_KEY (npx wrangler secret put SUPABASE_SECRET_KEY).
// The key stays on Cloudflare; the browser never sees it.

import { ROLES, type Role } from './permissions'

type Cfg = { SUPABASE_URL: string; SUPABASE_SECRET_KEY?: string }

type SbUser = {
  id: string
  email?: string
  created_at?: string
  last_sign_in_at?: string | null
  banned_until?: string | null
  app_metadata?: { role?: string; branch?: string }
  user_metadata?: { name?: string }
}

export type Login = {
  id: string; email: string; name: string; role: Role; branch: string
  active: boolean; createdAt: string | null; lastSignIn: string | null
}

export class UserError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

async function sb(env: Cfg, path: string, init: RequestInit = {}) {
  if (!env.SUPABASE_SECRET_KEY) throw new UserError('Login management is not set up yet: add the SUPABASE_SECRET_KEY secret to the API.', 503)
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = String(body.msg ?? body.message ?? body.error_description ?? body.error ?? `Supabase error ${res.status}`)
    throw new UserError(/already been registered|already exists/i.test(msg) ? 'A login with this email already exists.' : msg, res.status >= 500 ? 502 : 400)
  }
  return body
}

const isBanned = (u: SbUser) => !!u.banned_until && new Date(u.banned_until).getTime() > Date.now()

function toLogin(u: SbUser): Login {
  const r = u.app_metadata?.role as Role
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.user_metadata?.name ?? '',
    role: ROLES.includes(r) ? r : 'auditor',
    branch: u.app_metadata?.branch || 'HO',
    active: !isBanned(u),
    createdAt: u.created_at ?? null,
    lastSignIn: u.last_sign_in_at ?? null,
  }
}

export async function listLogins(env: Cfg): Promise<Login[]> {
  const out: Login[] = []
  for (let page = 1; page <= 10; page++) {
    const body = (await sb(env, `/users?page=${page}&per_page=200`)) as { users?: SbUser[] }
    const users = body.users ?? []
    out.push(...users.map(toLogin))
    if (users.length < 200) break
  }
  return out.sort((a, b) => a.email.localeCompare(b.email))
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const cleanBranch = (b: unknown) => (typeof b === 'string' && /^[A-Z0-9]{1,6}$/.test(b) ? b : 'HO')
function cleanRole(r: unknown): Role {
  if (!ROLES.includes(r as Role)) throw new UserError('Pick a role.')
  return r as Role
}
function checkPassword(p: unknown): string {
  if (typeof p !== 'string' || p.length < 8) throw new UserError('The password must be at least 8 characters.')
  if (p.length > 72) throw new UserError('The password is too long (72 characters at most).')
  return p
}

export async function createLogin(env: Cfg, input: Record<string, unknown>): Promise<Login> {
  const email = String(input.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) throw new UserError('Type a valid email address.')
  const body = await sb(env, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: checkPassword(input.password),
      email_confirm: true,
      app_metadata: { role: cleanRole(input.role), branch: cleanBranch(input.branch) },
      user_metadata: { name: String(input.name ?? '').trim().slice(0, 80) },
    }),
  })
  return toLogin(body as SbUser)
}

/** Change a login's name, role, branch, active state or password. */
export async function updateLogin(env: Cfg, id: string, input: Record<string, unknown>): Promise<Login> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError('Unknown login.', 404)
  const current = (await sb(env, `/users/${id}`)) as SbUser
  const patch: Record<string, unknown> = {}
  if ('role' in input || 'branch' in input) {
    patch.app_metadata = {
      ...current.app_metadata,
      ...('role' in input ? { role: cleanRole(input.role) } : {}),
      ...('branch' in input ? { branch: cleanBranch(input.branch) } : {}),
    }
  }
  if ('name' in input) patch.user_metadata = { ...current.user_metadata, name: String(input.name ?? '').trim().slice(0, 80) }
  if ('active' in input) patch.ban_duration = input.active ? 'none' : '876000h' // about 100 years
  if ('password' in input) patch.password = checkPassword(input.password)
  if (!Object.keys(patch).length) return toLogin(current)
  const body = await sb(env, `/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
  return toLogin(body as SbUser)
}
