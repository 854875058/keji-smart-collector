import React, { useState, useEffect, useCallback } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Inbox, Trash2, Save, Layers, FileText, X, ExternalLink,
} from 'lucide-react'
import { formatDate } from '../../lib/utils'

interface Props {
  showToast: (type: 'success' | 'error', message: string) => void
}

export function CollectionMode({ showToast }: Props) {
  const [items, setItems] = useState<Snippet[]>([])
  const [modeActive, setModeActive] = useState(false)
  const [mergeTitle, setMergeTitle] = useState('')
  const [showMergeInput, setShowMergeInput] = useState(false)

  // 加载收集箱数据
  const loadItems = useCallback(async () => {
    const [its, active] = await Promise.all([
      storage.getCollectionItems(),
      storage.getCollectionModeActive(),
    ])
    setItems(its)
    setModeActive(active)
  }, [])

  useEffect(() => {
    loadItems()

    // 监听 pendingCollectionItem 变化，自动加入列表
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.pendingCollectionItem && changes.pendingCollectionItem.newValue) {
        const newItem = changes.pendingCollectionItem.newValue as Snippet
        storage.addCollectionItem(newItem).then(() => {
          storage.setPendingCollectionItem(null)
          loadItems()
        })
      }
      if (changes.collectionItems) {
        setItems(changes.collectionItems.newValue || [])
      }
      if (changes.collectionModeActive) {
        setModeActive(!!changes.collectionModeActive.newValue)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [loadItems])

  // 切换收集模式
  const toggleMode = async () => {
    const next = !modeActive
    await storage.setCollectionModeActive(next)
    setModeActive(next)
    showToast('success', next ? '收集模式已开启' : '收集模式已关闭')
  }

  // 删除单条
  const removeItem = async (id: string) => {
    await storage.removeCollectionItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  // 清空收集箱
  const clearAll = async () => {
    await storage.clearCollectionItems()
    setItems([])
    showToast('success', '收集箱已清空')
  }

  // 逐条保存
  const saveIndividually = async () => {
    if (items.length === 0) return
    for (const item of items) {
      await storage.saveSnippet(item)
    }
    await storage.clearCollectionItems()
    setItems([])
    showToast('success', `已保存 ${items.length} 条笔记`)
  }

  // 合并保存
  const saveMerged = async () => {
    if (items.length === 0) return
    const title = mergeTitle.trim() || `收集箱合并 - ${new Date().toLocaleDateString('zh-CN')}`
    const mergedAnswer = items
      .map((item, idx) => `### 来源 ${idx + 1}: ${item.title}\n\n${item.answer}`)
      .join('\n\n---\n\n')
    const mergedQuestion = items.map((item) => item.question).join(' | ')
    const sources = [...new Set(items.map((item) => item.source))].join(', ')

    const merged: Snippet = {
      id: `merged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      question: mergedQuestion,
      answer: mergedAnswer,
      source: sources,
      timestamp: new Date().toISOString(),
      url: '',
      tags: ['收集箱合并'],
    }

    await storage.saveSnippet(merged)
    await storage.clearCollectionItems()
    setItems([])
    setShowMergeInput(false)
    setMergeTitle('')
    showToast('success', '已合并保存为一条笔记')
  }

  // 从收集箱逐条保存到指定文件夹
  const saveItemAsSnippet = async (item: Snippet) => {
    await storage.saveSnippet(item)
    await storage.removeCollectionItem(item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    showToast('success', '已保存')
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部控制栏 */}
      <div className="p-3 border-b border-slate-200 bg-white space-y-3">
        {/* 收集模式开关 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-900">收集箱模式</span>
          </div>
          <button
            onClick={toggleMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              modeActive ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                modeActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {modeActive && (
          <p className="text-xs text-slate-500">
            收集模式已开启，在 AI 页面划词或点击保存按钮时，内容将存入收集箱而非直接保存。
          </p>
        )}

        {/* 操作按钮 */}
        {items.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" onClick={saveIndividually}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              逐条保存 ({items.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMergeInput(!showMergeInput)}
            >
              <Layers className="h-3.5 w-3.5 mr-1" />
              合并保存
            </Button>
            <Button size="sm" variant="destructive" onClick={clearAll}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              清空
            </Button>
          </div>
        )}

        {/* 合并标题输入 */}
        {showMergeInput && (
          <div className="flex gap-2">
            <Input
              placeholder="输入合并笔记标题（可选）"
              value={mergeTitle}
              onChange={(e) => setMergeTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveMerged()}
              className="flex-1"
            />
            <Button size="sm" onClick={saveMerged}>
              <Save className="h-3.5 w-3.5 mr-1" />
              确认
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowMergeInput(false); setMergeTitle('') }}
            >
              取消
            </Button>
          </div>
        )}
      </div>

      {/* 收集列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>收集箱为空</p>
            <p className="text-xs mt-1">开启收集模式后，在 AI 页面保存的内容将进入此处</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">
                      {idx + 1}
                    </span>
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {item.title}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 truncate pl-7">
                    Q: {item.question}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                  title="移除"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="text-xs text-slate-600 mt-2 line-clamp-2 pl-7">
                {item.answer.slice(0, 120)}
              </div>

              <div className="flex items-center justify-between mt-3 pl-7">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{item.source}</span>
                  <span>{formatDate(item.timestamp)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => saveItemAsSnippet(item)}
                    className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600"
                    title="单独保存此条"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  {item.url && (
                    <button
                      onClick={() => window.open(item.url)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400"
                      title="打开原网页"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
