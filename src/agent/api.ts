import type { AgentConfig } from '../lib/types'

/** 判断是否使用 Anthropic API 格式 */
function isAnthropicFormat(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase()
  return lower.includes('anthropic') || lower.includes('claude')
}

/** OpenAI 兼容格式 */
async function callOpenAI(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  let base = config.baseUrl.replace(/\/+$/, '')
  if (!base.endsWith('/chat/completions')) {
    base = `${base}/chat/completions`
  }

  const resp = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
    }),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`API 请求失败 (${resp.status}): ${errBody.slice(0, 200)}`)
  }

  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.choices?.[0]?.message?.content || ''
}

/** Anthropic 格式 */
async function callAnthropic(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  let base = config.baseUrl.replace(/\/+$/, '')
  if (!base.endsWith('/messages')) {
    if (base.endsWith('/v1')) {
      base = `${base}/messages`
    } else {
      base = `${base}/v1/messages`
    }
  }

  const systemMsg = messages.find((m) => m.role === 'system')?.content || ''
  const nonSystem = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content }))

  const resp = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: systemMsg,
      messages: nonSystem,
      max_tokens: config.maxTokens ?? 2048,
    }),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`API 请求失败 (${resp.status}): ${errBody.slice(0, 200)}`)
  }

  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.content?.[0]?.text || ''
}

/** 统一 AI 调用入口，自动判断 OpenAI / Anthropic 格式 */
export async function callAI(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  if (isAnthropicFormat(config.baseUrl)) {
    return callAnthropic(config, messages)
  }
  return callOpenAI(config, messages)
}
