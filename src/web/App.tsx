import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { storage } from '../lib/storage'
import { createSupabaseClient, mapUser } from '../lib/supabase'
import type { Snippet } from '../lib/types'
import { formatDate } from '../lib/utils'
import { sanitizeHtml } from '../lib/sanitize'
import { Button } from '../sidepanel/components/ui/button'
import { Input } from '../sidepanel/components/ui/input'
import { Textarea } from '../sidepanel/components/ui/textarea'
import { RichTextEditor } from '../sidepanel/components/RichTextEditor'
import NoteAIPanel from '../sidepanel/components/NoteAIPanel'
import {
  Search, FolderOpen, Star, Trash2, ExternalLink, Copy,
  Pencil, X, Save, FileText, Plus, ChevronDown, ChevronRight,
  FolderPlus, MoreHorizontal, Sun, Moon, Network,
} from 'lucide-react'
import { useTheme } from '../lib/useTheme'

export default function WebApp() {
  const { theme, toggleTheme } = useTheme()
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [moveTarget, setMoveTarget] = useState<{ snippetId: string; folder: string | null } | null>(null)
  const supabaseRef = useRef(createSupabaseClient())

  // 初始化：加载数据 + 读取 URL 参数
  useEffect(() => {
    const load = async () => {
      const [s, f, af] = await Promise.all([
        storage.getSnippets(),
        storage.getFolders(),
        storage.getActiveFolder(),
      ])
      setSnippets(s)
      setFolders(f)
      setActiveFolder(af)

      // 从 URL 读取 ?snippet=ID
      const params = new URLSearchParams(window.location.search)
      const snippetId = params.get('snippet')
      if (snippetId) {
        setSelectedId(snippetId)
        setHighlightId(snippetId)
        setTimeout(() => setHighlightId(null), 2500)
      } else if (s.length > 0) {
        setSelectedId(s[0].id)
      }
    }
    load()

    const { data } = supabaseRef.current.auth.onAuthStateChange(() => {})
    return () => data.subscription.unsubscribe()
  }, [])

  // 监听 storage 变化
  useEffect(() => {
    const listener = (changes: any) => {
      if (changes.snippets) setSnippets(changes.snippets.newValue || [])
      if (changes.folders) setFolders(changes.folders.newValue || [])
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const filtered = useMemo(() => {
    let result = snippets
    if (activeFolder) result = result.filter((s) => s.folder === activeFolder)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.question.toLowerCase().includes(q) ||
          s.answer.toLowerCase().includes(q)
      )
    }
    return result
  }, [snippets, activeFolder, searchQuery])

  const selected = useMemo(
    () => snippets.find((s) => s.id === selectedId) || null,
    [snippets, selectedId]
  )

  const handleDelete = async (id: string) => {
    await storage.deleteSnippet(id)
    if (selectedId === id) setSelectedId(null)
    showToast('已删除')
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    await storage.addFolder(name)
    setActiveFolder(name)
    setNewFolderName('')
    setShowNewFolder(false)
    showToast(`已创建「${name}」`)
  }

  const handleMoveToFolder = async (snippetId: string, folder: string | null) => {
    await storage.updateSnippet(snippetId, { folder: folder || undefined })
    setMoveTarget(null)
    showToast(folder ? `已移动到「${folder}」` : '已移出文件夹')
  }

  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`确定删除「${folderName}」？该文件夹下的笔记也会被删除。`)) return
    await storage.deleteFolder(folderName)
    if (activeFolder === folderName) setActiveFolder('')
    showToast(`已删除「${folderName}」`)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#bbf7d0_0%,_#ecfdf5_35%,_#f8fafc_70%)] dark:bg-[radial-gradient(circle_at_top,_#064e3b_0%,_#0f172a_35%,_#0f172a_70%)] text-slate-900 dark:text-slate-100">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-full bg-emerald-600 text-white text-xs px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-7xl p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img src="app-icon.svg" alt="keji" className="w-14 h-14 rounded-2xl shadow-sm ring-1 ring-emerald-200/60 dark:ring-emerald-700/60 object-cover" />
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-400">keji Web</div>
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">可记空间</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">本地存储 · 可离线访问</div>
            <button
              onClick={() => {
                // 尝试用 obsidian:// URI 打开
                window.location.href = 'obsidian://open'
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors border border-slate-200 dark:border-slate-700"
              title="打开 Obsidian（查看图谱等高级功能）"
            >
              <ExternalLink className="h-4 w-4" />
              Obsidian
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到深色模式'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
          {/* 侧边栏 */}
          <aside className="bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl border border-white/70 dark:border-slate-700/70 shadow-xl p-4 flex flex-col min-h-[70vh]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white mb-4">
              <Search className="w-4 h-4" />
              <input
                className="bg-transparent text-sm outline-none placeholder:text-white/60 flex-1"
                placeholder="搜索标题、问题或内容"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <FolderList
              folders={folders}
              activeFolder={activeFolder}
              snippets={snippets}
              onFolderChange={setActiveFolder}
              onCreateFolder={() => setShowNewFolder(true)}
              onDeleteFolder={handleDeleteFolder}
              showNewFolder={showNewFolder}
              newFolderName={newFolderName}
              onNewFolderNameChange={setNewFolderName}
              onCreateFolderConfirm={handleCreateFolder}
              onCancelNewFolder={() => { setShowNewFolder(false); setNewFolderName('') }}
            />

            <div className="space-y-2 overflow-y-auto pr-1 mt-2 flex-1">
              {filtered.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无笔记</div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                    selectedId === s.id
                      ? 'bg-slate-900 dark:bg-emerald-700 text-white border-slate-900 dark:border-emerald-700 shadow-lg'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                  } ${highlightId === s.id ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="font-semibold text-sm line-clamp-2">{s.title}</div>
                  <div className="text-xs mt-2 line-clamp-2 opacity-80">Q: {s.question}</div>
                  <div className="flex items-center gap-2 mt-3 text-[10px] opacity-70">
                    {s.folder && (
                      <span className="inline-flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" /> {s.folder}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* 主内容区 */}
          <section className="bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-2xl border border-white/70 dark:border-slate-700/70 shadow-2xl p-6 min-h-[70vh]">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                请选择左侧的笔记查看
              </div>
            ) : (
              <NoteDetail
                key={selected.id}
                snippet={selected}
                onDelete={handleDelete}
                onUpdate={async (id, changes) => {
                  await storage.updateSnippet(id, changes)
                  showToast('已保存')
                }}
                showToast={showToast}
                folders={folders}
              />
            )}
          </section>
        </div>
      </div>

    </div>
  )
}

// ── 文件夹列表 ──────────────────────────────────────

function FolderList({
  folders, activeFolder, snippets, onFolderChange,
  onCreateFolder, onDeleteFolder,
  showNewFolder, newFolderName, onNewFolderNameChange, onCreateFolderConfirm, onCancelNewFolder,
}: {
  folders: string[]
  activeFolder: string
  snippets: Snippet[]
  onFolderChange: (f: string) => void
  onCreateFolder: () => void
  onDeleteFolder: (name: string) => void
  showNewFolder: boolean
  newFolderName: string
  onNewFolderNameChange: (v: string) => void
  onCreateFolderConfirm: () => void
  onCancelNewFolder: () => void
}) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">笔记本目录</div>
        <button
          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline"
          onClick={onCreateFolder}
        >
          + 新建
        </button>
      </div>

      {/* 新建文件夹输入框 */}
      {showNewFolder && (
        <div className="flex gap-1 mb-2">
          <input
            className="flex-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs"
            placeholder="文件夹名称..."
            value={newFolderName}
            onChange={(e) => onNewFolderNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreateFolderConfirm()}
            autoFocus
          />
          <button className="px-2 py-1 rounded text-xs bg-emerald-600 text-white" onClick={onCreateFolderConfirm}>
            确定
          </button>
          <button className="px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={onCancelNewFolder}>
            取消
          </button>
        </div>
      )}

      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        <button
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
            !activeFolder ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
          onClick={() => onFolderChange('')}
        >
          <span className="font-medium">全部笔记</span>
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{snippets.length}</span>
        </button>
        {folders.map((f) => (
          <div key={f} className="group flex items-center">
            <button
              className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left ${
                activeFolder === f ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              onClick={() => onFolderChange(f)}
            >
              <FolderOpen className="w-3 h-3 shrink-0" />
              <span className="truncate">{f}</span>
              <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                {snippets.filter((s) => s.folder === f).length}
              </span>
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-opacity"
              title="删除文件夹"
              onClick={() => onDeleteFolder(f)}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 笔记详情 + 编辑 ──────────────────────────────────

function NoteDetail({
  snippet, onDelete, onUpdate, showToast, folders = [],
}: {
  snippet: Snippet
  onDelete: (id: string) => void
  onUpdate: (id: string, changes: Partial<Snippet>) => Promise<void>
  showToast: (msg: string) => void
  folders?: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(snippet.title)
  const [editAnswer, setEditAnswer] = useState(snippet.answer)
  const [editHtml, setEditHtml] = useState(snippet.contentHtml || '')
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.answer)
      showToast('已复制')
    } catch {
      showToast('复制失败')
    }
  }

  const handleSave = async () => {
    await onUpdate(snippet.id, {
      title: editTitle.trim() || '未命名笔记',
      answer: editAnswer,
      contentHtml: editHtml,
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setEditTitle(snippet.title)
    setEditAnswer(snippet.answer)
    setEditHtml(snippet.contentHtml || '')
    setEditing(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏：标题 + 操作按钮 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
            {snippet.source}
          </div>
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-2xl font-semibold mt-2"
            />
          ) : (
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
              {snippet.title}
            </h2>
          )}
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            保存于 {formatDate(snippet.timestamp)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                className="px-3 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300"
                onClick={handleCancel}
              >
                <X className="w-3 h-3 inline-block mr-1" /> 取消
              </button>
              <button
                className="px-3 py-1 rounded-full text-xs border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleSave}
              >
                <Save className="w-3 h-3 inline-block mr-1" /> 保存
              </button>
            </>
          ) : (
            <>
              {snippet.url && (
                <button
                  className="px-3 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300"
                  onClick={() => window.open(snippet.url)}
                >
                  <ExternalLink className="w-3 h-3 inline-block mr-1" /> 原网页
                </button>
              )}
              <button
                className="px-3 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300"
                onClick={handleCopy}
              >
                <Copy className="w-3 h-3 inline-block mr-1" /> 复制文本
              </button>
              <button
                className="px-3 py-1 rounded-full text-xs border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 dark:hover:border-emerald-500"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-3 h-3 inline-block mr-1" /> 编辑
              </button>
              <button
                className="px-3 py-1 rounded-full text-xs border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:border-red-400 dark:hover:border-red-600"
                onClick={() => onDelete(snippet.id)}
              >
                <Trash2 className="w-3 h-3 inline-block mr-1" /> 删除
              </button>
            </>
          )}
        </div>
      </div>

      {/* 标签 + 移动到文件夹 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        {/* 当前文件夹 */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            onClick={() => setShowMoveMenu(!showMoveMenu)}
          >
            <FolderOpen className="w-3 h-3" />
            {snippet.folder || '未归类'}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showMoveMenu && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg z-10 py-1">
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                onClick={() => { onUpdate(snippet.id, { folder: undefined }); setShowMoveMenu(false) }}
              >
                未归类
              </button>
              {folders.map((f) => (
                <button
                  key={f}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${
                    snippet.folder === f ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                  }`}
                  onClick={() => { onUpdate(snippet.id, { folder: f }); setShowMoveMenu(false) }}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
        {snippet.tags?.map((t) => (
          <span key={t} className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
            #{t}
          </span>
        ))}
      </div>

      {/* 内容区 */}
      <div className="mt-6 flex-1">
        {editing ? (
          <RichTextEditor
            initialHtml={snippet.contentHtml || formatAnswer(snippet.answer)}
            minHeightClassName="min-h-[480px]"
            toolbarStickyTopClassName="top-16"
            onChange={({ html, text }) => {
              setEditHtml(html)
              setEditAnswer(text)
            }}
          />
        ) : (
          <article
            className="keji-rich min-h-[480px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-5 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: snippet.contentHtml
                ? sanitizeHtml(snippet.contentHtml)
                : formatAnswer(snippet.answer),
            }}
          />
        )}
      </div>
      {/* 笔记 AI：思维导图 + 追问 */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <NoteAIPanel
          snippet={snippet}
          onUpdated={() => {
            /* storage.onChanged 会驱动列表刷新 */
          }}
          showToast={(_type, message) => showToast(message)}
        />
      </div>
    </div>
  )
}

/** 简单 Markdown → HTML */
function formatAnswer(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}
