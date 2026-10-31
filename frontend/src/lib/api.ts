import { supabase } from './supabase'

// Talks to the BTI API on Cloudflare (D1 database + R2 files).
// Off when VITE_API_URL is not set: the app then keeps data in this browser only.
// The address is public (every request still needs a login). VITE_API_URL can point somewhere else.
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'https://bti-api.bti-api.workers.dev').replace(/\/+$/, '')
export const API_ON = !!BASE && !!supabase

async function token(): Promise<string> {
  const { data } = await supabase!.auth.getSession()
  const t = data.session?.access_token
  if (!t) throw new Error('Not signed in')
  return t
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } })
  if (!res.ok) {
    let msg = ''
    try { msg = ((await res.json()) as { error?: string }).error ?? '' } catch { /* not JSON */ }
    throw new Error(msg || `Server error ${res.status}`)
  }
  return res
}

const docPath = (kind: string, id?: string) => `/api/docs/${kind}` + (id ? '/' + encodeURIComponent(id) : '')

export async function apiList<T>(kind: string): Promise<T[]> {
  return (await call(docPath(kind))).json() as Promise<T[]>
}
export async function apiPut(kind: string, id: string, doc: unknown) {
  await call(docPath(kind, id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
}
export async function apiDelete(kind: string, id: string) {
  await call(docPath(kind, id), { method: 'DELETE' })
}

/** Store a file in R2. Returns its key. */
export async function uploadFile(blob: Blob, name: string): Promise<string> {
  const res = await call('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) },
    body: blob,
  })
  return ((await res.json()) as { key: string }).key
}

/** Fetch a stored file (needs the login, so it can't be a plain link). */
export async function fileBlob(key: string): Promise<Blob> {
  return (await call('/api/files/' + key.split('/').map(encodeURIComponent).join('/'))).blob()
}

/** What Sarvam read from a bill (fields can be missing). */
export type SarvamBill = {
  vendor?: string | null; bill_no?: string | null; date?: string | null
  items?: { item?: string | null; qty?: number | null; unit?: string | null; rate?: number | null; amount?: number | null }[] | null
  cgst?: number | null; sgst?: number | null; total?: number | null
}
export type Usage = { used: number; limit: number }

/** Read a handwritten/scanned bill with Sarvam on the server. Counts toward the daily limit. */
export async function readBillOnline(file: Blob, name: string, pages = 1): Promise<{ bill: SarvamBill } & Usage> {
  const res = await call('/api/read-bill', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/jpeg', 'X-File-Name': encodeURIComponent(name), 'X-Pages': String(pages) },
    body: file,
  })
  return res.json() as Promise<{ bill: SarvamBill } & Usage>
}

/** Handwritten bills read today (whole company) and the daily limit. */
export async function readUsage(): Promise<Usage> {
  return (await call('/api/read-bill/usage')).json() as Promise<Usage>
}

/** Dashboards on/off, set by an admin in the Control Panel. */
export type SystemState = { off: boolean; message: string; at: string | null; by: string | null }

export async function getSystem(): Promise<SystemState> {
  return (await call('/api/system')).json() as Promise<SystemState>
}

export async function setSystem(off: boolean, message = ''): Promise<SystemState> {
  const res = await call('/api/system', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off, message }) })
  return res.json() as Promise<SystemState>
}

/* ---------- Control Panel: logins, permissions, activity (admins) ---------- */

export type Login = {
  id: string; email: string; name: string; role: string; branch: string
  active: boolean; createdAt: string | null; lastSignIn: string | null
}
const sendJson = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function listLogins(): Promise<Login[]> {
  return (await call('/api/users')).json() as Promise<Login[]>
}
export async function createLogin(input: { email: string; name: string; role: string; branch: string; password: string }): Promise<Login> {
  return (await call('/api/users', sendJson('POST', input))).json() as Promise<Login>
}
export async function updateLogin(id: string, patch: Partial<{ name: string; role: string; branch: string; active: boolean; password: string }>): Promise<Login> {
  return (await call('/api/users/' + encodeURIComponent(id), sendJson('PATCH', patch))).json() as Promise<Login>
}

export type SavedPermissions<M> = { matrix: M; at?: string | null; by?: string | null }
export async function getPermissions<M>(): Promise<SavedPermissions<M>> {
  return (await call('/api/permissions')).json() as Promise<SavedPermissions<M>>
}
export async function putPermissions<M>(matrix: M): Promise<SavedPermissions<M>> {
  return (await call('/api/permissions', sendJson('PUT', matrix))).json() as Promise<SavedPermissions<M>>
}

export type ActivityEvent = { at: string; email: string; action: string; kind: string; id: string }
export type Activity = {
  days: number
  events: ActivityEvent[]
  perUser: { email: string; action: string; kind: string; n: number; last: string }[]
  perKind: { kind: string; action: string; n: number }[]
  daily: { day: string; n: number }[]
  stored: { kind: string; n: number; last: string; people: number }[]
}
export async function getActivity(days = 30, email = ''): Promise<Activity> {
  const q = new URLSearchParams({ days: String(days), ...(email ? { email } : {}) })
  return (await call('/api/activity?' + q.toString())).json() as Promise<Activity>
}

/** Is the API reachable at all (no login needed)? */
export async function apiHealth(): Promise<boolean> {
  try { return (await fetch(BASE + '/api/health')).ok } catch { return false }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

/** Where each ledger goes in the MIS Profit & Loss (ledgerKey -> heading). */
export async function getMisLayout(): Promise<{ map: Record<string, string>; at: string | null; by: string | null }> {
  return (await call('/api/settings/mis')).json() as Promise<{ map: Record<string, string>; at: string | null; by: string | null }>
}
export async function putMisLayout(map: Record<string, string>): Promise<{ map: Record<string, string> }> {
  return (await call('/api/settings/mis', sendJson('PUT', map))).json() as Promise<{ map: Record<string, string> }>
}

/** Centre Kitchen reorder levels (itemKey -> level). */
export type CkItemSetting = { reorder: number; unit: string }
export async function getCkSettings(): Promise<{ items: Record<string, CkItemSetting>; at: string | null; by: string | null }> {
  return (await call('/api/settings/ck')).json() as Promise<{ items: Record<string, CkItemSetting>; at: string | null; by: string | null }>
}
export async function putCkSettings(items: Record<string, CkItemSetting>): Promise<{ items: Record<string, CkItemSetting> }> {
  return (await call('/api/settings/ck', sendJson('PUT', items))).json() as Promise<{ items: Record<string, CkItemSetting> }>
}
