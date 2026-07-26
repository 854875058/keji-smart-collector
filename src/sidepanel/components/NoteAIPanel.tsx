import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Loader2, MessageCircle, Crown, RefreshCw } from 'lucide-react'
import type { Snippet, AIUsage, NoteChatMessage } from '../../lib/types'
import { storage } from '../../lib/storage'
import { generateMindMap, askAboutNote } from '../../agent/noteAI'
import {
  fetchUsage,
  getCachedUsage,
  isQuotaExhausted,
  PRO_URL,
} from '../../lib/aiProxy'
import { resolveChannel, NO_CHANNEL_MESSAGE, type AIChannel } from '../../agent/channel'
import MindMapView from './MindMapView'
import { Button } from './ui/button'
import { Input } from './ui/input'

const QUOTA_HINT = '今日免费额度已使用完，每日0点会自动刷新额度。'

function openExternal(url: string) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

interface NoteAIPanelProps {
  snippet: Snippet
  /** 保存后通知外层刷新笔记数据 */
  onUpdated: () => void | Promise<void>
  showToast: (type: 'success' | 'error', message: string) => void
  /** 侧边栏用紧凑排版 */
  compact?: boolean
}

/** 单条笔记的 AI 面板：思维导图 + 追问。自备 Key 时不受免费额度限制 */
export default function NoteAIPanel({
  snippet,
  onUpdated,
  showToast,
  compact,
}: NoteAIPanelProps) {
  const [usage, setUsage] = useState<AIUsage | null>(null)
  const [channel, setChannel] = useState<AIChannel | null>(null)
  const [mindLoading, setMindLoading] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [question, setQuestion] = useState('')
  const [tab, setTab] = useState<'mindMap' | 'chat'>('mindMap')

  const mindMap = snippet.ai?.mindMap
  const chats = snippet.ai?.chats || []
  // 自备 Key 直连模型服务商，不存在免费额度用尽的情况
  const byok = channel === 'byok'
  const exhausted = !byok && isQuotaExhausted(usage)

  // 判定通道；只有走服务端代理时才需要额度信息
  useEffect(() => {
    let alive = true
    resolveChannel()
      .then(({ channel: ch }) => {
        if (!alive) return
        setChannel(ch)
        if (ch !== 'proxy') return
        getCachedUsage().then((cached) => {
          if (alive && cached) setUsage(cached)
        })
        fetchUsage()
          .then((fresh) => {
            if (alive) setUsage(fresh)
          })
          .catch(() => undefined)
      })
      .catch(() => {
        // 两种方式都没配置：保持 null，操作时给出引导文案
        if (alive) setChannel(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const refreshUsage = useCallback(async () => {
    if (byok) return
    try {
      setUsage(await fetchUsage())
    } catch {
      // 未登录或网络异常时静默，操作时会给出明确提示
    }
  }, [byok])

  const handleGenerateMindMap = useCallback(async () => {
    if (mindLoading) return
    if (exhausted) {
      showToast('error', QUOTA_HINT)
      return
    }
    if (
      mindMap?.markdown?.trim() &&
      !window.confirm('已有思维导图，重新生成会覆盖当前内容，是否继续？')
    ) {
      return
    }

    setMindLoading(true)
    showToast('success', '正在生成思维导图...')
    try {
      const result = await generateMindMap(snippet)
      await storage.updateSnippet(snippet.id, {
        ai: { ...(snippet.ai || {}), mindMap: result, chats },
      })
      await onUpdated()
      setTab('mindMap')
      showToast('success', '思维导图已生成')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '思维导图生成失败')
    } finally {
      setMindLoading(false)
      await refreshUsage()
    }
  }, [
    mindLoading, exhausted, mindMap, snippet, chats, onUpdated, showToast, refreshUsage,
  ])

  const handleAsk = useCallback(async () => {
    const text = question.trim()
    if (!text || chatLoading) return
    if (exhausted) {
      showToast('error', QUOTA_HINT)
      return
    }

    const history: NoteChatMessage[] = [
      ...chats,
      {
        id: `${Date.now()}-u`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]

    setChatLoading(true)
    setQuestion('')
    try {
      const { answer } = await askAboutNote(snippet, history)
      const updated: NoteChatMessage[] = [
        ...history,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: answer,
          createdAt: new Date().toISOString(),
        },
      ]
      await storage.updateSnippet(snippet.id, {
        ai: { ...(snippet.ai || {}), mindMap, chats: updated },
      })
      await onUpdated()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'AI 问答失败')
      setQuestion(text)
    } finally {
      setChatLoading(false)
      await refreshUsage()
    }
  }, [
    question, chatLoading, exhausted, chats, snippet, mindMap, onUpdated, showToast, refreshUsage,
  ])

  return (
    <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-700">
      {/* 头部：标签切换 + 额度 */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          AI 助手
        </span>
        <div className="flex-1" />
        {byok ? (
          <span
            className="text-[10px] text-emerald-600 dark:text-emerald-400"
            title="正在使用你在「智能体」页配置的 API Key，不消耗每日免费额度"
          >
            自备 Key
          </span>
        ) : (
          <>
            {usage && (
              <span
                className={`text-[10px] ${
                  exhausted ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'
                }`}
                title={exhausted ? QUOTA_HINT : '每日 0 点自动刷新'}
              >
                今日 {usage.used} / {usage.limit}
              </span>
            )}
            <button
              onClick={refreshUsage}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
              title="刷新额度"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {channel === null && (
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
          {NO_CHANNEL_MESSAGE}
        </div>
      )}

      {exhausted && (
        <button
          onClick={() => openExternal(PRO_URL)}
          className="w-full mb-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
        >
          <Crown className="h-3 w-3" />
          {QUOTA_HINT} 升级 Pro 获取更多额度
        </button>
      )}

      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab('mindMap')}
          className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
            tab === 'mindMap'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          思维导图
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
            tab === 'chat'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          追问{chats.length > 0 ? ` (${chats.length})` : ''}
        </button>
      </div>

      {tab === 'mindMap' ? (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleGenerateMindMap}
            disabled={mindLoading || exhausted}
            title={exhausted ? QUOTA_HINT : undefined}
            className="gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mindLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {mindLoading ? '生成中...' : mindMap ? '重新生成思维导图' : '生成思维导图'}
          </Button>
          {mindMap?.markdown && (
            <MindMapView markdown={mindMap.markdown} compact={compact} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {chats.length === 0 && (
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                对这条笔记提问，AI 只依据笔记内容回答。
              </div>
            )}
            {chats.map((m) => (
              <div
                key={m.id}
                className={`p-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    : 'bg-emerald-50 text-slate-800 dark:bg-emerald-900/20 dark:text-slate-200'
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              placeholder="就这条笔记提问，回车发送"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAsk()
                }
              }}
              disabled={chatLoading || exhausted}
              className="flex-1 h-8 text-xs"
            />
            <Button
              size="sm"
              onClick={handleAsk}
              disabled={chatLoading || exhausted || !question.trim()}
              className="h-8 px-3 disabled:opacity-50"
            >
              {chatLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
