import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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

/** 简单 BM25 搜索 */
export function bm25Search(
  query: string,
  documents: { id: string; text: string }[],
  topK = 5
): { id: string; score: number }[] {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
  if (queryTerms.length === 0) return []

  const avgDl =
    documents.reduce((sum, d) => sum + d.text.length, 0) / documents.length || 1
  const k1 = 1.5
  const b = 0.75

  const scores = documents.map((doc) => {
    const text = doc.text.toLowerCase()
    const dl = text.length
    let score = 0

    for (const term of queryTerms) {
      // 简单的子串匹配计数
      let tf = 0
      let idx = text.indexOf(term)
      while (idx !== -1) {
        tf++
        idx = text.indexOf(term, idx + 1)
      }
      if (tf === 0) continue

      const idf = Math.log(
        (documents.length - tf + 0.5) / (tf + 0.5) + 1
      )
      score += (idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * dl) / avgDl))
    }

    return { id: doc.id, score }
  })

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
