import { createClient } from '@supabase/supabase-js'

// 与服务端 AI 代理（keji.asia/api）配套的 Supabase 项目。
// anon/publishable key 设计上可公开，真正的访问控制依赖该项目的 RLS 策略。
const SUPABASE_URL = 'https://wiubfypzgealjzrjcvxw.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_I6-7bF41BtGhYSO5P-i8hA_qEk6taWS'

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
