import type { Snippet, AgentConfig } from '../lib/types'
import { callAI } from './api'

interface AutoTagResult {
  tags: string[]
  summary: string
  recommendedFolder: string
}

/**
 * AI 自动打标签 + 摘要 + 推荐文件夹
 */
export async function autoTagAndSummarize(
  snippet: Snippet,
  config: AgentConfig,
  folders: string[] = []
): Promise<AutoTagResult> {
  const content = snippet.answer.slice(0, 2000)

  const prompt = `分析以下笔记内容，返回 JSON 格式的结果。

笔记标题: ${snippet.title}
笔记来源: ${snippet.source}
笔记内容:
${content}

现有文件夹: ${folders.join('、') || '暂无'}

请返回一个 JSON 对象（不要包含其他文字）:
{
  "tags": ["标签1", "标签2"],
  "summary": "一句话摘要",
  "recommendedFolder": "推荐的文件夹名"
}

要求:
- tags: 2-5 个简短标签，概括笔记主题
- summary: 不超过 50 字的一句话摘要
- recommendedFolder: 从现有文件夹中选择最匹配的，如果没有合适的就返回空字符串`

  try {
    const response = await callAI(config, [
      { role: 'system', content: '你是一个笔记分析助手，只返回 JSON 格式的结果。' },
      { role: 'user', content: prompt },
    ])

    // 提取 JSON（可能被 markdown 代码块包裹）
    let jsonStr = response.trim()
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonStr = jsonMatch[0]

    const result = JSON.parse(jsonStr)
    return {
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 5) : [],
      summary: typeof result.summary === 'string' ? result.summary.slice(0, 100) : '',
      recommendedFolder: typeof result.recommendedFolder === 'string' ? result.recommendedFolder : '',
    }
  } catch {
    return { tags: [], summary: '', recommendedFolder: '' }
  }
}
