import { useEffect, useSyncExternalStore } from 'react'
import { API_ON, getSystem, setSystem, type SystemState } from '../lib/api'

// Are the dashboards turned off? Checked with the server every 20 seconds and whenever the tab
// comes back into view, so every open dashboard notices within seconds of an admin's switch.

let state: SystemState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export async function refreshSystem() {
  if (!API_ON) return
  try {
    state = await getSystem()
  } catch (e) {
    // The server refuses non-admins while the dashboards are off.
    if (e instanceof Error && /turned off/i.test(e.message)) state = { off: true, message: '', at: null, by: null }
    else return
  }
  emit()
}

export async function switchDashboards(off: boolean, message = '') {
  state = await setSystem(off, message)
  emit()
}

export function useSystem(enabled: boolean): SystemState | null {
  useEffect(() => {
    if (!enabled || !API_ON) return
    void refreshSystem()
    const t = setInterval(() => void refreshSystem(), 20_000)
    const onShow = () => { if (document.visibilityState === 'visible') void refreshSystem() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [enabled])
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)
}
