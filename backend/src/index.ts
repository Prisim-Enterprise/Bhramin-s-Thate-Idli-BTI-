import { readBillWithSarvam } from './sarvam'
import { DEFAULT_MATRIX, FILE_RULE, KIND_RULES, ROLES, allowed, cleanMatrix, type Matrix, type Role } from './permissions'
import { UserError, createLogin, listLogins, updateLogin } from './users'

// BTI API: saves dashboard records in D1 and bill files in R2.
// Every request must carry the Supabase login token; the role and branch come from the user's app_metadata.

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  ALLOWED_ORIGINS: string
  SARVAM_API_KEY?: string // secret: npx wrangler secret put SARVAM_API_KEY
  SUPABASE_SECRET_KEY?: string // secret, for managing logins: npx wrangler secret put SUPABASE_SECRET_KEY
}

// branch: 'HO' = every branch; otherwise the one branch this login works in.
type User = { id: string; email: string; role: Role; branch: string }

// Handwritten bills read by Sarvam per day, whole company (India time). Above this, bills are typed in.
const HANDWRITTEN_PER_DAY = 10

/** Start of today in India (UTC+5:30), as an ISO time, for counting today's reads. */
function startOfIndianDay(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000).toISOString()
}

/** Pages read by Sarvam today (each read is logged with its page count). */
async function readsToday(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(CAST(id AS INTEGER)), 0) AS n FROM audit_log WHERE action = 'sarvam-read' AND at >= ?")
    .bind(startOfIndianDay()).first<{ n: number }>()
  return row?.n ?? 0
}
const MAX_FILE = 20 * 1024 * 1024 // 20 MB per bill file

/* ---------- Login check (cached briefly so each click isn't a round trip) ---------- */

const cache = new Map<string, { user: User; until: number }>()

async function userFrom(req: Request, env: Env): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.user
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  })
  if (!res.ok) return null
  const u = (await res.json()) as { id?: string; email?: string; banned_until?: string | null; app_metadata?: { role?: string; branch?: string } }
  // A login turned off in the Control Panel can't use the API, even with a token issued earlier.
  if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) return null
  const r = u.app_metadata?.role as Role
  const user: User = {
    id: u.id ?? '',
    email: u.email ?? 'unknown',
    role: ROLES.includes(r) ? r : 'auditor',
    branch: u.app_metadata?.branch || 'HO',
  }
  if (cache.size > 500) cache.clear()
  cache.set(token, { user, until: Date.now() + 60_000 })
  return user
}

/* ---------- Settings: dashboards on/off and the permission matrix ---------- */

type SystemState = { off: boolean; message: string; at: string | null; by: string | null }
const settingsCache = new Map<string, { row: { value: string; updated_at: string; updated_by: string } | null; until: number }>()

async function setting(env: Env, key: string) {
  const hit = settingsCache.get(key)
  if (hit && hit.until > Date.now()) return hit.row
  const row = await env.DB.prepare('SELECT value, updated_at, updated_by FROM settings WHERE key = ?').bind(key)
    .first<{ value: string; updated_at: string; updated_by: string }>()
  settingsCache.set(key, { row: row ?? null, until: Date.now() + 5_000 })
  return row ?? null
}

async function saveSetting(env: Env, key: string, value: unknown, by: string) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(key, JSON.stringify(value), new Date().toISOString(), by).run()
  settingsCache.delete(key)
}

async function systemState(env: Env): Promise<SystemState> {
  const row = await setting(env, 'dashboards')
  const v = row ? (JSON.parse(row.value) as { off?: boolean; message?: string }) : {}
  return { off: !!v.off, message: v.message ?? '', at: row?.updated_at ?? null, by: row?.updated_by ?? null }
}

async function matrix(env: Env): Promise<Matrix> {
  const row = await setting(env, 'permissions')
  return (row && cleanMatrix(JSON.parse(row.value))) || DEFAULT_MATRIX
}

/* ---------- Helpers ---------- */

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const ok = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin)
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Pages',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {}
}

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } })

async function audit(env: Env, email: string, action: string, kind: string, id: string) {
  await env.DB.prepare('INSERT INTO audit_log (at, email, action, kind, id) VALUES (?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), email, action, kind, id).run()
}

const limitedTo = (u: User) => (u.branch && u.branch !== 'HO' ? u.branch : null)

/* ---------- Routes ---------- */

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean) // ["api", ...]
  if (parts[0] !== 'api') return json({ error: 'Not found' }, 404)

  if (parts[1] === 'health') return json({ ok: true })

  const user = await userFrom(req, env)
  if (!user) return json({ error: 'Please sign in again.' }, 401)
  const isAdmin = user.role === 'admin'

  // GET /api/me
  if (parts[1] === 'me') return json(user)

  // GET /api/system -> are the dashboards turned off?   POST /api/system {off, message} (admins only)
  if (parts[1] === 'system') {
    if (req.method === 'GET') return json(await systemState(env))
    if (req.method === 'POST') {
      if (!isAdmin) return json({ error: 'Only admins can turn the dashboards on or off.' }, 403)
      const body = (await req.json()) as { off?: boolean; message?: string }
      await saveSetting(env, 'dashboards', { off: !!body.off, message: String(body.message ?? '').slice(0, 300) }, user.email)
      await audit(env, user.email, body.off ? 'turn-off' : 'turn-on', 'system', 'dashboards')
      return json(await systemState(env))
    }
    return json({ error: 'Not allowed' }, 405)
  }

  // While the dashboards are turned off, only admins can read or change anything.
  if (!isAdmin && (await systemState(env)).off) {
    return json({ error: 'The dashboards are turned off by an admin.', off: true }, 503)
  }

  // GET /api/permissions -> the role permission matrix (everyone needs it to draw their screens)
  // PUT /api/permissions (admins only)
  if (parts[1] === 'permissions') {
    if (req.method === 'GET') {
      const row = await setting(env, 'permissions')
      return json({ matrix: await matrix(env), at: row?.updated_at ?? null, by: row?.updated_by ?? null })
    }
    if (req.method === 'PUT') {
      if (!isAdmin) return json({ error: 'Only admins can change permissions.' }, 403)
      const m = cleanMatrix(await req.json())
      if (!m) return json({ error: 'Bad permissions' }, 400)
      await saveSetting(env, 'permissions', m, user.email)
      await audit(env, user.email, 'permissions', 'settings', 'permissions')
      return json({ matrix: m })
    }
    return json({ error: 'Not allowed' }, 405)
  }

  // Logins (admins only): GET /api/users, POST /api/users, PATCH /api/users/:id
  if (parts[1] === 'users') {
    if (!isAdmin) return json({ error: 'Only admins can manage logins.' }, 403)
    try {
      if (req.method === 'GET' && !parts[2]) return json(await listLogins(env))
      if (req.method === 'POST' && !parts[2]) {
        const login = await createLogin(env, (await req.json()) as Record<string, unknown>)
        await audit(env, user.email, 'login-create', 'login', `${login.email} (${login.role})`)
        return json(login)
      }
      if (req.method === 'PATCH' && parts[2]) {
        const id = decodeURIComponent(parts[2])
        const input = (await req.json()) as Record<string, unknown>
        // Nobody can lock themselves out of the Control Panel.
        if (id === user.id && ((('role' in input) && input.role !== 'admin') || input.active === false)) {
          return json({ error: "You can't remove your own admin access or turn off your own login." }, 400)
        }
        const login = await updateLogin(env, id, input)
        const what = Object.keys(input).map((k) => (k === 'password' ? 'password' : k === 'active' ? (input.active ? 'turned on' : 'turned off') : `${k}=${String(input[k])}`))
        await audit(env, user.email, 'login-change', 'login', `${login.email}: ${what.join(', ')}`)
        cache.clear() // role or access changes apply straight away
        return json(login)
      }
      return json({ error: 'Not allowed' }, 405)
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, e.status)
      throw e
    }
  }

  // GET /api/activity?days=30&email=&kind=  (admins only) -> what happened, who did it, and what's stored
  if (parts[1] === 'activity' && req.method === 'GET') {
    if (!isAdmin) return json({ error: 'Only admins can see activity.' }, 403)
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') ?? 30) || 30))
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const email = url.searchParams.get('email') ?? ''
    const kind = url.searchParams.get('kind') ?? ''
    const filters = ['at >= ?']
    const args: string[] = [since]
    if (email) { filters.push('email = ?'); args.push(email) }
    if (kind) { filters.push('kind = ?'); args.push(kind) }
    const where = filters.join(' AND ')
    const [events, perUser, perKind, daily, stored] = await Promise.all([
      env.DB.prepare(`SELECT at, email, action, kind, id FROM audit_log WHERE ${where} ORDER BY at DESC LIMIT 300`).bind(...args).all(),
      env.DB.prepare(`SELECT email, action, kind, COUNT(*) AS n, MAX(at) AS last FROM audit_log WHERE ${where} GROUP BY email, action, kind`).bind(...args).all(),
      env.DB.prepare(`SELECT kind, action, COUNT(*) AS n FROM audit_log WHERE ${where} GROUP BY kind, action`).bind(...args).all(),
      env.DB.prepare(`SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM audit_log WHERE ${where} GROUP BY day ORDER BY day`).bind(...args).all(),
      env.DB.prepare('SELECT kind, COUNT(*) AS n, MAX(updated_at) AS last, COUNT(DISTINCT updated_by) AS people FROM docs GROUP BY kind').all(),
    ])
    return json({ days, events: events.results, perUser: perUser.results, perKind: perKind.results, daily: daily.results, stored: stored.results })
  }

  // /api/docs/:kind and /api/docs/:kind/:id
  if (parts[1] === 'docs') {
    const kind = parts[2]
    const rules = KIND_RULES[kind]
    if (!rules) return json({ error: 'Unknown record type' }, 404)
    const id = parts[3] ? decodeURIComponent(parts[3]) : ''
    const only = limitedTo(user)

    if (req.method === 'GET' && !id) {
      // A login tied to one branch sees that branch's records (and ones with no branch, like ledgers).
      const { results } = only
        ? await env.DB.prepare('SELECT data FROM docs WHERE kind = ? AND (branch = ? OR branch IS NULL) ORDER BY date DESC, updated_at DESC').bind(kind, only).all<{ data: string }>()
        : await env.DB.prepare('SELECT data FROM docs WHERE kind = ? ORDER BY date DESC, updated_at DESC').bind(kind).all<{ data: string }>()
      return json(results.map((r) => JSON.parse(r.data)))
    }

    const m = await matrix(env)
    const existing = id ? await env.DB.prepare('SELECT branch FROM docs WHERE kind = ? AND id = ?').bind(kind, id).first<{ branch: string | null }>() : null
    const otherBranch = (b: string | null | undefined) => !!only && !!b && b !== only

    if (req.method === 'PUT' && id) {
      if (!allowed(m, user.role, rules.write)) return json({ error: `Your role (${user.role}) can only view.` }, 403)
      const doc = (await req.json()) as Record<string, unknown>
      const branch = typeof doc.branch === 'string' ? doc.branch : null
      if (otherBranch(branch) || otherBranch(existing?.branch)) return json({ error: 'Your login can only change records of your own branch.' }, 403)
      const body = JSON.stringify({ ...doc, id })
      if (body.length > 900_000) return json({ error: 'Record too large. Upload big files separately.' }, 413)
      const date = typeof doc.date === 'string' ? doc.date : null
      await env.DB.prepare(
        `INSERT INTO docs (kind, id, branch, date, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, id) DO UPDATE SET branch = excluded.branch, date = excluded.date, data = excluded.data,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      ).bind(kind, id, branch, date, body, new Date().toISOString(), user.email).run()
      await audit(env, user.email, 'save', kind, id)
      return json({ ok: true })
    }
    if (req.method === 'DELETE' && id) {
      if (!allowed(m, user.role, rules.remove)) return json({ error: `Your role (${user.role}) can't delete.` }, 403)
      if (otherBranch(existing?.branch)) return json({ error: 'Your login can only change records of your own branch.' }, 403)
      await env.DB.prepare('DELETE FROM docs WHERE kind = ? AND id = ?').bind(kind, id).run()
      await audit(env, user.email, 'delete', kind, id)
      return json({ ok: true })
    }
    return json({ error: 'Not allowed' }, 405)
  }

  // GET /api/read-bill/usage  ->  { used, limit }   (handwritten reads today)
  if (parts[1] === 'read-bill' && parts[2] === 'usage' && req.method === 'GET') {
    return json({ used: await readsToday(env), limit: HANDWRITTEN_PER_DAY })
  }

  // POST /api/read-bill  (body = bill image/PDF, X-File-Name, X-Pages = pages in it)  ->  bill read by Sarvam
  if (parts[1] === 'read-bill' && req.method === 'POST') {
    if (!allowed(await matrix(env), user.role, FILE_RULE)) return json({ error: `Your role (${user.role}) can only view.` }, 403)
    if (!env.SARVAM_API_KEY) return json({ error: 'Bill reading is not set up (no Sarvam key on the server).' }, 503)
    const pages = Math.max(1, Number(req.headers.get('X-Pages') ?? 1) || 1)
    const used = await readsToday(env)
    if (used + pages > HANDWRITTEN_PER_DAY) {
      return json({ error: `Today's limit of ${HANDWRITTEN_PER_DAY} handwritten bills is used (${used} read). Enter this bill manually.`, used, limit: HANDWRITTEN_PER_DAY }, 429)
    }
    const body = await req.blob()
    if (body.size > 20 * 1024 * 1024) return json({ error: 'File is over 20 MB.' }, 413)
    const name = decodeURIComponent(req.headers.get('X-File-Name') ?? 'bill.jpg').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
    try {
      const { bill, pages: read } = await readBillWithSarvam(env.SARVAM_API_KEY, new Blob([body], { type: req.headers.get('Content-Type') ?? 'image/jpeg' }), name)
      // Logged with the page count, which is what the daily limit counts.
      await audit(env, user.email, 'sarvam-read', 'bill', String(read))
      return json({ bill, used: used + read, limit: HANDWRITTEN_PER_DAY })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Reading failed' }, 502)
    }
  }

  // POST /api/files  (body = the file, X-File-Name header = its name)  ->  { key }
  // GET  /api/files/:key
  if (parts[1] === 'files') {
    if (req.method === 'POST') {
      if (!allowed(await matrix(env), user.role, FILE_RULE)) return json({ error: `Your role (${user.role}) can only view.` }, 403)
      const size = Number(req.headers.get('Content-Length') ?? 0)
      if (size > MAX_FILE) return json({ error: 'File is over 20 MB.' }, 413)
      const name = decodeURIComponent(req.headers.get('X-File-Name') ?? 'bill').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      const type = req.headers.get('Content-Type') ?? 'application/octet-stream'
      const key = `bills/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${name}`
      await env.FILES.put(key, req.body, { httpMetadata: { contentType: type }, customMetadata: { uploadedBy: user.email, name } })
      await audit(env, user.email, 'upload', 'file', key)
      return json({ key })
    }
    if (req.method === 'GET' && parts.length > 2) {
      const key = parts.slice(2).map(decodeURIComponent).join('/')
      const obj = await env.FILES.get(key)
      if (!obj) return json({ error: 'File not found' }, 404)
      const headers = new Headers()
      obj.writeHttpMetadata(headers)
      headers.set('Cache-Control', 'private, max-age=3600')
      return new Response(obj.body, { headers })
    }
    return json({ error: 'Not allowed' }, 405)
  }

  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const c = cors(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
    try {
      const res = await handle(req, env)
      for (const [k, v] of Object.entries(c)) res.headers.set(k, v)
      return res
    } catch (e) {
      return json({ error: 'Server error', detail: String(e) }, 500, c)
    }
  },
}
