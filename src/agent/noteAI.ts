import type { Snippet, MindMap, NoteChatMessage } from '../lib/types'
import { proxyChat, extractText, fetchUsage } from '../lib/aiProxy'

/** 供 AI 阅读的笔记正文，过长则截断 */
function noteContext(snippet: Snippet, maxChars = 6000): string {
  const parts = [
    snippet.title && `标题：${snippet.title}`,
    snippet.question && `问题：${snippet.question}`,
    snippet.answer && `内容：${snippet.answer}`,
  ].filter(Boolean)
  const text = parts.join('\n\n')
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n（内容过长已截断）` : text
}

function mindMapPrompt(snippet: Snippet): string {
  return [
    '请把下面这条笔记提炼成一份思维导图，用 Markdown 无序列表表示层级。',
    '要求：',
    '1. 只输出列表本身，不要代码块、不要额外说明；',
    '2. 第一行是一个顶层节点，作为导图主题；',
    '3. 用两个空格的缩进表示下一层，最多四层；',
    '4. 每个节点尽量简短，不要整句复制原文。',
    '',
    noteContext(snippet),
  ].join('\n')
}

/**
 * 清洗 AI 返回的导图 Markdown：剥掉代码块围栏，只保留列表行。
 */
function sanitizeMindMapMarkdown(raw: string): string {
  const text = (raw || '').trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '')
  const lines = text
    .split('\n')
    .filter((line) => /^\s*([-*+]|\d+\.)\s+/.test(line) || line.trim().length > 0)
  return lines.join('\n').trim()
}

/** 生成思维导图（消耗一次免费额度） */
export async function generateMindMap(snippet: Snippet): Promise<MindMap> {
  const resp = await proxyChat({
    temperature: 0.3,
    messages: [{ role: 'user', content: mindMapPrompt(snippet) }],
  })
  const markdown = sanitizeMindMapMarkdown(extractText(resp))
  if (!markdown) {
    // 额度可能已被服务端扣除，刷新一次以保证 UI 显示准确
    await fetchUsage().catch(() => undefined)
    throw new Error('AI 未返回有效思维导图')
  }
  return { markdown, updatedAt: new Date().toISOString(), model: resp?.model }
}

/** 针对单条笔记提问（消耗一次免费额度） */
export async function askAboutNote(
  snippet: Snippet,
  history: NoteChatMessage[]
): Promise<{ answer: string; model?: string }> {
  const messages = [
    {
      role: 'system',
      content: [
        '你是用户笔记库里的助手。只依据下面这条笔记的内容回答问题，',
        '如果笔记里没有相关信息，请直接说明而不要编造。',
        '',
        noteContext(snippet),
      ].join('\n'),
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const resp = await proxyChat({ temperature: 0.4, messages })
  const answer = extractText(resp)
  if (!answer) {
    await fetchUsage().catch(() => undefined)
    throw new Error('AI 未返回有效回答')
  }
  return { answer, model: resp?.model }
}
