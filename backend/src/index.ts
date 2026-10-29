// BTI API: saves dashboard records in D1 and bill files in R2.
// Every request must carry the Supabase login token; the role comes from the user's app_metadata.

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  ALLOWED_ORIGINS: string
}

type Role = 'admin' | 'accountant' | 'kitchen' | 'cashier' | 'manager' | 'auditor'
type User = { email: string; role: Role }

// Who may save and delete each kind of record. Everyone signed in may read.
const KINDS: Record<string, { write: Role[]; remove: Role[] }> = {
  dayEntries: { write: ['admin', 'accountant', 'manager', 'cashier'], remove: ['admin', 'accountant'] },
  ledgers: { write: ['admin', 'accountant'], remove: ['admin', 'accountant'] },
  manualVouchers: { write: ['admin', 'accountant'], remove: ['admin', 'accountant'] },
  bills: { write: ['admin', 'accountant', 'kitchen'], remove: ['admin', 'accountant'] },
}
const FILE_WRITERS: Role[] = ['admin', 'accountant', 'kitchen']
const MAX_FILE = 20 * 1024 * 1024 // 20 MB per bill file
const ROLES: Role[] = ['admin', 'accountant', 'kitchen', 'cashier', 'manager', 'auditor']

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
  const u = (await res.json()) as { email?: string; app_metadata?: { role?: string } }
  const r = u.app_metadata?.role as Role
  const user: User = { email: u.email ?? 'unknown', role: ROLES.includes(r) ? r : 'auditor' }
  if (cache.size > 500) cache.clear()
  cache.set(token, { user, until: Date.now() + 60_000 })
  return user
}

/* ---------- Helpers ---------- */

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const ok = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin)
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name',
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

/* ---------- Routes ---------- */

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean) // ["api", ...]
  if (parts[0] !== 'api') return json({ error: 'Not found' }, 404)

  if (parts[1] === 'health') return json({ ok: true })

  const user = await userFrom(req, env)
  if (!user) return json({ error: 'Please sign in again.' }, 401)

  // GET /api/me
  if (parts[1] === 'me') return json(user)

  // /api/docs/:kind and /api/docs/:kind/:id
  if (parts[1] === 'docs') {
    const kind = parts[2]
    const rules = KINDS[kind]
    if (!rules) return json({ error: 'Unknown record type' }, 404)
    const id = parts[3] ? decodeURIComponent(parts[3]) : ''

    if (req.method === 'GET' && !id) {
      const { results } = await env.DB.prepare('SELECT data FROM docs WHERE kind = ? ORDER BY date DESC, updated_at DESC').bind(kind).all<{ data: string }>()
      return json(results.map((r) => JSON.parse(r.data)))
    }
    if (req.method === 'PUT' && id) {
      if (!rules.write.includes(user.role)) return json({ error: `Your role (${user.role}) can only view.` }, 403)
      const doc = (await req.json()) as Record<string, unknown>
      const body = JSON.stringify({ ...doc, id })
      if (body.length > 900_000) return json({ error: 'Record too large. Upload big files separately.' }, 413)
      const branch = typeof doc.branch === 'string' ? doc.branch : null
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
      if (!rules.remove.includes(user.role)) return json({ error: `Your role (${user.role}) can't delete.` }, 403)
      await env.DB.prepare('DELETE FROM docs WHERE kind = ? AND id = ?').bind(kind, id).run()
      await audit(env, user.email, 'delete', kind, id)
      return json({ ok: true })
    }
    return json({ error: 'Not allowed' }, 405)
  }

  // POST /api/files  (body = the file, X-File-Name header = its name)  ->  { key }
  // GET  /api/files/:key
  if (parts[1] === 'files') {
    if (req.method === 'POST') {
      if (!FILE_WRITERS.includes(user.role)) return json({ error: `Your role (${user.role}) can only view.` }, 403)
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
