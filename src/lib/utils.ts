import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Snippet } from './types'
import { fullTextIndex } from './fulltext'

/** 搜索范围 */
export type SearchScope = 'all' | 'title' | 'content' | 'tags'

/** 合并 Tailwind 类名 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 生成笔记标题 */
export function generateTitle(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `笔记 - ${mm}-${dd} ${hh}:${mi}`
}

/**
 * 生成笔记 ID。
 * 带随机后缀，避免同一毫秒内连续保存（如批量整理、收集箱一次性入库）撞 ID。
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 去除文本尾部空白 */
export function trimTrailing(text: string): string {
  return text.replace(/\s+$/, '')
}

/** 清理用户问题文本 */
export function cleanQuestion(text: string): string {
  return (
    stripHtml(text)
      .replace(/^(you said|you|user|你说|你問|提问|问题)\s*[:：]\s*/i, '')
      .trim() || '未识别用户问题'
  )
}

/** HTML 转义 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 去除 HTML 标签 */
export function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || ''
}

/** 文本规范化：合并多余空白和空行 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 格式化日期 */
export function formatDate(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

/** 检测来源平台 */
export function detectPlatform(): string {
  const url = window.location.href
  if (url.includes('chatgpt.com')) return 'ChatGPT'
  if (url.includes('claude.ai')) return 'Claude'
  if (url.includes('gemini.google.com')) return 'Gemini'
  if (url.includes('grok.com') || url.includes('x.ai')) return 'Grok'
  return 'Web'
}

/**
 * BM25 搜索 - 使用全文索引（支持中文 bigram）
 * 如果索引为空则回退到简单搜索
 */
export function bm25Search(
  query: string,
  documents: { id: string; text: string }[],
  topK = 5
): { id: string; score: number }[] {
  const stats = fullTextIndex.getStats()
  if (stats.totalDocs === 0 && documents.length > 0) {
    fullTextIndex.buildIndex(documents)
  }
  const results = fullTextIndex.search(query, topK)
  return results.map((r) => ({ id: r.docId, score: r.score }))
}

/** 重建全文索引 */
export function rebuildFullTextIndex(snippets: Snippet[]): void {
  const documents = snippets.map((s) => ({
    id: s.id,
    text: [s.title, s.question, s.answer, s.summary || '', ...(s.tags || [])].join(' '),
  }))
  fullTextIndex.buildIndex(documents)
}

/** 获取 snippet 指定范围的文本内容 */
function getSnippetText(snippet: Snippet, scope: SearchScope): string {
  switch (scope) {
    case 'title':
      return snippet.title
    case 'content':
      return [snippet.question, snippet.answer].join(' ')
    case 'tags':
      return (snippet.tags || []).join(' ')
    case 'all':
    default:
      return [
        snippet.title,
        snippet.question,
        snippet.answer,
        (snippet.tags || []).join(' '),
        (snippet.annotations || []).map((a) => `${a.text} ${a.quote || ''}`).join(' '),
      ].join(' ')
  }
}

/** 按搜索范围过滤 snippet 列表，返回匹配的 snippet 及匹配数量 */
export function filterBySearch(
  snippets: Snippet[],
  query: string,
  scope: SearchScope = 'all'
): { snippet: Snippet; matchCount: number }[] {
  const trimmed = query.trim()
  if (!trimmed) return snippets.map((s) => ({ snippet: s, matchCount: 0 }))

  const queryLower = trimmed.toLowerCase()
  const terms = queryLower.split(/\s+/).filter((t) => t.length > 0)

  return snippets
    .map((snippet) => {
      const text = getSnippetText(snippet, scope).toLowerCase()
      let matchCount = 0
      for (const term of terms) {
        let idx = text.indexOf(term)
        while (idx !== -1) {
          matchCount++
          idx = text.indexOf(term, idx + term.length)
        }
      }
      return { snippet, matchCount }
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
}

/** 在文本中高亮匹配的关键词，返回 HTML 字符串（用 <mark> 包裹） */
export function highlightText(text: string, query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return escapeHtml(text)

  const terms = trimmed.split(/\s+/).filter((t) => t.length > 0)
  if (terms.length === 0) return escapeHtml(text)

  // 按长度降序排列，优先匹配较长的词
  const sorted = [...terms].sort((a, b) => b.length - a.length)
  const pattern = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')

  // split 会保留捕获组，奇数索引为匹配项
  const parts = text.split(regex)
  return parts
    .map((part, i) => {
      // 奇数索引 = 正则捕获组匹配的内容
      if (i % 2 === 1) {
        return `<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">${escapeHtml(part)}</mark>`
      }
      return escapeHtml(part)
    })
    .join('')
}
