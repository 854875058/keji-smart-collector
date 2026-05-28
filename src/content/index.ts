import { captureMessage, captureFullPage, buildSnippet, captureSelection } from './capture'
import { getPlatformAdapter, getPlatformName } from './platforms'
import { initTooltipListener, removeTooltip } from './tooltip'
import type { Snippet } from '../lib/types'
import './styles.css'

const platformName = getPlatformName()
const BRAND_NAME = '可记'

// ── 注入保存按钮 ──────────────────────────────────────

function injectSaveButton(el: Element) {
  if (el.querySelector('.keji-btn-container')) return

  const container = document.createElement('div')
  container.className = 'keji-btn-container'

  const btn = document.createElement('button')
  btn.className = 'keji-btn'
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
    <span>保存到 ${BRAND_NAME}</span>
  `

  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const content = captureMessage(el)
    const adapter = getPlatformAdapter()
    const question = adapter ? adapter.findUserQuestion(el) : '未识别用户问题'

    const snippet = buildSnippet(question, content.text, content.html, content.media)

    // 检查是否处于收集模式
    const { collectionModeActive } = await chrome.storage.local.get(
      'collectionModeActive'
    )

    chrome.runtime.sendMessage({
      type: collectionModeActive ? 'ADD_TO_COLLECTION' : 'SAVE_SNIPPET',
      payload: snippet,
    })

    const label = btn.querySelector('span')
    if (label) {
      label.textContent = collectionModeActive ? '✓ 已加入' : '✓ 已保存!'
    }
    btn.classList.add('keji-btn--saved')
    setTimeout(() => {
      if (label) label.textContent = `保存到 ${BRAND_NAME}`
      btn.classList.remove('keji-btn--saved')
    }, 2000)
  })

  container.appendChild(btn)
  el.appendChild(container)
}

// ── MutationObserver 自动注入 ──────────────────────────

function observeAndInject(selector: string) {
  const inject = () => {
    document.querySelectorAll(selector).forEach(injectSaveButton)
  }
  new MutationObserver(inject).observe(document.body, {
    childList: true,
    subtree: true,
  })
  inject()
}

// ── 消息处理 ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CAPTURE_PAGE') return

  const requestId = message.requestId

  if (message.mode === 'selection') {
    const capture = captureSelection()
    if (!capture?.text) {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_RESULT',
        error: '未检测到选中内容',
        requestId,
      })
      return
    }
    chrome.runtime.sendMessage({
      type: 'CAPTURE_RESULT',
      requestId,
      payload: buildSnippet(
        '网页划词保存',
        capture.text,
        capture.html,
        capture.media
      ),
    })
    return
  }

  // 整页捕获
  const snippet = captureFullPage()
  if (!snippet) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_RESULT',
      error: '未找到可保存的内容',
      requestId,
    })
    return
  }

  chrome.runtime.sendMessage({
    type: 'CAPTURE_RESULT',
    requestId,
    payload: snippet,
  })
})

// ── 初始化 ──────────────────────────────────────────

console.log(`[keji] Running on ${platformName}`)

// 注入划词 tooltip
initTooltipListener()

// 根据平台注入保存按钮
const adapter = getPlatformAdapter()
if (adapter) {
  const selectors: Record<string, string> = {
    ChatGPT: 'div[data-message-author-role="assistant"]',
    Claude: '.font-claude-message',
    Gemini: 'message-content',
    Grok: '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"], [data-testid="assistant-message"], [data-testid="chat-message"][data-author="assistant"]',
  }
  const selector = selectors[platformName]
  if (selector) {
    observeAndInject(selector)
  }
}
