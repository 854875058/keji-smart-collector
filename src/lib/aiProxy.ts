import type { AIUsage } from './types'
import { createSupabaseClient } from './supabase'

/** 服务端 AI 代理根地址：真实 AI API Key 只保存在服务器 .env，不进入插件包 */
export const AI_PROXY_BASE = 'https://keji.asia/api'

/** 站点相关链接 */
export const SITE_URL = 'https://keji.asia/'
export const PRO_URL = 'https://keji.asia/pro.html'
export const RESET_PASSWORD_URL = 'https://keji.asia/reset-password.html'

/** 每日免费额度缓存 key 与默认上限（服务端返回为准） */
const USAGE_CACHE_KEY = 'keji.ai.usage'
export const DEFAULT_DAILY_LIMIT = 10

/** 本地日期键，形如 2026-07-26，用于跨天自动归零 */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localStore() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new Error('当前环境无法访问插件本地存储')
  }
  return chrome.storage.local
}

/** 归一化服务端返回的用量字段（兼容 used_count / used 两种命名） */
export function normalizeUsage(raw: any): AIUsage {
  return {
    date: raw?.date ?? raw?.date_key ?? localDateKey(),
    used: Number(raw?.used_count ?? raw?.used ?? 0),
    limit: Number(raw?.limit_count ?? raw?.limit ?? DEFAULT_DAILY_LIMIT),
  }
}

async function cacheUsage(usage: AIUsage, userId: string): Promise<void> {
  try {
    await localStore().set({ [USAGE_CACHE_KEY]: { ...usage, userId } })
  } catch {
    // 缓存失败不影响主流程
  }
}

/** 读取本地缓存的额度；跨天或换账号则视为失效 */
export async function getCachedUsage(userId?: string): Promise<AIUsage | null> {
  try {
    const data = await localStore().get(USAGE_CACHE_KEY)
    const cached = data?.[USAGE_CACHE_KEY] as (AIUsage & { userId?: string }) | undefined
    if (!cached) return null
    if (cached.date !== localDateKey()) return null
    if (userId && cached.userId && cached.userId !== userId) return null
    return normalizeUsage(cached)
  } catch {
    return null
  }
}

/** 额度是否已用尽 */
export function isQuotaExhausted(usage: AIUsage | null): boolean {
  if (!usage) return false
  return usage.used >= usage.limit
}

/** 要求已登录，返回带 access_token 的 session */
async function requireSession() {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session?.access_token || !data.session.user?.id) {
    throw new Error('请先登录后使用 AI 功能')
  }
  return data.session
}

/** 带 Supabase JWT 调用服务端代理 */
async function callProxy<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; userId: string }> {
  const session = await requireSession()
  const resp = await fetch(`${AI_PROXY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  })
  const body = await resp.json().catch(() => null)
  if (!resp.ok) {
    throw new Error(body?.error || `AI 服务请求失败 (${resp.status})`)
  }
  return { data: body as T, userId: session.user.id }
}

/** 拉取当日额度并刷新本地缓存 */
export async function fetchUsage(): Promise<AIUsage> {
  const { data, userId } = await callProxy<any>('/ai/usage')
  const usage = normalizeUsage(data?.usage ?? data)
  await cacheUsage(usage, userId)
  return usage
}

export interface ProxyChatOptions {
  messages: { role: string; content: string }[]
  temperature?: number
  maxTokens?: number
  model?: string
}

/**
 * 走服务端代理的对话补全。响应若带 usage 则顺带刷新额度缓存。
 * 返回值兼容 OpenAI 风格（choices）与服务端自定义的 result 包装。
 */
export async function proxyChat(options: ProxyChatOptions): Promise<any> {
  const { data, userId } = await callProxy<any>('/ai/completions', {
    method: 'POST',
    body: JSON.stringify(options),
  })
  if (data?.usage) {
    await cacheUsage(normalizeUsage(data.usage), userId)
  }
  return data?.result ?? data
}

/** 从各种可能的响应形状里取出文本 */
export function extractText(resp: any): string {
  return (
    resp?.choices?.[0]?.message?.content ||
    resp?.markdown ||
    resp?.content ||
    resp?.answer ||
    ''
  )
}
