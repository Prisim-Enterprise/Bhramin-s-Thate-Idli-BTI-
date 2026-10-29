import { useSyncExternalStore } from 'react'
import { API_ON, apiDelete, apiList, apiPut } from '../lib/api'

// A list of records shared across the app.
// With the API on, the cloud database is the source of truth and this browser keeps a copy.
// Changes save instantly on screen, then go to the cloud in the background; anything that
// fails to send is kept and tried again on the next sync.
// The first time a browser connects, records that exist only in this browser are moved to the cloud.

/* ---------- Sync status, for the little indicator in the top bar ---------- */

export type SyncStatus = { on: boolean; busy: number; waiting: number; error: string | null; moved: number; synced: boolean }
let status: SyncStatus = { on: API_ON, busy: 0, waiting: 0, error: null, moved: 0, synced: false }
const statusListeners = new Set<() => void>()
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p }
  statusListeners.forEach((l) => l())
}
export const useSyncStatus = () =>
  useSyncExternalStore((l) => { statusListeners.add(l); return () => { statusListeners.delete(l) } }, () => status)

// One request at a time, in order.
let chain: Promise<void> = Promise.resolve()
function queue(job: () => Promise<void>): Promise<void> {
  setStatus({ busy: status.busy + 1 })
  chain = chain.then(job).then(
    () => setStatus({ busy: status.busy - 1 }),
    (e: unknown) => setStatus({ busy: status.busy - 1, error: e instanceof Error ? e.message : String(e) }),
  )
  return chain
}

const registry: { load: () => Promise<void>; waiting: () => number }[] = []
const countWaiting = () => setStatus({ waiting: registry.reduce((s, r) => s + r.waiting(), 0) })

let syncing = false
/** Send anything waiting, then load the latest from the cloud. Call after sign-in. */
export async function syncAll() {
  if (!API_ON || syncing) return
  syncing = true
  setStatus({ error: null })
  try {
    for (const r of registry) await r.load()
    setStatus({ synced: true })
  } catch (e) {
    setStatus({ error: e instanceof Error ? e.message : String(e) })
  } finally {
    syncing = false
    countWaiting()
  }
}

/* ---------- The store ---------- */

type Options<T> = {
  kind: string // record type on the server
  idOf: (t: T) => string
  /** Runs before a record is sent, e.g. to move an attached file to R2. Return the record to store. */
  prepare?: (t: T) => Promise<T>
}

export function cloudStore<T>(key: string, opts: Options<T>) {
  const listeners = new Set<() => void>()
  const read = <X,>(k: string, fallback: X): X => { try { return JSON.parse(localStorage.getItem(k) ?? '') as X } catch { return fallback } }
  let data: T[] = read<T[]>(key, [])
  // Records changed or deleted here that the cloud hasn't got yet.
  const toPut = new Set<string>(read<string[]>(key + '.toPut', []))
  const toDel = new Set<string>(read<string[]>(key + '.toDel', []))
  const inFlight = new Set<string>()

  const saveLocal = (next: T[]) => { try { localStorage.setItem(key, JSON.stringify(next)); return true } catch { return false } }
  const saveQueue = () => {
    try {
      localStorage.setItem(key + '.toPut', JSON.stringify([...toPut]))
      localStorage.setItem(key + '.toDel', JSON.stringify([...toDel]))
    } catch { /* ignore */ }
    countWaiting()
  }
  const emit = () => listeners.forEach((l) => l())
  const find = (id: string) => data.find((x) => opts.idOf(x) === id)

  /** Send everything waiting. Resolves when done (or failed). */
  function push(): Promise<void> {
    if (!API_ON) return Promise.resolve()
    for (const id of [...toPut]) {
      if (inFlight.has(id)) continue
      inFlight.add(id)
      queue(async () => {
        try {
          let item = find(id)
          if (!item) { toPut.delete(id); return }
          if (opts.prepare) {
            const ready = await opts.prepare(item)
            if (ready !== item) {
              // Keep the prepared copy (e.g. file moved to R2) unless it was edited meanwhile.
              data = data.map((x) => (x === item ? ready : x))
              saveLocal(data)
              emit()
              item = ready
            }
          }
          const sent = JSON.stringify(item)
          await apiPut(opts.kind, id, item)
          const now = find(id)
          if (!now || JSON.stringify(now) === sent) toPut.delete(id)
        } finally {
          inFlight.delete(id)
          saveQueue()
        }
      })
    }
    for (const id of [...toDel]) {
      if (inFlight.has('del:' + id)) continue
      inFlight.add('del:' + id)
      queue(async () => {
        try {
          await apiDelete(opts.kind, id)
          toDel.delete(id)
        } finally {
          inFlight.delete('del:' + id)
          saveQueue()
        }
      })
    }
    return chain
  }

  async function load() {
    if (!API_ON) return
    await push()
    const remote = await apiList<T>(opts.kind)
    const remoteIds = new Set(remote.map(opts.idOf))
    const movedKey = key + '.inCloud'
    let moved = 0
    if (!localStorage.getItem(movedKey)) {
      // First connection from this browser: move records that only exist here.
      for (const x of data) if (!remoteIds.has(opts.idOf(x))) { toPut.add(opts.idOf(x)); moved++ }
      try { localStorage.setItem(movedKey, '1') } catch { /* ignore */ }
    }
    // Cloud copy, plus anything here still waiting to be sent.
    const waiting = data.filter((x) => toPut.has(opts.idOf(x)))
    const waitingIds = new Set(waiting.map(opts.idOf))
    data = [...waiting, ...remote.filter((x) => !waitingIds.has(opts.idOf(x)) && !toDel.has(opts.idOf(x)))]
    saveLocal(data)
    emit()
    saveQueue()
    if (moved) setStatus({ moved: status.moved + moved })
    await push()
  }

  registry.push({ load, waiting: () => toPut.size + toDel.size })

  return {
    get: () => data,
    /** Save the whole list. Returns false only when there's nowhere to keep it. */
    set(next: T[]): boolean {
      const stored = saveLocal(next)
      if (!stored && !API_ON) return false
      if (!API_ON) { data = next; emit(); return true }
      const before = new Map(data.map((x) => [opts.idOf(x), JSON.stringify(x)]))
      for (const x of next) {
        const id = opts.idOf(x)
        if (before.get(id) !== JSON.stringify(x)) { toPut.add(id); toDel.delete(id) }
        before.delete(id)
      }
      for (const id of before.keys()) { toDel.add(id); toPut.delete(id) }
      data = next
      emit()
      saveQueue()
      void push()
      return true
    },
    use: () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => data),
  }
}
