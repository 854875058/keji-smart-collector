import type { AIProvider, ChatMessage, ChatOptions } from './types'

export class OpenAIProvider implements AIProvider {
  name = 'openai'

  constructor(private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI API 错误: ${resp.status}`)
    }

    const data = await resp.json()
    return data.choices[0].message.content
  }
}
