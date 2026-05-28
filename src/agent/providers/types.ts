export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AIProvider {
  name: string
  chat(messages: ChatMessage[], options: ChatOptions): Promise<string>
}
