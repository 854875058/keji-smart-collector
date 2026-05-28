import type { Snippet } from '../../lib/types'

/** 搜索笔记工具 */
export function searchNotes(
  query: string,
  snippets: Snippet[],
  topK: number = 5
): Snippet[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)

  if (terms.length === 0) return snippets.slice(0, topK)

  const scored = snippets.map((s) => {
    const text = [
      s.title,
      s.question,
      s.answer,
      s.summary || '',
      ...(s.tags || []),
    ]
      .join(' ')
      .toLowerCase()

    let score = 0
    for (const term of terms) {
      // 标题匹配权重更高
      if (s.title.toLowerCase().includes(term)) score += 3
      if (s.question.toLowerCase().includes(term)) score += 2
      if (s.answer.toLowerCase().includes(term)) score += 1
      if (s.tags?.some((t) => t.toLowerCase().includes(term))) score += 2
    }
    return { snippet: s, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.snippet)
}
