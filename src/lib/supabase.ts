import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fljvpmoxqgmwpueydkds.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsanZwbW94cWdtd3B1ZXlka2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTIwNjksImV4cCI6MjA5MDA2ODA2OX0.D5wzfd3fzvn0iekF3QWkq9U-GwDasG5sJovvJP8Ltbc'

export function createSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
}

/** 从 Supabase session 提取用户信息 */
export function mapUser(user: any) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    phone: user.phone || '',
    displayName: user.user_metadata?.full_name || user.email || '',
    maskedPhone: user.phone
      ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      : '',
    identifier: user.email || user.phone || user.id,
  }
}
