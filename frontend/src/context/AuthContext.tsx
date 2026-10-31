import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { syncAll } from '../data/cloudStore'
import { DEFAULT_PERMISSIONS, ROLES, type PermissionMatrix, type RoleId } from '../data/mock'
import { API_ON, getPermissions } from '../lib/api'
import { useApp } from './AppContext'

type Auth = {
  enabled: boolean // false = demo login (no Supabase keys)
  loading: boolean
  session: Session | null
  email: string | null
  signIn: (email: string, password: string) => Promise<string | null> // returns an error message, or null
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

// The role lives in the user's app_metadata, which only an admin can change in Supabase.
// Users without a role get Auditor (view only).
export function roleOf(session: Session | null): RoleId {
  const r = session?.user.app_metadata?.role
  return ROLES.some((x) => x.id === r) ? (r as RoleId) : 'auditor'
}

/** A saved matrix with any newer modules filled in from the defaults. */
export function fillPermissions(m: Partial<Record<RoleId, Partial<PermissionMatrix[RoleId]>>>): PermissionMatrix {
  return Object.fromEntries(ROLES.map((r) => [r.id, { ...DEFAULT_PERMISSIONS[r.id], ...(m[r.id] ?? {}) }])) as PermissionMatrix
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setRole, setPermissions } = useApp()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (supabase && session) setRole(roleOf(session))
  }, [session, setRole])

  // Load the shared data from the cloud once signed in, and again when the tab is opened.
  const signedIn = !!session
  useEffect(() => {
    if (!signedIn) return
    // Role permissions are set by an admin in the Control Panel and kept on the server, so every login gets the same rules.
    const loadPermissions = () => {
      if (!API_ON) return
      getPermissions<PermissionMatrix>()
        .then((r) => setPermissions(fillPermissions(r.matrix)))
        .catch(() => { /* keep the last known rules */ })
    }
    void syncAll()
    loadPermissions()
    const onFocus = () => { if (document.visibilityState === 'visible') { void syncAll(); loadPermissions() } }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [signedIn, setPermissions])

  const signIn = async (email: string, password: string) => {
    if (!supabase) return null
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ enabled: !!supabase, loading, session, email: session?.user.email ?? null, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
