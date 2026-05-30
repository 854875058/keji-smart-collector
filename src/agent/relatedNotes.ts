import type { Snippet } from '../lib/types'

/**
 * 提取关键词集合：标题 + 标签 + 内容前 200 字
 * 使用中文分词的简易方案：按标点/空格切分，过滤长度 >= 2 的词
 */
function extractKeywords(text: string): Set<string> {
  // 按空白、标点切分，过滤空串和长度 < 2 的 token
  const tokens = text
    .toLowerCase()
    .replace(/[^一-鿿\w]+/g, ' ') // 保留中文、字母、数字
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  return new Set(tokens)
}

/** 计算两个集合的 Jaccard 相似度 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * 基于关键词匹配查找相关笔记
 * @param current 当前笔记
 * @param all 所有笔记
 * @param topK 返回最相关的 K 条
 * @returns 按相似度降序排列的相关笔记
 */
export function findRelatedNotes(current: Snippet, all: Snippet[], topK = 5): Snippet[] {
  // 构建当前笔记的关键词集
  const currentText = [
    current.title,
    ...(current.tags || []),
    current.answer.slice(0, 200),
  ].join(' ')
  const currentKeywords = extractKeywords(currentText)

  // 计算每条笔记的相似度
  const scored: { snippet: Snippet; score: number }[] = []
  for (const s of all) {
    if (s.id === current.id) continue

    const otherText = [
      s.title,
      ...(s.tags || []),
      s.answer.slice(0, 200),
    ].join(' ')
    const otherKeywords = extractKeywords(otherText)

    const score = jaccardSimilarity(currentKeywords, otherKeywords)
    if (score > 0) {
      scored.push({ snippet: s, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.snippet)
}
