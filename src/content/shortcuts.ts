// shortcuts.ts - 键盘快捷键处理 (纯 JS，无 import，由 vite 内联到 IIFE)
// 由 index.ts 导入调用

/** 快捷键配置 */
interface ShortcutConfig {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  action: () => void
}

/** 当前平台名称缓存 */
let _platformName = ''

/**
 * 整页捕获回调，由 index.ts 注入。
 *
 * 早先这里是给 background 发 CAPTURE_PAGE，再由 background 转发回 content
 * script——绕了一圈且会丢掉原始 requestId，加上 all_frames 会广播到每个
 * iframe，能否跑通取决于 frame 时序。现在直接在当前 frame 里抓取。
 */
let _capturePage: (() => void) | null = null

/** 从 URL 检测平台 */
function detectPlatformFromUrl(): string {
  const url = window.location.href
  if (url.includes('chatgpt.com')) return 'ChatGPT'
  if (url.includes('claude.ai')) return 'Claude'
  if (url.includes('gemini.google.com')) return 'Gemini'
  if (url.includes('grok.com') || url.includes('x.ai')) return 'Grok'
  return 'Web'
}

/** 获取当前选中文本 */
function getSelectedText(): string {
  const sel = window.getSelection()
  return sel ? sel.toString().trim() : ''
}

/** 获取选中文本的 HTML */
function getSelectedHtml(): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  const div = document.createElement('div')
  div.appendChild(range.cloneContents())
  return div.innerHTML
}

/** 捕获选中内容并保存 */
function captureAndSaveSelection(): void {
  const text = getSelectedText()
  if (!text) {
    showShortcutToast('未检测到选中内容', 'error')
    return
  }

  const html = getSelectedHtml()
  const snippet = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `划词收藏 - ${new Date().toLocaleString('zh-CN')}`,
    question: '快捷键划词保存',
    answer: text,
    contentHtml: html || undefined,
    source: detectPlatformFromUrl(),
    timestamp: new Date().toISOString(),
    url: window.location.href,
    tags: [],
  }

  chrome.runtime.sendMessage({
    type: 'SAVE_SNIPPET',
    payload: snippet,
  })

  showShortcutToast('已保存到可记', 'success')
}

/** 捕获整页并保存 */
function captureAndSavePage(): void {
  if (!_capturePage) {
    showShortcutToast('保存功能未就绪，请刷新页面重试', 'error')
    return
  }
  _capturePage()
}

/** 在页面上显示快捷键操作反馈 */
export function showShortcutToast(message: string, type: 'success' | 'error' | 'info'): void {
  // 移除已有的 toast
  const existing = document.getElementById('keji-shortcut-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'keji-shortcut-toast'
  toast.textContent = message

  const colors: Record<string, string> = {
    success: '#059669',
    error: '#dc2626',
    info: '#2563eb',
  }

  Object.assign(toast.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: colors[type] || colors.info,
    color: '#fff',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease',
    opacity: '1',
  })

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}

/** 快捷键列表 */
const shortcuts: ShortcutConfig[] = [
  {
    // Alt+Shift+S: 保存当前页面
    key: 's',
    altKey: true,
    shiftKey: true,
    action: captureAndSavePage,
  },
  {
    // Alt+Shift+A: 保存选中内容
    key: 'a',
    altKey: true,
    shiftKey: true,
    action: captureAndSaveSelection,
  },
]

/** 匹配快捷键 */
function matchShortcut(event: KeyboardEvent): ShortcutConfig | undefined {
  const key = event.key.toLowerCase()
  return shortcuts.find(
    (s) =>
      s.key === key &&
      !!s.altKey === event.altKey &&
      !!s.shiftKey === event.shiftKey &&
      !!s.ctrlKey === event.ctrlKey &&
      !!s.metaKey === event.metaKey
  )
}

/** 初始化快捷键监听 */
export function initShortcuts(
  platformName?: string,
  capturePage?: () => void
): void {
  _platformName = platformName || detectPlatformFromUrl()
  _capturePage = capturePage || null

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    // 忽略输入框内的快捷键
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    const shortcut = matchShortcut(event)
    if (shortcut) {
      event.preventDefault()
      event.stopPropagation()
      shortcut.action()
    }
  })

  // 监听来自 background 的命令消息。
  // background 的 chrome.commands 处理器只发给顶层，但 all_frames 下
  // 每个 frame 都注册了监听器，这里只在顶层响应，避免重复保存。
  chrome.runtime.onMessage.addListener((message: { type: string }) => {
    if (window.top !== window) return
    if (message.type === 'COMMAND_SAVE_PAGE') {
      captureAndSavePage()
    } else if (message.type === 'COMMAND_SAVE_SELECTION') {
      captureAndSaveSelection()
    }
  })

  console.log('[keji] Shortcuts initialized for', _platformName)
}
