import type { Snippet } from '../lib/types'

// 打开侧边栏
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error(e))

/**
 * 写入并检查结果。
 *
 * chrome.storage.local.set 超出配额时不会抛错，只把错误挂在
 * chrome.runtime.lastError 上——调用方会以为已经存上了。这里显式检查，
 * 把失败写进 captureResult，让侧边栏能提示出来。
 *
 * 注意：不能复用 lib/storage.ts 的 setChecked，那边是 Promise 风格，
 * 而这里的调用都在 chrome.storage.local.get 的回调里，需要回调风格。
 */
function setChecked(items: Record<string, unknown>, onError?: (msg: string) => void) {
  chrome.storage.local.set(items, () => {
    const err = chrome.runtime.lastError
    if (!err) return
    const message = /quota/i.test(err.message || '')
      ? '本地存储空间已满，保存失败。请先删除部分笔记。'
      : `保存失败：${err.message || '未知错误'}`
    console.error('[keji]', message)
    if (onError) onError(message)
    else chrome.storage.local.set({ captureResult: { error: message } })
  })
}

// 请求去重 Map
const pendingRequests = new Map<string, boolean>()

// 右键菜单点击目标映射 (requestId -> menuItemId)
const menuIdTargetMap = new Map<string, string>()

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 父级菜单
  chrome.contextMenus.create({
    id: 'keji-parent',
    title: '可记智能收藏',
    contexts: ['page', 'selection'],
  })
  // 子菜单：保存到可记
  chrome.contextMenus.create({
    id: 'keji-save',
    parentId: 'keji-parent',
    title: '保存到可记',
    contexts: ['page', 'selection'],
  })
  // 子菜单：保存到收集箱
  chrome.contextMenus.create({
    id: 'keji-save-inbox',
    parentId: 'keji-parent',
    title: '保存到收集箱',
    contexts: ['page', 'selection'],
  })
  // 子菜单：保存整个对话（无论是否有选中文本，都抓整段对话）
  chrome.contextMenus.create({
    id: 'keji-save-conversation',
    parentId: 'keji-parent',
    title: '保存整个对话',
    contexts: ['page', 'selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return
  const menuId = info.menuItemId as string

  // 「保存整个对话」交给 content script 自行处理（含同会话去重询问）
  if (menuId === 'keji-save-conversation') {
    chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CONVERSATION' }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.set({
          captureResult: { error: '无法读取当前页面内容' },
        })
      }
    })
    return
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  pendingRequests.set(requestId, false)

  // 将目标存储到 requestId 映射，以便 CAPTURE_RESULT 时区分
  menuIdTargetMap.set(requestId, menuId)

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'CAPTURE_PAGE',
      mode: info.selectionText ? 'selection' : 'page',
      requestId,
    } as const,
    { frameId: info.frameId },
    () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.set({
          captureResult: { error: '无法读取当前页面内容' },
        })
        menuIdTargetMap.delete(requestId)
      }
    }
  )
})

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 保存笔记
  if (message.type === 'SAVE_SNIPPET') {
    chrome.storage.local.get(['snippets', 'activeFolder'], (data) => {
      const snippets: Snippet[] = data.snippets || []
      const activeFolder: string = data.activeFolder || ''
      const snippet = message.payload as Snippet
      const withFolder =
        !snippet.folder && activeFolder
          ? { ...snippet, folder: activeFolder }
          : snippet
      setChecked({
        snippets: [withFolder, ...snippets],
        saveResult: { success: true, snippet: withFolder },
      })
    })
    sendResponse({ status: 'success' })
    return true
  }

  // 加入收集箱
  if (message.type === 'ADD_TO_COLLECTION') {
    setChecked({
      pendingCollectionItem: message.payload,
    })
    sendResponse({ status: 'success' })
    return true
  }

  // 用新抓取的对话覆盖已有笔记（保留标题、文件夹、标签、AI 产物等人工整理结果）
  if (message.type === 'UPDATE_CONVERSATION') {
    const { id, payload } = message as { id: string; payload: Snippet }
    chrome.storage.local.get(['snippets'], (data) => {
      const snippets: Snippet[] = data.snippets || []
      const updated = snippets.map((s) => {
        if (s.id !== id) return s
        return {
          ...s,
          question: payload.question,
          answer: payload.answer,
          contentHtml: payload.contentHtml,
          media: payload.media,
          url: payload.url,
          conversation: payload.conversation,
          timestamp: payload.timestamp,
          cloudStatus: s.cloudStatus === 'synced' ? 'dirty' : s.cloudStatus,
        }
      })
      setChecked({
        snippets: updated,
        saveResult: { success: true, snippet: updated.find((s) => s.id === id) },
      })
    })
    sendResponse({ status: 'success' })
    return true
  }

  // 侧边栏请求：保存当前标签页的整段对话
  if (message.type === 'CAPTURE_CONVERSATION_REQUEST') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: '无法获取当前标签页' })
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CONVERSATION' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: '无法读取当前页面内容，请刷新页面后重试' })
        } else {
          sendResponse({ status: 'started' })
        }
      })
    })
    return true
  }

  // 触发页面捕获
  if (message.type === 'CAPTURE_PAGE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: '无法获取当前标签页' })
        return
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      pendingRequests.set(requestId, false)

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'CAPTURE_PAGE', mode: 'page', requestId },
        () => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: '无法读取当前页面内容' })
          } else {
            sendResponse({ status: 'started' })
          }
        }
      )
    })
    return true
  }

  // 接收捕获结果
  if (message.type === 'CAPTURE_RESULT') {
    const requestId = message.requestId
    if (requestId && pendingRequests.get(requestId)) return
    if (requestId) pendingRequests.set(requestId, true)

    if (message.error) {
      chrome.storage.local.set({
        captureResult: { error: message.error },
      })
      if (requestId) {
        pendingRequests.delete(requestId)
        menuIdTargetMap.delete(requestId)
      }
    } else {
      const targetMenu = requestId ? menuIdTargetMap.get(requestId) : null
      const snippet = message.payload as Snippet

      if (targetMenu === 'keji-save-inbox') {
        // 保存到收集箱
        chrome.storage.local.get(['collectionItems'], (data) => {
          const items: Snippet[] = data.collectionItems || []
          setChecked({
            collectionItems: [...items, snippet],
            captureResult: { success: true, snippet, target: 'inbox' },
          })
        })
      } else {
        // 保存到可记（默认）
        chrome.storage.local.get(['snippets', 'activeFolder'], (data) => {
          const snippets: Snippet[] = data.snippets || []
          const activeFolder: string = data.activeFolder || ''
          const withFolder =
            !snippet.folder && activeFolder
              ? { ...snippet, folder: activeFolder }
              : snippet
          setChecked({
            snippets: [withFolder, ...snippets],
            captureResult: { success: true, snippet: withFolder },
          })
        })
      }

      if (requestId) {
        pendingRequests.delete(requestId)
        menuIdTargetMap.delete(requestId)
      }
    }
  }
})

// ── 快捷键命令处理 ──────────────────────────────────────
chrome.commands?.onCommand?.addListener((command: string) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    if (command === 'save-page') {
      chrome.tabs.sendMessage(tab.id, { type: 'COMMAND_SAVE_PAGE' })
    } else if (command === 'save-selection') {
      chrome.tabs.sendMessage(tab.id, { type: 'COMMAND_SAVE_SELECTION' })
    }
  })
})

console.log('[keji] Background worker active')
