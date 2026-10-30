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

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}
