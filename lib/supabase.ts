import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseKey ?? '',
  { auth: { persistSession: true } }
)
