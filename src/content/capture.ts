import type { Snippet, MediaAttachment, ImageInfo } from '../lib/types'
import { generateTitle, normalizeText, detectPlatform } from '../lib/utils'
import { getPlatformAdapter, getPlatformName } from './platforms'

/** 从选区提取内容 */
export function captureSelection(): {
  text: string
  html: string
  media: MediaAttachment
} | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())
  stripUnsafeElements(container)
  resolveImageUrls(container)

  return {
    text: normalizeText(domToText(container)),
    html: container.innerHTML.trim(),
    media: extractMedia(container),
  }
}

/** 从 assistant 消息元素提取内容 */
export function captureMessage(el: Element): {
  text: string
  html: string
  media: MediaAttachment
} {
  const adapter = getPlatformAdapter()
  const contentEl = adapter ? adapter.selectAnswerContent(el) : el

  const clone = contentEl.cloneNode(true) as HTMLElement
  stripInjectedButtons(clone)
  stripUnsafeElements(clone)

  const text = normalizeText(domToText(clone))

  const htmlClone = contentEl.cloneNode(true) as HTMLElement
  stripInjectedButtons(htmlClone)
  stripUnsafeElements(htmlClone)
  resolveImageUrls(htmlClone)

  return {
    text,
    html: htmlClone.innerHTML.trim(),
    media: extractMedia(htmlClone),
  }
}

/** 构建 snippet 对象 */
export function buildSnippet(
  question: string,
  answer: string,
  contentHtml?: string,
  media?: MediaAttachment
): Snippet {
  return {
    id: Date.now().toString(),
    source: getPlatformName(),
    title: generateTitle(),
    question,
    answer,
    contentHtml,
    media: media || { images: [], tables: [] },
    timestamp: new Date().toISOString(),
    url: window.location.href,
  }
}

/** 整页捕获 */
export function captureFullPage(): Snippet | null {
  const adapter = getPlatformAdapter()

  if (!adapter) {
    // 普通网页：尝试选区，回退到 article/main
    const selection = captureSelection()
    if (selection && selection.text) {
      return buildSnippet(
        '网页划词保存',
        selection.text,
        selection.html,
        selection.media
      )
    }
    const main =
      document.querySelector('article, main') || document.body
    if (!main) return null
    const content = captureMessage(main)
    return buildSnippet(
      '网页内容保存',
      content.text.slice(0, 8000),
      content.html,
      content.media
    )
  }

  // AI 平台：捕获所有 assistant 消息
  const messages = adapter.selectAssistantMessages()
  if (messages.length === 0) return null

  const turns = messages
    .map((el) => {
      const question = adapter.findUserQuestion(el)
      const content = captureMessage(el)
      return { question, ...content }
    })
    .filter((t) => t.text.trim() || t.html.trim())

  if (turns.length === 0) return null

  const answer = turns
    .map((t) => `## 提问\n${t.question}\n\n## 回答\n${t.text}`)
    .join('\n\n\n')

  const contentHtml = turns
    .map(
      (t, i) => `
<section class="keji-captured-turn" data-turn-index="${i + 1}">
  <h3>Q${i + 1}</h3>
  <div class="keji-captured-question">${escapeHtml(t.question)}</div>
  <h3>A${i + 1}</h3>
  <div class="keji-captured-answer">${t.html || '<p>（空）</p>'}</div>
</section>`
    )
    .join('<hr />')

  // 合并媒体
  const media: MediaAttachment = { images: [], tables: [] }
  for (const t of turns) {
    for (const img of t.media.images) {
      if (!media.images.find((i) => i.src === img.src)) {
        media.images.push(img)
      }
    }
    for (const table of t.media.tables) {
      if (!media.tables.includes(table)) {
        media.tables.push(table)
      }
    }
  }

  return buildSnippet('整页对话保存', answer, contentHtml, media)
}

// ── DOM 工具函数 ──────────────────────────────────────

const BLOCK_ELEMENTS = new Set([
  'article', 'aside', 'blockquote', 'dl', 'dt', 'dd',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'table', 'tbody', 'thead',
  'tfoot', 'tr', 'td', 'th', 'ul',
])

/** DOM 转纯文本（保留结构） */
function domToText(root: Element): string {
  let result = ''

  const addNewlines = (count: number) => {
    const target = '\n'.repeat(count)
    if (!result.endsWith(target)) {
      result = result.replace(/\n*$/, '') + target
    }
  }

  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'br') {
      addNewlines(1)
      return
    }

    const isBlock = BLOCK_ELEMENTS.has(tag)
    if (isBlock && result.trim()) {
      addNewlines(tag === 'li' ? 1 : 2)
    }

    if (tag === 'li') result += '- '

    Array.from(el.childNodes).forEach(walk)

    if (isBlock) {
      addNewlines(tag === 'li' ? 1 : 2)
    }
  }

  Array.from(root.childNodes).forEach(walk)
  return normalizeText(result)
}

/** 移除不安全元素 */
function stripUnsafeElements(el: Element) {
  el.querySelectorAll('script, style, iframe, object, embed').forEach((e) =>
    e.remove()
  )
}

/** 移除注入的按钮 */
function stripInjectedButtons(el: Element) {
  el.querySelectorAll('.keji-btn-container').forEach((e) => e.remove())
}

/** 解析图片 URL 为绝对路径 */
function resolveImageUrls(el: Element) {
  el.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) {
      try {
        img.setAttribute('src', new URL(src, document.baseURI).toString())
      } catch {}
    }
  })
}

/** 提取媒体（图片 + 表格） */
function extractMedia(el: Element): MediaAttachment {
  const images: ImageInfo[] = []
  const tables: string[] = []

  el.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) {
      try {
        const absUrl = new URL(src, document.baseURI).toString()
        if (!images.find((i) => i.src === absUrl)) {
          images.push({ src: absUrl, alt: img.getAttribute('alt') || undefined })
        }
      } catch {}
    }
  })

  el.querySelectorAll('table').forEach((table) => {
    tables.push(table.outerHTML)
  })

  return { images, tables }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
