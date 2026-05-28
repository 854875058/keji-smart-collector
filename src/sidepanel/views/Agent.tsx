import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { Snippet, AgentMessage, AgentConfig } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Send, Settings, Loader2, Sparkles } from 'lucide-react'

interface Props {
  snippets: Snippet[]
  folders: string[]
}

export function AgentView({ snippets, folders }: Props) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    storage.getAgentConfig().then(setConfig)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return
    if (!config?.apiKey) {
      setShowSettings(true)
      return
    }

    const userMsg: AgentMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // 搜索相关笔记作为上下文
      const relevantSnippets = searchRelevantSnippets(
        userMsg.content,
        snippets,
        5
      )

      const systemPrompt = buildSystemPrompt(relevantSnippets, folders)

      const response = await callAI(config, [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg.content },
      ])

      const assistantMsg: AgentMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      const errorMsg: AgentMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，出现了错误：${err.message || '未知错误'}`,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, config, messages, snippets, folders])

  if (showSettings || !config?.apiKey) {
    return <AgentSettings config={config} onSave={setConfig} onClose={() => setShowSettings(false)} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Sparkles className="h-8 w-8 mx-auto text-emerald-500 mb-3" />
            <h3 className="font-semibold text-slate-900">AI 助手</h3>
            <p className="text-sm text-slate-500 mt-1">
              基于你的收藏笔记，回答问题、整理内容
            </p>
            <div className="mt-4 space-y-2 text-left max-w-sm mx-auto">
              {[
                '我收藏了哪些关于 Docker 的内容？',
                '帮我总结最近保存的笔记',
                '给我的笔记自动分类',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="w-full text-left text-xs rounded-lg border border-slate-200 px-3 py-2 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-white border border-slate-200">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入栏 */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="输入问题..."
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function AgentSettings({
  config,
  onSave,
  onClose,
}: {
  config: AgentConfig | null
  onSave: (c: AgentConfig) => void
  onClose: () => void
}) {
  const [provider, setProvider] = useState<'openai' | 'claude' | 'gemini'>(config?.provider || 'openai')
  const [model, setModel] = useState(config?.model || 'gpt-4o-mini')
  const [apiKey, setApiKey] = useState(config?.apiKey || '')

  const handleSave = async () => {
    const cfg: AgentConfig = {
      provider: provider as AgentConfig['provider'],
      model,
      apiKey,
      temperature: 0.7,
    }
    await storage.setAgentConfig(cfg)
    onSave(cfg)
    onClose()
  }

  const modelOptions: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini'],
    claude: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'],
    gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="font-semibold text-slate-900">AI 助手设置</h3>
      <p className="text-xs text-slate-500">
        配置你自己的 AI API Key，数据不会上传到我们的服务器
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-600 mb-1 block">AI 提供商</label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as 'openai' | 'claude' | 'gemini'
              setProvider(p)
              setModel(modelOptions[p]?.[0] || '')
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">模型</label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {(modelOptions[provider] || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">API Key</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          取消
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={!apiKey.trim()}>
          保存
        </Button>
      </div>
    </div>
  )
}

// ── 辅助函数 ──────────────────────────────────────────

function searchRelevantSnippets(
  query: string,
  snippets: Snippet[],
  topK: number
): Snippet[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  if (terms.length === 0) return snippets.slice(0, topK)

  const scored = snippets.map((s) => {
    const text = `${s.title} ${s.question} ${s.answer} ${(s.tags || []).join(' ')}`.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (text.includes(term)) score++
    }
    return { snippet: s, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.snippet)
}

function buildSystemPrompt(snippets: Snippet[], folders: string[]): string {
  const notesContext = snippets
    .map(
      (s, i) =>
        `[笔记${i + 1}] 标题: ${s.title}\n来源: ${s.source}\n问题: ${s.question}\n内容: ${s.answer.slice(0, 500)}${s.tags?.length ? '\n标签: ' + s.tags.join(', ') : ''}`
    )
    .join('\n\n')

  return `你是"可记"智能收藏助手的 AI 助手。用户通过浏览器扩展收藏了来自 ChatGPT、Claude、Gemini 等平台的 AI 回答。

你的能力：
1. 基于用户的收藏笔记回答问题（智能问答）
2. 帮用户整理笔记（自动分类、打标签、生成摘要）
3. 对笔记内容进行二次加工（翻译、精简、续写、改写）

当前用户有 ${folders.length} 个笔记本：${folders.join('、') || '暂无'}

以下是与用户问题相关的笔记内容：
${notesContext || '暂无相关笔记'}

请用中文回答，保持简洁有用。如果问题涉及笔记内容，优先基于已有笔记回答。`
}

async function callAI(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  if (config.provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2048,
      }),
    })
    const data = await resp.json()
    if (data.error) throw new Error(data.error.message)
    return data.choices[0].message.content
  }

  if (config.provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        system: messages.find((m) => m.role === 'system')?.content || '',
        messages: messages.filter((m) => m.role !== 'system'),
        max_tokens: config.maxTokens || 2048,
      }),
    })
    const data = await resp.json()
    if (data.error) throw new Error(data.error.message)
    return data.content[0].text
  }

  if (config.provider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
          systemInstruction: messages.find((m) => m.role === 'system')
            ? { parts: [{ text: messages.find((m) => m.role === 'system')!.content }] }
            : undefined,
        }),
      }
    )
    const data = await resp.json()
    if (data.error) throw new Error(data.error.message)
    return data.candidates[0].content.parts[0].text
  }

  throw new Error(`不支持的 AI 提供商: ${config.provider}`)
}
