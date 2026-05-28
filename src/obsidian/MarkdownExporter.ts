import type { Snippet } from '../lib/types'

/** 将 Snippet 转换为 Obsidian 兼容的 Markdown */
export function snippetToMarkdown(snippet: Snippet): string {
  const frontmatter = buildFrontmatter(snippet)
  const body = buildBody(snippet)
  return `---\n${frontmatter}---\n\n${body}`
}

function buildFrontmatter(s: Snippet): string {
  const lines: string[] = []
  lines.push(`title: "${escapeYaml(s.title)}"`)
  lines.push(`source: ${s.source}`)
  lines.push(`url: "${s.url}"`)
  lines.push(`created: ${s.timestamp}`)
  if (s.tags && s.tags.length > 0) {
    lines.push(`tags: [${s.tags.map((t) => `"${t}"`).join(', ')}]`)
  }
  if (s.folder) {
    lines.push(`folder: "${escapeYaml(s.folder)}"`)
  }
  lines.push(`keji_id: "${s.id}"`)
  if (s.isFavourite) {
    lines.push(`favourite: true`)
  }
  lines.push('')
  return lines.join('\n')
}

function buildBody(s: Snippet): string {
  const parts: string[] = []

  parts.push(`## 问题\n${s.question}\n`)
  parts.push(`## 回答\n${s.answer}\n`)

  if (s.media?.images && s.media.images.length > 0) {
    parts.push(`## 图片`)
    for (const img of s.media.images) {
      parts.push(`![${img.alt || 'image'}](${img.src})`)
    }
    parts.push('')
  }

  if (s.media?.tables && s.media.tables.length > 0) {
    parts.push(`## 表格`)
    for (const table of s.media.tables) {
      parts.push(table)
    }
    parts.push('')
  }

  parts.push(`---\n*由可记智能收藏助手导出*`)

  return parts.join('\n')
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ')
}

/** 生成文件名（去除非法字符） */
export function snippetToFilename(snippet: Snippet): string {
  const safe = snippet.title
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe}.md`
}

/** 生成文件夹路径 */
export function snippetToFolderPath(
  snippet: Snippet,
  prefix: string = '可记'
): string {
  if (snippet.folder) {
    return `${prefix}/${snippet.folder}`
  }
  return prefix
}
