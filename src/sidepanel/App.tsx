import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { storage } from '../lib/storage'
import type { Snippet } from '../lib/types'
import { filterBySearch, type SearchScope } from '../lib/utils'
import { SnippetList } from './views/SnippetList'
import { AgentView } from './views/Agent'
import { SyncObsidian } from './views/SyncObsidian'
import { CollectionMode } from './views/CollectionMode'
import { Button } from './components/ui/button'
import { Search, FolderOpen, Sparkles, Home, Settings, FolderSync, Inbox, Sun, Moon } from 'lucide-react'
import { useTheme } from '../lib/useTheme'

type View = 'home' | 'snippets' | 'agent' | 'sync' | 'collection'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [view, setView] = useState<View>('home')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<SearchScope>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 初始化加载数据
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
    }
    load()

    // 监听 storage 变化
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.snippets) setSnippets(changes.snippets.newValue || [])
      if (changes.folders) setFolders(changes.folders.newValue || [])
      if (changes.activeFolder) setActiveFolder(changes.activeFolder.newValue || '')
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const filteredSnippets = useMemo(() => {
    let result = snippets
    if (activeFolder) {
      result = result.filter((s) => s.folder === activeFolder)
    }
    if (searchQuery.trim()) {
      const matches = filterBySearch(result, searchQuery, searchScope)
      result = matches.map((m) => m.snippet)
    }
    return result
  }, [snippets, activeFolder, searchQuery, searchScope])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* 顶部导航 */}
      <nav className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
        <button
          onClick={() => setView('home')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'home' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Home className="h-4 w-4" />
          首页
        </button>
        <button
          onClick={() => setView('snippets')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'snippets' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          笔记
        </button>
        <button
          onClick={() => setView('collection')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'collection' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Inbox className="h-4 w-4" />
          收集
        </button>
        <button
          onClick={() => setView('agent')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'agent' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          AI 助手
        </button>
        <button
          onClick={() => setView('sync')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'sync' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <FolderSync className="h-4 w-4" />
          同步
        </button>
        <div className="ml-auto">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={theme === 'dark' ? '切换到亮色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden">
        {view === 'home' && (
          <HomeView
            snippetCount={snippets.length}
            folderCount={folders.length}
            onNavigate={setView}
          />
        )}
        {view === 'snippets' && (
          <SnippetList
            snippets={filteredSnippets}
            folders={folders}
            activeFolder={activeFolder}
            searchQuery={searchQuery}
            searchScope={searchScope}
            onSearchChange={setSearchQuery}
            onSearchScopeChange={setSearchScope}
            onFolderChange={setActiveFolder}
            onDelete={async (id) => {
              await storage.deleteSnippet(id)
              showToast('success', '已删除')
            }}
            onToggleFavourite={async (id) => {
              const s = snippets.find((s) => s.id === id)
              if (s) await storage.updateSnippet(id, { isFavourite: !s.isFavourite })
            }}
            showToast={showToast}
          />
        )}
        {view === 'collection' && (
          <CollectionMode showToast={showToast} />
        )}
        {view === 'agent' && <AgentView snippets={snippets} folders={folders} />}
        {view === 'sync' && (
          <SyncObsidian
            snippets={snippets}
            showToast={showToast}
          />
        )}
      </main>
    </div>
  )
}

function HomeView({
  snippetCount,
  folderCount,
  onNavigate,
}: {
  snippetCount: number
  folderCount: number
  onNavigate: (view: View) => void
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">可记</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">智能收藏助手</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{snippetCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">笔记</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{folderCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">笔记本</div>
        </div>
      </div>

      <div className="space-y-2">
        <Button className="w-full" onClick={() => onNavigate('snippets')}>
          <FolderOpen className="mr-2 h-4 w-4" />
          查看笔记
        </Button>
        <Button className="w-full" variant="outline" onClick={() => onNavigate('collection')}>
          <Inbox className="mr-2 h-4 w-4" />
          收集箱
        </Button>
        <Button className="w-full" variant="outline" onClick={() => onNavigate('sync')}>
          <FolderSync className="mr-2 h-4 w-4" />
          Obsidian 同步
        </Button>
        <Button className="w-full" variant="outline" onClick={() => onNavigate('agent')}>
          <Sparkles className="mr-2 h-4 w-4" />
          AI 助手
        </Button>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        在 ChatGPT / Claude / Gemini 页面划词或点击按钮即可保存
      </p>
    </div>
  )
}
