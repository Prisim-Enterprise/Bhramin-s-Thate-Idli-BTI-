import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ROLES, type RoleId } from '../data/mock'
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
function roleOf(session: Session | null): RoleId {
  const r = session?.user.app_metadata?.role
  return ROLES.some((x) => x.id === r) ? (r as RoleId) : 'auditor'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setRole } = useApp()
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
