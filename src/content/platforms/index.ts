import type { SourcePlatform } from '../../lib/types'

export interface PlatformAdapter {
  name: SourcePlatform
  /** 选择所有 assistant 回答元素 */
  selectAssistantMessages(): Element[]
  /** 从 assistant 元素中提取回答内容容器 */
  selectAnswerContent(el: Element): Element
  /** 从 assistant 元素向前查找对应的 user 问题 */
  findUserQuestion(el: Element): string
}

const platform = detectPlatform()

function detectPlatform(): SourcePlatform | 'Web' {
  const url = window.location.href
  if (url.includes('chatgpt.com')) return 'ChatGPT'
  if (url.includes('claude.ai')) return 'Claude'
  if (url.includes('gemini.google.com')) return 'Gemini'
  if (url.includes('grok.com') || url.includes('x.ai')) return 'Grok'
  return 'Web'
}

/** ChatGPT 适配器 */
const chatgptAdapter: PlatformAdapter = {
  name: 'ChatGPT',
  selectAssistantMessages() {
    return Array.from(
      document.querySelectorAll('div[data-message-author-role="assistant"]')
    )
  },
  selectAnswerContent(el) {
    const selectors = [
      '.markdown',
      "[data-message-author-role='assistant'] .markdown",
      '.prose',
      "[class*='markdown']",
    ]
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found) return found
    }
    return el
  },
  findUserQuestion(el) {
    const userMsg = findPreviousSibling(
      el,
      '[data-message-author-role="user"]'
    )
    if (userMsg) return cleanQuestionText(extractText(userMsg))
    return '未识别用户问题'
  },
}

/** Claude 适配器 */
const claudeAdapter: PlatformAdapter = {
  name: 'Claude',
  selectAssistantMessages() {
    return Array.from(document.querySelectorAll('.font-claude-message'))
  },
  selectAnswerContent(el) {
    const selectors = [
      '.whitespace-pre-wrap',
      '.prose',
      "[class*='prose']",
      "[class*='font-claude-message']",
    ]
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found) return found
    }
    return el
  },
  findUserQuestion(el) {
    const userMsg = findPreviousSibling(
      el,
      '.font-claude-user-message, [data-is-streaming]'
    )
    if (userMsg) return cleanQuestionText(extractText(userMsg))
    return '未识别用户问题'
  },
}

/** Gemini 适配器 */
const geminiAdapter: PlatformAdapter = {
  name: 'Gemini',
  selectAssistantMessages() {
    return Array.from(document.querySelectorAll('message-content'))
  },
  selectAnswerContent(el) {
    const selectors = [
      'message-content',
      '.markdown',
      '.model-response-text',
      "[class*='response']",
    ]
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found) return found
    }
    return el
  },
  findUserQuestion(el) {
    const userMsg = findPreviousSibling(
      el,
      "user-query, [data-test-id='user-message'], .user-query, message-content",
      (candidate) => !candidate.closest('model-response')
    )
    if (userMsg) {
      const content =
        userMsg.querySelector('message-content') || userMsg
      return cleanQuestionText(extractText(content))
    }
    return '未识别用户问题'
  },
}

/** Grok 适配器 */
const grokAdapter: PlatformAdapter = {
  name: 'Grok',
  selectAssistantMessages() {
    return Array.from(
      document.querySelectorAll(
        '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"], [data-testid="assistant-message"], [data-testid="chat-message"][data-author="assistant"]'
      )
    )
  },
  selectAnswerContent(el) {
    const selectors = [
      '.prose',
      "[data-testid='markdown']",
      "[class*='markdown']",
    ]
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found) return found
    }
    return el
  },
  findUserQuestion(el) {
    const userMsg = findPreviousSibling(
      el,
      '[data-message-author-role="user"], [data-role="user"], [data-author="user"], [data-testid="user-message"]'
    )
    if (userMsg) return cleanQuestionText(extractText(userMsg))
    return '未识别用户问题'
  },
}

/** 获取当前平台适配器 */
export function getPlatformAdapter(): PlatformAdapter | null {
  switch (platform) {
    case 'ChatGPT':
      return chatgptAdapter
    case 'Claude':
      return claudeAdapter
    case 'Gemini':
      return geminiAdapter
    case 'Grok':
      return grokAdapter
    default:
      return null
  }
}

export function getPlatformName(): string {
  return platform
}

// ── 辅助函数 ──────────────────────────────────────────

/** 向前查找匹配选择器的兄弟元素 */
function findPreviousSibling(
  el: Element,
  selector: string,
  filter?: (el: Element) => boolean
): Element | null {
  const candidates = document.querySelectorAll(selector)
  let result: Element | null = null
  for (const candidate of candidates) {
    if (candidate === el) continue
    if (filter && !filter(candidate)) continue
    if (
      el.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      if (
        !result ||
        result.compareDocumentPosition(candidate) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        result = candidate
      }
    }
  }
  return result
}

/** 提取元素纯文本 */
function extractText(el: Element): string {
  return (el.textContent || '').trim()
}

/** 清理问题文本 */
function cleanQuestionText(text: string): string {
  return (
    text
      .replace(/^(you said|you|user|你说|你問|提问|问题)\s*[:：]\s*/i, '')
      .trim() || '未识别用户问题'
  )
}
