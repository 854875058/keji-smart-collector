import {
  captureMessage,
  captureFullPage,
  buildSnippet,
  captureSelection,
} from './capture'
import { getPlatformAdapter, getPlatformName } from './platforms'
import { initTooltipListener, removeTooltip } from './tooltip'
import { initShortcuts, showShortcutToast } from './shortcuts'
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

// ── 整段对话保存 ──────────────────────────────────────

/**
 * 抓取当前页面的整段对话并保存。
 *
 * 若同一会话已收藏过（按 conversationKey 匹配），询问是否覆盖更新，
 * 避免同一个会话聊到不同阶段各存一条高度重复的笔记。
 */
async function saveConversation(): Promise<void> {
  const snippet = captureFullPage()
  if (!snippet) {
    showShortcutToast('未找到可保存的内容', 'error')
    return
  }

  const key = snippet.conversation?.conversationKey
  if (key) {
    const { snippets } = await chrome.storage.local.get('snippets')
    const existing = ((snippets || []) as Snippet[]).find(
      (s) => s.conversation?.conversationKey === key
    )
    if (existing) {
      const prevTurns = existing.conversation?.turnCount ?? 0
      const nextTurns = snippet.conversation?.turnCount ?? 0
      const delta =
        nextTurns > prevTurns
          ? `新增 ${nextTurns - prevTurns} 轮问答`
          : '内容可能无变化'
      const ok = window.confirm(
        `该对话已收藏为《${existing.title}》（${prevTurns} 轮，${delta}）。\n\n确定=更新这条笔记，取消=另存为新笔记。`
      )
      if (ok) {
        chrome.runtime.sendMessage({
          type: 'UPDATE_CONVERSATION',
          id: existing.id,
          payload: snippet,
        })
        showShortcutToast('已更新该对话笔记', 'success')
        return
      }
    }
  }

  const { collectionModeActive } = await chrome.storage.local.get(
    'collectionModeActive'
  )
  chrome.runtime.sendMessage({
    type: collectionModeActive ? 'ADD_TO_COLLECTION' : 'SAVE_SNIPPET',
    payload: snippet,
  })
  showShortcutToast(
    collectionModeActive ? '整段对话已加入收集箱' : '整段对话已保存到可记',
    'success'
  )
}

// ── 消息处理 ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 侧边栏/快捷键请求保存整段对话，只在顶层 frame 响应
  if (message.type === 'CAPTURE_CONVERSATION') {
    if (window.top !== window) return
    saveConversation()
    return
  }

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

  // 整页 / 整段对话捕获
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

try {
  console.log(`[keji] Running on ${platformName}`)

  // 注入划词 tooltip
  initTooltipListener()
  console.log('[keji] Tooltip listener initialized')

  // 初始化键盘快捷键（整页保存直接在本 frame 捕获，不绕 background）
  initShortcuts(platformName, () => {
    saveConversation()
  })
  console.log('[keji] Shortcuts initialized')

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
      console.log('[keji] Save buttons injected for', platformName)
    }
  }
} catch (err) {
  console.error('[keji] Initialization error:', err)
}
