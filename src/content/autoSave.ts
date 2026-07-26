import type { Snippet } from '../lib/types'
import { captureFullPage, conversationKeyOf } from './capture'
import { getPlatformAdapter, getPlatformName } from './platforms'

/**
 * 对话自动保存。
 *
 * 逐个对话开关、默认关闭；开启后每轮问答结束就把整段对话增量写回同一条笔记。
 *
 * 「回答结束」无法直接检测——流式输出期间 DOM 持续变动，且各平台没有统一的
 * 完成标记。这里用静默期判定：回答区域停止变动 SETTLE_MS 后才认为写完。
 * 固定延时做不到这点，长回答会被截断在中途。
 */

/** 回答区域停止变动多久算写完 */
const SETTLE_MS = 1500
/** 两次自动保存的最小间隔，避免流式抖动导致频繁写盘 */
const MIN_INTERVAL_MS = 3000
/** 开关状态的存储键：记录已开启自动保存的 conversationKey */
const ENABLED_KEYS = 'autoSaveConversations'

let enabled = false
let observer: MutationObserver | null = null
let settleTimer: number | null = null
let lastSaveAt = 0
let lastTurnCount = 0
let lastFingerprint = ''
let saving = false
let toggleEl: HTMLElement | null = null
let labelEl: HTMLElement | null = null
let dotEl: HTMLElement | null = null

const conversationKey = () => conversationKeyOf()

/** 读取该对话是否已开启自动保存 */
async function loadEnabled(key: string): Promise<boolean> {
  try {
    const data = await chrome.storage.local.get(ENABLED_KEYS)
    const keys = (data?.[ENABLED_KEYS] || []) as string[]
    return keys.includes(key)
  } catch {
    return false
  }
}

/** 持久化该对话的开关状态 */
async function persistEnabled(key: string, on: boolean): Promise<void> {
  try {
    const data = await chrome.storage.local.get(ENABLED_KEYS)
    const keys = new Set((data?.[ENABLED_KEYS] || []) as string[])
    if (on) keys.add(key)
    else keys.delete(key)
    await chrome.storage.local.set({ [ENABLED_KEYS]: Array.from(keys) })
  } catch {
    // 存不下开关状态不影响本次会话内的自动保存
  }
}

/** 当前已保存的轮次，用于开关上的计数显示 */
async function loadSavedTurnCount(key: string): Promise<number> {
  try {
    const { snippets } = await chrome.storage.local.get('snippets')
    const existing = ((snippets || []) as Snippet[]).find(
      (s) => s.conversation?.conversationKey === key
    )
    return existing?.conversation?.turnCount ?? 0
  } catch {
    return 0
  }
}

function renderToggle() {
  if (!toggleEl || !labelEl || !dotEl) return
  toggleEl.classList.toggle('keji-autosave--on', enabled)
  dotEl.classList.toggle('keji-autosave__dot--on', enabled)
  labelEl.textContent =
    enabled && lastTurnCount > 0 ? `自动保存 · ${lastTurnCount} 轮` : '自动保存'
  toggleEl.title = enabled
    ? '已开启：每轮问答结束后自动更新这条笔记。点击关闭。'
    : '点击开启：此后每轮问答结束都会自动保存整段对话'
}

/**
 * 执行一次增量保存。
 *
 * 始终发 UPDATE_CONVERSATION 覆盖同一条笔记，而不是新增——自动保存
 * 每轮都触发，新增会迅速堆出大量高度重复的笔记。background 侧的
 * UPDATE_CONVERSATION 只覆盖正文与轮次，保留标题、文件夹、标签和 AI 产物。
 */
async function runSave(): Promise<void> {
  if (!enabled || saving) return

  const now = Date.now()
  if (now - lastSaveAt < MIN_INTERVAL_MS) return

  const snippet = captureFullPage()
  if (!snippet) return

  const key = snippet.conversation?.conversationKey
  if (!key) return

  const turns = snippet.conversation?.turnCount ?? 0
  // 轮次相同时仍可能是同一轮回答续写完成，改用内容指纹判重：
  // 只看轮次会把「最后一段补完」的那次保存漏掉，存下写到一半的回答。
  const fingerprint = `${turns}:${snippet.answer?.length ?? 0}`
  if (fingerprint === lastFingerprint) return

  saving = true
  try {
    const { snippets } = await chrome.storage.local.get('snippets')
    const existing = ((snippets || []) as Snippet[]).find(
      (s) => s.conversation?.conversationKey === key
    )

    if (existing) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONVERSATION',
        id: existing.id,
        payload: snippet,
        silent: true,
      })
    } else {
      chrome.runtime.sendMessage({
        type: 'SAVE_SNIPPET',
        payload: snippet,
        silent: true,
      })
    }

    lastSaveAt = Date.now()
    lastTurnCount = turns
    lastFingerprint = fingerprint
    renderToggle()
  } catch {
    // 静默：自动保存不打扰，失败下一轮会再试
  } finally {
    saving = false
  }
}

/** 回答区域变动 → 重置静默计时器，静默期满才落盘 */
function scheduleSave() {
  if (!enabled) return
  if (settleTimer !== null) window.clearTimeout(settleTimer)
  settleTimer = window.setTimeout(() => {
    settleTimer = null
    void runSave()
  }, SETTLE_MS)
}

/** 变动是否只发生在我们自己注入的 UI 内——那不该触发保存 */
function isOwnMutation(m: MutationRecord): boolean {
  const node = m.target.nodeType === Node.TEXT_NODE ? m.target.parentElement : m.target
  return !!(node as Element | null)?.closest?.(
    '.keji-autosave, .keji-btn-container, .keji-tooltip, .keji-toast'
  )
}

function startObserving() {
  if (observer) return
  observer = new MutationObserver((records) => {
    // 忽略自身 UI 的变动，否则 renderToggle 改文本会自激触发下一次保存
    if (records.every(isOwnMutation)) return
    scheduleSave()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function stopObserving() {
  observer?.disconnect()
  observer = null
  if (settleTimer !== null) {
    window.clearTimeout(settleTimer)
    settleTimer = null
  }
}

async function setEnabled(on: boolean): Promise<void> {
  enabled = on
  const key = conversationKey()
  await persistEnabled(key, on)

  if (on) {
    lastTurnCount = await loadSavedTurnCount(key)
    lastFingerprint = ''
    renderToggle()
    startObserving()
    // 开启即存一次当前进度，不必等下一轮
    lastSaveAt = 0
    await runSave()
  } else {
    stopObserving()
    renderToggle()
  }
}

/** 注入右下角开关 */
function injectToggle() {
  if (document.querySelector('.keji-autosave')) return

  const el = document.createElement('div')
  el.className = 'keji-autosave'
  el.setAttribute('role', 'button')
  el.setAttribute('tabindex', '0')

  const dot = document.createElement('span')
  dot.className = 'keji-autosave__dot'

  const label = document.createElement('span')
  label.className = 'keji-autosave__label'

  el.appendChild(dot)
  el.appendChild(label)

  toggleEl = el
  labelEl = label
  dotEl = dot

  const toggle = () => {
    void setEnabled(!enabled)
  }
  el.addEventListener('click', toggle)
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  })

  document.body.appendChild(el)
  renderToggle()
}

/**
 * 初始化自动保存。仅在识别出 AI 平台的顶层 frame 生效。
 *
 * 单页应用切换对话不会重新加载脚本，所以这里轮询 URL 变化，
 * 切到另一个对话时按新 conversationKey 重新判定开关状态。
 */
export function initAutoSave(): void {
  if (window.top !== window) return
  if (!getPlatformAdapter()) return
  if (getPlatformName() === 'Web') return

  injectToggle()

  let currentKey = conversationKey()
  const applyKey = async (key: string) => {
    stopObserving()
    enabled = await loadEnabled(key)
    lastTurnCount = enabled ? await loadSavedTurnCount(key) : 0
    lastSaveAt = 0
    renderToggle()
    if (enabled) startObserving()
  }
  void applyKey(currentKey)

  window.setInterval(() => {
    const key = conversationKey()
    if (key === currentKey) return
    currentKey = key
    void applyKey(key)
  }, 1000)
}
