import React, { useState, useMemo, useEffect } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import {
  Search, Star, Trash2, ExternalLink, Copy, FolderOpen,
  ArrowLeft, Pencil, Save, X,
} from 'lucide-react'
import { formatDate } from '../../lib/utils'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => snippets.find((s) => s.id === selectedId) || null,
    [snippets, selectedId]
  )

  // 如果选中的笔记被删除，返回列表
  useEffect(() => {
    if (selectedId && !snippets.find((s) => s.id === selectedId)) {
      setSelectedId(null)
    }
  }, [snippets, selectedId])

  if (selected) {
    return (
      <NoteDetail
        snippet={selected}
        onBack={() => setSelectedId(null)}
        onDelete={onDelete}
        onToggleFavourite={onToggleFavourite}
        showToast={showToast}
      />
    )
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
              className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors cursor-pointer"
              onClick={() => setSelectedId(snippet.id)}
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
                <div className="text-[10px] text-slate-400">
                  {formatDate(snippet.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── 笔记详情页 ──────────────────────────────────────

function NoteDetail({
  snippet,
  onBack,
  onDelete,
  onToggleFavourite,
  showToast,
}: {
  snippet: Snippet
  onBack: () => void
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(snippet.title)
  const [editAnswer, setEditAnswer] = useState(snippet.answer)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.answer)
      showToast('success', '已复制')
    } catch {
      showToast('error', '复制失败')
    }
  }

  const handleSave = async () => {
    await storage.updateSnippet(snippet.id, {
      title: editTitle.trim() || '未命名笔记',
      answer: editAnswer,
    })
    setEditing(false)
    showToast('success', '已保存')
  }

  const handleCancel = () => {
    setEditTitle(snippet.title)
    setEditAnswer(snippet.answer)
    setEditing(false)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400">{snippet.source}</div>
        </div>
        <button
          onClick={() => onToggleFavourite(snippet.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100"
        >
          <Star
            className={`h-4 w-4 ${
              snippet.isFavourite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
            }`}
          />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 标题 */}
        {editing ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="text-lg font-semibold"
          />
        ) : (
          <h2 className="text-lg font-semibold text-slate-900">{snippet.title}</h2>
        )}

        {/* 元信息 */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{formatDate(snippet.timestamp)}</span>
          {snippet.folder && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 bg-slate-100 rounded-full">
              <FolderOpen className="h-3 w-3" />
              {snippet.folder}
            </span>
          )}
          {snippet.tags?.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
              #{t}
            </span>
          ))}
        </div>

        {/* 问题 */}
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">问题</div>
          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
            {snippet.question}
          </div>
        </div>

        {/* 回答 */}
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">回答</div>
          {editing ? (
            <Textarea
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              className="min-h-[300px] text-sm"
            />
          ) : (
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {snippet.answer}
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="border-t border-slate-200 px-3 py-2 flex gap-2">
        {editing ? (
          <>
            <Button variant="outline" size="sm" className="flex-1" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" />
              取消
            </Button>
            <Button size="sm" className="flex-1" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              保存
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              编辑
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              复制
            </Button>
            {snippet.url && (
              <Button variant="outline" size="sm" onClick={() => window.open(snippet.url)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                原文
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50 ml-auto"
              onClick={() => { onDelete(snippet.id); onBack() }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
