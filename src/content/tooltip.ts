import type { Snippet } from '../lib/types'
import { captureSelection, buildSnippet } from './capture'

let tooltipEl: HTMLDivElement | null = null

/** 移除 tooltip */
export function removeTooltip() {
  if (tooltipEl) {
    tooltipEl.remove()
    tooltipEl = null
  }
}

/** 显示划词 tooltip */
export function showTooltip(
  pageX: number,
  pageY: number,
  selectedText: string,
  selectedHtml: string,
  media: { images: any[]; tables: string[] }
) {
  removeTooltip()

  const div = document.createElement('div')
  div.id = 'keji-tooltip'
  div.className = 'keji-tooltip'
  div.innerHTML = `
    <div class="keji-tooltip-btn" id="keji-quick-save">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h10M4 18h16" />
      </svg>
      <span>直接保存</span>
    </div>
    <div class="keji-tooltip-divider"></div>
    <div class="keji-tooltip-btn" id="keji-quick-collect">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
      <span>加入收集箱</span>
    </div>
  `
  document.body.appendChild(div)
  tooltipEl = div

  // 定位
  const rect = div.getBoundingClientRect()
  const SIDE_PANEL_WIDTH = 420
  const MARGIN = 12
  const maxLeft = Math.max(
    MARGIN,
    window.innerWidth - rect.width - MARGIN - SIDE_PANEL_WIDTH
  )
  const left = Math.min(Math.max(MARGIN, pageX - rect.width / 2), maxLeft)

  let top = pageY - rect.height - 14
  if (top < MARGIN) {
    top = Math.min(window.innerHeight - rect.height - MARGIN, pageY + 18)
    div.dataset.position = 'bottom'
  } else {
    div.dataset.position = 'top'
  }

  div.style.left = `${left + window.scrollX}px`
  div.style.top = `${top + window.scrollY}px`

  // 构建 snippet
  const snippet = buildSnippet('划词选取', selectedText, selectedHtml, media)

  // 保存按钮
  const saveBtn = div.querySelector('#keji-quick-save')
  saveBtn?.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      chrome.runtime.sendMessage({ type: 'SAVE_SNIPPET', payload: snippet }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[keji] 保存失败:', chrome.runtime.lastError.message)
        }
      })
    } catch (err) {
      console.error('[keji] 发送消息失败:', err)
    }
    const label = saveBtn.querySelector('span')
    if (label) label.textContent = '✓ 已保存'
    div.classList.add('keji-tooltip--saved')
    setTimeout(removeTooltip, 1200)
  })

  // 收集箱按钮
  const collectBtn = div.querySelector('#keji-quick-collect')
  collectBtn?.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      chrome.runtime.sendMessage({ type: 'ADD_TO_COLLECTION', payload: snippet }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[keji] 加入收集箱失败:', chrome.runtime.lastError.message)
        }
      })
    } catch (err) {
      console.error('[keji] 发送消息失败:', err)
    }
    const label = collectBtn.querySelector('span')
    if (label) label.textContent = '✓ 已加入'
    div.classList.add('keji-tooltip--saved')
    setTimeout(removeTooltip, 1200)
  })
}

/** 初始化划词监听 */
export function initTooltipListener() {
  // 防止 tooltip 内部操作时触发新的 tooltip
  let isTooltipInteracting = false

  document.addEventListener('mouseup', (e) => {
    // 如果正在操作 tooltip，跳过
    if (isTooltipInteracting) return

    setTimeout(() => {
      // 再次检查
      if (isTooltipInteracting) return

      const capture = captureSelection()
      const text = capture?.text ?? ''
      if (text.length < 5) {
        // 不要立即移除 tooltip（可能正在点击按钮）
        if (!(e.target as Element)?.closest?.('#keji-tooltip')) {
          removeTooltip()
        }
        return
      }
      // 点击 tooltip 内部时不移除
      if ((e.target as Element)?.closest?.('#keji-tooltip')) return
      showTooltip(
        e.pageX,
        e.pageY,
        text,
        capture?.html || '',
        capture?.media || { images: [], tables: [] }
      )
    }, 10)
  })

  document.addEventListener('mousedown', (e) => {
    if ((e.target as Element)?.closest?.('#keji-tooltip')) {
      isTooltipInteracting = true
      setTimeout(() => { isTooltipInteracting = false }, 200)
    } else {
      removeTooltip()
    }
  })
}
