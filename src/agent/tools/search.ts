import type { Snippet } from '../../lib/types'
import { fullTextIndex } from '../../lib/fulltext'

/** 搜索笔记工具 - 使用全文索引（支持中文 bigram） */
export function searchNotes(
  query: string,
  snippets: Snippet[],
  topK: number = 5
): Snippet[] {
  // 确保索引已构建
  const stats = fullTextIndex.getStats()
  if (stats.totalDocs === 0 && snippets.length > 0) {
    const documents = snippets.map((s) => ({
      id: s.id,
      text: [s.title, s.question, s.answer, s.summary || '', ...(s.tags || [])].join(' '),
    }))
    fullTextIndex.buildIndex(documents)
  }

  // 使用全文索引搜索
  const results = fullTextIndex.search(query, topK)

  // 如果索引无结果，回退到简单搜索
  if (results.length === 0) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)

    if (terms.length === 0) return snippets.slice(0, topK)

    const scored = snippets.map((s) => {
      const text = [s.title, s.question, s.answer, s.summary || '', ...(s.tags || [])]
        .join(' ')
        .toLowerCase()

      let score = 0
      for (const term of terms) {
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

  // 从索引结果映射回 snippet 对象
  const snippetMap = new Map(snippets.map((s) => [s.id, s]))
  return results
    .map((r) => snippetMap.get(r.docId))
    .filter((s): s is Snippet => s !== undefined)
}
