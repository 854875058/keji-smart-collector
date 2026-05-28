import { storage } from '../lib/storage'
import type { Snippet } from '../lib/types'

// 打开侧边栏
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error(e))

// 请求去重 Map
const pendingRequests = new Map<string, boolean>()

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'keji-save',
    title: '使用 可记 保存',
    contexts: ['page', 'selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  pendingRequests.set(requestId, false)

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
      chrome.storage.local.set({
        snippets: [withFolder, ...snippets],
        saveResult: { success: true, snippet: withFolder },
      })
    })
    sendResponse({ status: 'success' })
    return true
  }

  // 加入收集箱
  if (message.type === 'ADD_TO_COLLECTION') {
    chrome.storage.local.set({
      pendingCollectionItem: message.payload,
    })
    sendResponse({ status: 'success' })
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
      if (requestId) pendingRequests.delete(requestId)
    } else {
      chrome.storage.local.get(['snippets', 'activeFolder'], (data) => {
        const snippets: Snippet[] = data.snippets || []
        const activeFolder: string = data.activeFolder || ''
        const snippet = message.payload as Snippet
        const withFolder =
          !snippet.folder && activeFolder
            ? { ...snippet, folder: activeFolder }
            : snippet
        chrome.storage.local.set({
          snippets: [withFolder, ...snippets],
          captureResult: { success: true, snippet: withFolder },
        })
      })
      if (requestId) pendingRequests.delete(requestId)
    }
  }
})

console.log('[keji] Background worker active')
