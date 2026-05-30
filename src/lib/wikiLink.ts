/**
 * WikiLink 替换模块
 * 将 [[笔记标题]] 或 [[笔记标题|显示文本]] 替换为可点击链接
 * 安全处理：避免破坏 HTML 标签属性
 */

/** WikiLink 解析结果 */
interface WikiLinkMatch {
  fullMatch: string   // 完整匹配 [[...]]
  title: string       // 笔记标题
  display: string     // 显示文本
  index: number       // 在文本中的位置
}

/**
 * 解析文本中的 WikiLink
 * 匹配 [[title]] 或 [[title|display]]
 * 不匹配 HTML 属性中的 [[...]]
 */
function parseWikiLinks(text: string): WikiLinkMatch[] {
  const results: WikiLinkMatch[] = []
  // 匹配 [[...]]，但要求前面不是 = 或 " (HTML 属性特征)
  const regex = /(?<!["'=])\[\[([^\[\]]+?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0]
    const inner = match[1]

    // 解析 title|display
    const pipeIndex = inner.indexOf('|')
    let title: string
    let display: string

    if (pipeIndex >= 0) {
      title = inner.substring(0, pipeIndex).trim()
      display = inner.substring(pipeIndex + 1).trim()
    } else {
      title = inner.trim()
      display = title
    }

    if (title) {
      results.push({
        fullMatch,
        title,
        display,
        index: match.index,
      })
    }
  }

  return results
}

/**
 * 将 HTML 字符串中的 WikiLink 替换为可点击链接
 * 安全处理：使用分段方式，只替换不在 HTML 标签内的 WikiLink
 *
 * @param html HTML 字符串
 * @param findSnippetId 根据标题查找笔记 ID 的回调
 * @param className 可选的 CSS 类名
 * @returns 替换后的 HTML
 */
export function replaceWikiLinks(
  html: string,
  findSnippetId: (title: string) => string | undefined,
  className?: string
): string {
  // 将 HTML 拆分为标签和文本段
  // 标签: <...>  文本: 其他内容
  const parts: { text: string; isTag: boolean }[] = []
  let lastIdx = 0
  const tagRegex = /<[a-zA-Z/][^>]*>/g
  let tagMatch: RegExpExecArray | null

  while ((tagMatch = tagRegex.exec(html)) !== null) {
    // 标签前的文本
    if (tagMatch.index > lastIdx) {
      parts.push({
        text: html.substring(lastIdx, tagMatch.index),
        isTag: false,
      })
    }
    // 标签本身
    parts.push({
      text: tagMatch[0],
      isTag: true,
    })
    lastIdx = tagMatch.index + tagMatch[0].length
  }

  // 剩余文本
  if (lastIdx < html.length) {
    parts.push({
      text: html.substring(lastIdx),
      isTag: false,
    })
  }

  // 只对非标签部分进行 WikiLink 替换
  const result = parts
    .map((part) => {
      if (part.isTag) return part.text

      const links = parseWikiLinks(part.text)
      if (links.length === 0) return part.text

      let output = ''
      let lastEnd = 0

      for (const link of links) {
        // WikiLink 前的文本
        output += part.text.substring(lastEnd, link.index)

        // 查找笔记 ID
        const snippetId = findSnippetId(link.title)

        if (snippetId) {
          // 找到笔记，生成可点击链接
          const cls = className ? ` class="${className}"` : ''
          output += `<a${cls} href="#" data-snippet-id="${snippetId}" title="${escapeAttr(link.title)}">${escapeHtml(link.display)}</a>`
        } else {
          // 未找到笔记，保留原始文本但添加虚链接样式
          const cls = className ? ` class="${className} wiki-link--missing"` : ' class="wiki-link--missing"'
          output += `<a${cls} href="#" data-wiki-title="${escapeAttr(link.title)}" title="笔记不存在: ${escapeAttr(link.title)}">${escapeHtml(link.display)}</a>`
        }

        lastEnd = link.index + link.fullMatch.length
      }

      // 剩余文本
      output += part.text.substring(lastEnd)
      return output
    })
    .join('')

  return result
}

/**
 * 纯文本版本：将 WikiLink 替换为纯文本标记
 * 用于非 HTML 场景
 */
export function replaceWikiLinksText(
  text: string,
  findSnippetId: (title: string) => string | undefined
): string {
  return text.replace(
    /\[\[([^\[\]]+?)\]\]/g,
    (fullMatch, inner: string) => {
      const pipeIndex = inner.indexOf('|')
      const title = (pipeIndex >= 0 ? inner.substring(0, pipeIndex) : inner).trim()
      const display = pipeIndex >= 0 ? inner.substring(pipeIndex + 1).trim() : title
      const id = findSnippetId(title)
      return id ? display : fullMatch
    }
  )
}

/** HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 属性值转义 */
function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 从 HTML 中提取所有 WikiLink 标题
 * 用于检测哪些链接目标存在/缺失
 */
export function extractWikiLinkTitles(html: string): string[] {
  const titles: string[] = []
  const textParts = html.replace(/<[^>]+>/g, ' ')
  const regex = /\[\[([^\[\]]+?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(textParts)) !== null) {
    const inner = match[1]
    const pipeIndex = inner.indexOf('|')
    const title = (pipeIndex >= 0 ? inner.substring(0, pipeIndex) : inner).trim()
    if (title && !titles.includes(title)) {
      titles.push(title)
    }
  }

  return titles
}
