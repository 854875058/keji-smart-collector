import React, { useState, useMemo, useEffect } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Search, Star, Trash2, ExternalLink, Copy, FolderOpen,
} from 'lucide-react'
import { formatDate } from '../../lib/utils'

/** 在新标签页打开 web.html 笔记详情 */
async function openNoteInWebTab(snippetId: string) {
  const webUrl = chrome.runtime.getURL('web.html')
  const targetUrl = `${webUrl}?snippet=${encodeURIComponent(snippetId)}`

  // 如果已有 web.html 标签页，聚焦它并更新 URL
  const tabs = await chrome.tabs.query({ url: `${webUrl}*` })
  const existing = tabs[0]
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: targetUrl })
    return
  }
  // 否则新建标签页
  await chrome.tabs.create({ url: targetUrl })
}

interface Props {
  snippets: Snippet[]
  folders: string[]
  activeFolder: string
  searchQuery: string
  onSearchChange: (q: string) => void
  onFolderChange: (folder: string) => void
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
}

export function SnippetList({
  snippets,
  folders,
  activeFolder,
  searchQuery,
  onSearchChange,
  onFolderChange,
  onDelete,
  onToggleFavourite,
  showToast,
}: Props) {
  const handleCopy = async (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(snippet.answer)
      showToast('success', '已复制')
    } catch {
      showToast('error', '复制失败')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="p-3 border-b border-slate-200 bg-white">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* 文件夹标签 */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-slate-100 bg-white">
        <button
          onClick={() => onFolderChange('')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !activeFolder
              ? 'bg-emerald-100 text-emerald-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          全部
        </button>
        {folders.map((f) => (
          <button
            key={f}
            onClick={() => onFolderChange(f)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFolder === f
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {snippets.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {searchQuery ? '没有找到匹配的笔记' : '暂无笔记，去 AI 页面保存内容吧'}
          </div>
        ) : (
          snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => openNoteInWebTab(snippet.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-900 truncate">
                    {snippet.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 truncate">
                    Q: {snippet.question}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavourite(snippet.id) }}
                  className="shrink-0"
                >
                  <Star
                    className={`h-4 w-4 ${
                      snippet.isFavourite
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              </div>

              <div className="text-xs text-slate-600 mt-2 line-clamp-2">
                {snippet.answer.slice(0, 120)}
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{snippet.source}</span>
                  {snippet.folder && (
                    <span className="flex items-center gap-0.5">
                      <FolderOpen className="h-3 w-3" />
                      {snippet.folder}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => handleCopy(snippet, e)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400"
                    title="复制"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {snippet.url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); window.open(snippet.url) }}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400"
                      title="打开原网页"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(snippet.id) }}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
