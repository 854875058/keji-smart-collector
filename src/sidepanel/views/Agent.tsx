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
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">AI 助手</h3>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
              基于你的收藏笔记，回答问题、整理内容
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="mt-2 text-xs text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              ⚙ 设置 API
            </button>
            <div className="mt-4 space-y-2 text-left max-w-sm mx-auto">
              {[
                '我收藏了哪些关于 Docker 的内容？',
                '帮我总结最近保存的笔记',
                '给我的笔记自动分类',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="w-full text-left text-xs rounded-lg border border-slate-200 px-3 py-2 hover:bg-emerald-50 hover:border-emerald-200 transition-colors dark:border-slate-700 dark:hover:bg-emerald-900/30 dark:hover:border-emerald-600"
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
                  : 'bg-white border border-slate-200 text-slate-800 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入栏 */}
      <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="API 设置"
          >
            <Settings className="h-4 w-4" />
          </Button>
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

/** 预设提供商 */
const AI_PRESETS = [
  // ── Anthropic 格式 ──
  { id: 'claude', name: 'Claude 官方', group: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'] },
  { id: 'claude-proxy', name: 'Claude 代理', group: 'Anthropic', baseUrl: '', defaultModel: '', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'mimo-v2.5-pro'] },
  // ── OpenAI 兼容格式 ──
  { id: 'openai', name: 'OpenAI', group: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'deepseek', name: 'DeepSeek', group: 'OpenAI', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'siliconflow', name: 'SiliconFlow', group: 'OpenAI', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'Qwen/Qwen2.5-7B-Instruct', models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'moonshot', name: 'Moonshot (Kimi)', group: 'OpenAI', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'zhipu', name: '智谱 AI', group: 'OpenAI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long'] },
  { id: 'gemini', name: 'Gemini', group: 'OpenAI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', models: ['gemini-2.0-flash', 'gemini-2.5-pro'] },
  { id: 'custom', name: '自定义', group: '其他', baseUrl: '', defaultModel: '', models: [] },
]

function AgentSettings({
  config,
  onSave,
  onClose,
}: {
  config: AgentConfig | null
  onSave: (c: AgentConfig) => void
  onClose: () => void
}) {
  const [presetId, setPresetId] = useState(config?.presetId || 'openai')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || 'https://api.openai.com/v1')
  const [model, setModel] = useState(config?.model || 'gpt-4o-mini')
  const [apiKey, setApiKey] = useState(config?.apiKey || '')

  const currentPreset = AI_PRESETS.find((p) => p.id === presetId)

  const handlePresetChange = (id: string) => {
    setPresetId(id)
    const preset = AI_PRESETS.find((p) => p.id === id)
    if (preset && id !== 'custom' && id !== 'claude-proxy') {
      setBaseUrl(preset.baseUrl)
      setModel(preset.defaultModel)
    }
  }

  const handleSave = async () => {
    const cfg: AgentConfig = {
      baseUrl: baseUrl.replace(/\/+$/, ''),  // 去掉末尾斜杠
      model,
      apiKey,
      temperature: 0.7,
      presetId,
    }
    await storage.setAgentConfig(cfg)
    onSave(cfg)
    onClose()
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">AI 助手设置</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        支持 OpenAI 和 Anthropic 两种 API 格式，数据不会上传到我们的服务器
      </p>

      <div className="space-y-3">
        {/* 快捷预设 - 按格式分组 */}
        {['Anthropic', 'OpenAI', '其他'].map((group) => {
          const groupPresets = AI_PRESETS.filter((p) => p.group === group)
          if (groupPresets.length === 0) return null
          return (
            <div key={group}>
              <label className="text-xs text-slate-600 mb-1 block dark:text-slate-400">
                {group === 'Anthropic' ? 'Anthropic 格式' : group === 'OpenAI' ? 'OpenAI 兼容格式' : '其他'}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {groupPresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePresetChange(p.id)}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      presetId === p.id
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-600'
                        : 'border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        {/* Base URL */}
        <div>
          <label className="text-xs text-slate-600 mb-1 block dark:text-slate-400">API Base URL</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <p className="text-[10px] text-slate-400 mt-0.5 dark:text-slate-500">
            兼容 OpenAI 格式的 API 地址，末尾不需要加 /chat/completions
          </p>
        </div>

        {/* 模型名称 */}
        <div>
          <label className="text-xs text-slate-600 mb-1 block dark:text-slate-400">模型名称</label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="输入模型名称"
          />
          {/* 模型快捷选择 */}
          {currentPreset && currentPreset.models.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {currentPreset.models.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    model === m
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="text-xs text-slate-600 mb-1 block dark:text-slate-400">API Key</label>
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
        <Button className="flex-1" onClick={handleSave} disabled={!apiKey.trim() || !baseUrl.trim()}>
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

/** 判断是否使用 Anthropic API 格式 */
function isAnthropicFormat(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase()
  return lower.includes('anthropic') || lower.includes('claude')
}

async function callAI(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  if (isAnthropicFormat(config.baseUrl)) {
    return callAnthropic(config, messages)
  }
  return callOpenAI(config, messages)
}

/** OpenAI 兼容格式 */
async function callOpenAI(
  config: AgentConfig,
  messages: { role: string; content: string }[]
): Promise<string> {
  let base = config.baseUrl.replace(/\/+$/, '')
  if (!base.endsWith('/chat/completions')) {
    if (base.endsWith('/v1') || base.endsWith('/v4')) {
      base = `${base}/chat/completions`
    } else {
      base = `${base}/chat/completions`
    }
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
  // 拼接 Anthropic 端点
  if (!base.endsWith('/messages')) {
    if (base.endsWith('/v1')) {
      base = `${base}/messages`
    } else {
      base = `${base}/v1/messages`
    }
  }

  // 提取 system message
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
