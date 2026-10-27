import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IS_SHARE } from '../config'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Supabase is used for sign-in only. Without the keys (or in the shared demo page)
// it is null and the app falls back to the demo login.
export const supabase: SupabaseClient | null = !IS_SHARE && url && key ? createClient(url, key) : null
