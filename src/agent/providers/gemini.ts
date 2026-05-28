import type { AIProvider, ChatMessage, ChatOptions } from './types'

export class GeminiProvider implements AIProvider {
  name = 'gemini'

  constructor(private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const system = messages.find((m) => m.role === 'system')?.content
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body: any = { contents }
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] }
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Gemini API 错误: ${resp.status}`)
    }

    const data = await resp.json()
    return data.candidates[0].content.parts[0].text
  }
}
