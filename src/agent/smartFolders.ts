import type { Snippet, SmartFolder, SmartFolderRule } from '../lib/types'

/** 检查单条规则是否匹配 */
function matchRule(snippet: Snippet, rule: SmartFolderRule): boolean {
  let target = ''

  switch (rule.field) {
    case 'source':
      target = snippet.source || ''
      break
    case 'tags':
      // 标签字段特殊处理：检查是否有一个标签匹配
      if (!snippet.tags || snippet.tags.length === 0) return false
      return snippet.tags.some((tag) => matchValue(tag, rule.operator, rule.value))
    case 'title':
      target = snippet.title || ''
      break
    case 'answer':
      target = snippet.answer || ''
      break
  }

  return matchValue(target, rule.operator, rule.value)
}

/** 根据操作符匹配值 */
function matchValue(target: string, operator: SmartFolderRule['operator'], value: string): boolean {
  const t = target.toLowerCase()
  const v = value.toLowerCase()

  switch (operator) {
    case 'contains':
      return t.includes(v)
    case 'equals':
      return t === v
    case 'startsWith':
      return t.startsWith(v)
    default:
      return false
  }
}

/** 检查笔记是否匹配智能文件夹规则 */
export function matchSnippet(snippet: Snippet, folder: SmartFolder): boolean {
  if (folder.rules.length === 0) return false

  if (folder.operator === 'and') {
    return folder.rules.every((rule) => matchRule(snippet, rule))
  } else {
    return folder.rules.some((rule) => matchRule(snippet, rule))
  }
}

/** 获取匹配智能文件夹的所有笔记 */
export function getSmartFolderSnippets(snippets: Snippet[], folder: SmartFolder): Snippet[] {
  return snippets.filter((snippet) => matchSnippet(snippet, folder))
}
