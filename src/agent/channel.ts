import type { AgentConfig } from '../lib/types'
import { storage } from '../lib/storage'
import { createSupabaseClient } from '../lib/supabase'
import { callAI } from './api'
import { proxyChat, extractText, fetchUsage } from '../lib/aiProxy'

/**
 * AI 调用通道。
 * - byok：用户自备 API Key，直连模型服务商，不限额度、不需要登录
 * - proxy：走 keji.asia 服务端代理，需要 Supabase 登录，受每日免费额度限制
 */
export type AIChannel = 'byok' | 'proxy'

/** 自备 Key 配置是否可用（baseUrl 与 apiKey 都填了才算） */
export function isByokReady(config: AgentConfig | null | undefined): boolean {
  return !!(config && config.baseUrl?.trim() && config.apiKey?.trim())
}

/** 未配置自备 Key 且未登录时的统一引导文案 */
export const NO_CHANNEL_MESSAGE =
  'AI 功能需要先配置调用方式：可以在「智能体」页填写自己的 API Key（个人使用推荐，不限额度），或登录后使用每日免费额度。'

export interface ResolvedChannel {
  channel: AIChannel
  config?: AgentConfig
}

/** 当前是否已登录（仅探测，不抛错） */
async function hasSession(): Promise<boolean> {
  try {
    const supabase = createSupabaseClient()
    const { data } = await supabase.auth.getSession()
    return !!data.session?.access_token
  } catch {
    return false
  }
}

/**
 * 决定这次 AI 请求走哪条通道。
 * 自备 Key 优先：个人使用时额度自己掌握，也不依赖登录态。
 * 两者都不可用时抛出带引导的错误。
 */
export async function resolveChannel(): Promise<ResolvedChannel> {
  const config = await storage.getAgentConfig().catch(() => null)
  if (isByokReady(config)) {
    return { channel: 'byok', config: config as AgentConfig }
  }
  if (await hasSession()) {
    return { channel: 'proxy' }
  }
  throw new Error(NO_CHANNEL_MESSAGE)
}

export interface ChatOptions {
  messages: { role: string; content: string }[]
  temperature?: number
  maxTokens?: number
}

export interface ChatResult {
  text: string
  model?: string
  /** 本次是否消耗了服务端免费额度，UI 据此决定要不要刷新额度显示 */
  usedQuota: boolean
}

/**
 * 统一对话入口：按通道分派，返回归一化结果。
 * 调用方无需关心用的是自备 Key 还是服务端代理。
 */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const { channel, config } = await resolveChannel()

  if (channel === 'byok' && config) {
    const text = await callAI(
      {
        ...config,
        temperature: options.temperature ?? config.temperature,
        maxTokens: options.maxTokens ?? config.maxTokens,
      },
      options.messages
    )
    return { text, model: config.model, usedQuota: false }
  }

  const resp = await proxyChat({
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  })
  return { text: extractText(resp), model: resp?.model, usedQuota: true }
}

/** 仅在确实消耗了免费额度时刷新缓存，自备 Key 路径不打扰服务端 */
export async function refreshQuotaIfUsed(usedQuota: boolean): Promise<void> {
  if (!usedQuota) return
  await fetchUsage().catch(() => undefined)
}
