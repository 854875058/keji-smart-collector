import type { AIProvider, ChatMessage, ChatOptions } from './types'

export class ClaudeProvider implements AIProvider {
  name = 'claude'

  constructor(private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const system = messages.find((m) => m.role === 'system')?.content || ''
    const nonSystem = messages.filter((m) => m.role !== 'system')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        system,
        messages: nonSystem,
        max_tokens: options.maxTokens ?? 2048,
      }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Claude API 错误: ${resp.status}`)
    }

    const data = await resp.json()
    return data.content[0].text
  }
}
