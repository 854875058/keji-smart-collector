import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { storage } from '../lib/storage'
import { createSupabaseClient, mapUser } from '../lib/supabase'
import type { Snippet } from '../lib/types'
import { formatDate } from '../lib/utils'
import { Button } from '../sidepanel/components/ui/button'
import { Input } from '../sidepanel/components/ui/input'
import {
  Search, FolderOpen, Star, Trash2, ExternalLink, Copy,
  CloudUpload, FileText, Pencil, X, ChevronRight, ChevronDown,
} from 'lucide-react'

export default function WebApp() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const supabaseRef = useRef(createSupabaseClient())

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
      if (s.length > 0 && !selectedId) setSelectedId(s[0].id)
    }
    load()

    const { data } = supabaseRef.current.auth.onAuthStateChange((_, session) => {
      setUser(mapUser(session?.user))
    })
    supabaseRef.current.auth.getSession().then(({ data }) => {
      setUser(mapUser(data.session?.user))
    })

    return () => data.subscription.unsubscribe()
  }, [])

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

  const handleCopy = async (s: Snippet) => {
    await navigator.clipboard.writeText(s.answer)
    showToast('已复制')
  }

  const handleDelete = async (id: string) => {
    await storage.deleteSnippet(id)
    if (selectedId === id) setSelectedId(null)
    showToast('已删除')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#bbf7d0_0%,_#ecfdf5_35%,_#f8fafc_70%)] text-slate-900">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-full bg-emerald-600 text-white text-xs px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-7xl p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img src="app-icon.svg" alt="keji" className="w-14 h-14 rounded-2xl shadow-sm ring-1 ring-emerald-200/60 object-cover" />
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-700">keji Web</div>
              <h1 className="text-3xl font-semibold text-slate-900">可记空间</h1>
            </div>
          </div>
          <div className="text-sm text-slate-500">本地存储 · 可离线访问</div>
        </header>

        <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
          {/* 侧边栏 */}
          <aside className="bg-white/80 backdrop-blur rounded-2xl border border-white/70 shadow-xl p-4 flex flex-col min-h-[70vh]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white mb-4">
              <Search className="w-4 h-4" />
              <input
                className="bg-transparent text-sm outline-none placeholder:text-white/60 flex-1"
                placeholder="搜索标题、问题或内容"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* 文件夹列表 */}
            <FolderList
              folders={folders}
              activeFolder={activeFolder}
              snippets={snippets}
              onFolderChange={setActiveFolder}
            />

            {/* 笔记列表 */}
            <div className="space-y-2 overflow-y-auto pr-1 mt-2 flex-1">
              {filtered.length === 0 && (
                <div className="text-sm text-slate-500 py-8 text-center">
                  暂无笔记
                </div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                    selectedId === s.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="font-semibold text-sm line-clamp-2">{s.title}</div>
                  <div className="text-xs mt-2 line-clamp-2 opacity-80">
                    Q: {s.question}
                  </div>
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
          <section className="bg-white/90 backdrop-blur rounded-2xl border border-white/70 shadow-2xl p-6 min-h-[70vh]">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                请选择左侧的笔记查看
              </div>
            ) : (
              <NoteDetail
                snippet={selected}
                onDelete={handleDelete}
                onCopy={handleCopy}
                onUpdate={async (id, changes) => {
                  await storage.updateSnippet(id, changes)
                  showToast('已保存')
                }}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FolderList({
  folders,
  activeFolder,
  snippets,
  onFolderChange,
}: {
  folders: string[]
  activeFolder: string
  snippets: Snippet[]
  onFolderChange: (f: string) => void
}) {
  const favCount = useMemo(() => snippets.filter((s) => s.isFavourite).length, [snippets])
  const unfiledCount = useMemo(() => snippets.filter((s) => !s.folder).length, [snippets])

  return (
    <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
      <button
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
          !activeFolder ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50'
        }`}
        onClick={() => onFolderChange('')}
      >
        <span className="font-medium">全部笔记</span>
        <span className="ml-auto text-[11px] text-slate-400">{snippets.length}</span>
      </button>
      {folders.map((f) => (
        <button
          key={f}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
            activeFolder === f ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50'
          }`}
          onClick={() => onFolderChange(f)}
        >
          <span>{f}</span>
          <span className="ml-auto text-[11px] text-slate-400">
            {snippets.filter((s) => s.folder === f).length}
          </span>
        </button>
      ))}
    </div>
  )
}

function NoteDetail({
  snippet,
  onDelete,
  onCopy,
  onUpdate,
}: {
  snippet: Snippet
  onDelete: (id: string) => void
  onCopy: (s: Snippet) => void
  onUpdate: (id: string, changes: Partial<Snippet>) => Promise<void>
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {snippet.source}
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mt-2">
            {snippet.title}
          </h2>
          <div className="mt-2 text-xs text-slate-500">
            保存于 {formatDate(snippet.timestamp)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {snippet.url && (
            <button
              className="px-3 py-1 rounded-full text-xs border border-slate-200 hover:border-slate-400"
              onClick={() => window.open(snippet.url)}
            >
              <ExternalLink className="w-3 h-3 inline-block mr-1" /> 原网页
            </button>
          )}
          <button
            className="px-3 py-1 rounded-full text-xs border border-slate-200 hover:border-slate-400"
            onClick={() => onCopy(snippet)}
          >
            <Copy className="w-3 h-3 inline-block mr-1" /> 复制文本
          </button>
          <button
            className="px-3 py-1 rounded-full text-xs border border-red-200 text-red-600 hover:border-red-400"
            onClick={() => onDelete(snippet.id)}
          >
            <Trash2 className="w-3 h-3 inline-block mr-1" /> 删除
          </button>
        </div>
      </div>

      {/* 标签 */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        {snippet.folder && (
          <span className="px-2 py-1 bg-slate-100 rounded-full">{snippet.folder}</span>
        )}
        {snippet.tags?.map((t) => (
          <span key={t} className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
            #{t}
          </span>
        ))}
      </div>

      {/* 内容预览 */}
      <article
        className="mt-6 keji-rich min-h-[480px] rounded-2xl border border-slate-200 bg-white px-5 py-5 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: snippet.contentHtml || snippet.answer }}
      />
    </div>
  )
}
