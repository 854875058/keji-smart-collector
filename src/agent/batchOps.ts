import type { Snippet, AgentConfig } from '../lib/types'
import { callAI } from './api'

/** 每批最多处理的笔记数量 */
const BATCH_SIZE = 10

/**
 * AI 批量自动标签 + 摘要
 * 将多条笔记内容合并到一个 prompt 中，一次 API 调用处理
 */
export async function batchAutoTag(
  snippets: Snippet[],
  config: AgentConfig
): Promise<Map<string, { tags: string[]; summary: string }>> {
  const result = new Map<string, { tags: string[]; summary: string }>()

  // 分批处理
  for (let i = 0; i < snippets.length; i += BATCH_SIZE) {
    const batch = snippets.slice(i, i + BATCH_SIZE)

    const notesText = batch
      .map(
        (s, idx) =>
          `[笔记${idx + 1}] ID: ${s.id}\n标题: ${s.title}\n内容: ${s.answer.slice(0, 500)}`
      )
      .join('\n\n---\n\n')

    const prompt = `请为以下每条笔记生成 2-5 个标签和一句话摘要。

${notesText}

请严格以 JSON 数组格式返回，每个元素包含 id、tags（字符串数组）、summary（一句话摘要）：
[{"id":"xxx","tags":["标签1","标签2"],"summary":"一句话摘要"}]

只返回 JSON，不要其他内容。`

    const response = await callAI(config, [
      { role: 'system', content: '你是一个笔记整理助手。请严格按照要求的 JSON 格式返回结果。' },
      { role: 'user', content: prompt },
    ])

    // 解析 JSON 响应
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue
      const parsed: { id: string; tags: string[]; summary: string }[] = JSON.parse(jsonMatch[0])
      for (const item of parsed) {
        if (item.id && Array.isArray(item.tags)) {
          result.set(item.id, { tags: item.tags, summary: item.summary || '' })
        }
      }
    } catch {
      // 解析失败跳过此批次
      console.warn('[batchAutoTag] JSON 解析失败，跳过批次', i)
    }
  }

  return result
}

/**
 * AI 查找重复/相似笔记
 * 将多条笔记合并到一个 prompt 中，让 AI 识别内容高度重叠的笔记组
 */
export async function batchFindDuplicates(
  snippets: Snippet[],
  config: AgentConfig
): Promise<{ group1: string; group2: string; reason: string }[]> {
  const allDuplicates: { group1: string; group2: string; reason: string }[] = []

  // 分批处理
  for (let i = 0; i < snippets.length; i += BATCH_SIZE) {
    const batch = snippets.slice(i, i + BATCH_SIZE)

    const notesText = batch
      .map(
        (s, idx) =>
          `[笔记${idx + 1}] ID: ${s.id}\n标题: ${s.title}\n内容: ${s.answer.slice(0, 300)}`
      )
      .join('\n\n---\n\n')

    const prompt = `请分析以下笔记，找出内容高度重复或相似的笔记对。

${notesText}

请严格以 JSON 数组格式返回，每对重复笔记包含 group1（笔记ID）、group2（笔记ID）、reason（重复原因简述）：
[{"group1":"id1","group2":"id2","reason":"内容几乎相同，都是关于..."}]

如果没有重复笔记，返回空数组 []。
只返回 JSON，不要其他内容。`

    const response = await callAI(config, [
      { role: 'system', content: '你是一个笔记查重助手。请严格按照要求的 JSON 格式返回结果。' },
      { role: 'user', content: prompt },
    ])

    // 解析 JSON 响应
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue
      const parsed: { group1: string; group2: string; reason: string }[] = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        allDuplicates.push(...parsed)
      }
    } catch {
      console.warn('[batchFindDuplicates] JSON 解析失败，跳过批次', i)
    }
  }

  return allDuplicates
}
