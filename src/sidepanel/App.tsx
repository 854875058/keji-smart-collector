import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { storage } from '../lib/storage'
import { createSupabaseClient, mapUser } from '../lib/supabase'
import type { Snippet } from '../lib/types'
import { filterBySearch, type SearchScope } from '../lib/utils'
import { SnippetList } from './views/SnippetList'
import { AgentView } from './views/Agent'
import { SyncObsidian } from './views/SyncObsidian'
import { CollectionMode } from './views/CollectionMode'
import { AuthSync } from './views/AuthSync'
import { ExportNotes } from './views/ExportNotes'
import { KnowledgeGraph } from './views/KnowledgeGraph'
import { Button } from './components/ui/button'
import { Search, FolderOpen, Sparkles, Home, Settings, FolderSync, Inbox, Sun, Moon, Cloud, Download, Network } from 'lucide-react'
import { useTheme } from '../lib/useTheme'

type View = 'home' | 'snippets' | 'agent' | 'sync' | 'collection' | 'auth' | 'export' | 'graph'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [view, setView] = useState<View>('home')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<SearchScope>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [cloudUser, setCloudUser] = useState<{ email: string; displayName: string } | null>(null)

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

    // 检查 Supabase 登录状态
    const checkCloudUser = async () => {
      try {
        const supabase = createSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const u = mapUser(session.user)
          if (u) setCloudUser({ email: u.email, displayName: u.displayName })
        }
      } catch { /* 忽略 */ }
    }
    checkCloudUser()

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
      <nav className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5">
        {/* 主导航 - 图标+文字 */}
        <div className="flex items-center gap-0.5 flex-1">
          {[
            { id: 'home' as const, icon: Home, label: '首页' },
            { id: 'snippets' as const, icon: FolderOpen, label: '笔记' },
            { id: 'collection' as const, icon: Inbox, label: '收集' },
            { id: 'agent' as const, icon: Sparkles, label: 'AI' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                view === id
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* 次要功能 - 仅图标 */}
        <div className="flex items-center gap-0.5">
          {[
            { id: 'sync' as const, icon: FolderSync, label: '同步' },
            { id: 'auth' as const, icon: Cloud, label: '云同步' },
            { id: 'graph' as const, icon: Network, label: '图谱' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`p-1.5 rounded-md transition-colors ${
                view === id
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600'
              }`}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={theme === 'dark' ? '亮色模式' : '深色模式'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden">
        {view === 'home' && (
          <HomeView
            snippetCount={snippets.length}
            folderCount={folders.length}
            cloudUser={cloudUser}
            onNavigate={setView}
          />
        )}
        {view === 'snippets' && (
          <SnippetList
            snippets={filteredSnippets}
            allSnippets={snippets}
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
        {view === 'auth' && (
          <AuthSync
            snippets={snippets}
            showToast={showToast}
          />
        )}
        {view === 'export' && (
          <ExportNotes
            snippets={snippets}
            folders={folders}
            activeFolder={activeFolder}
            showToast={showToast}
          />
        )}
        {view === 'graph' && (
          <KnowledgeGraph
            snippets={snippets}
            onBack={() => setView('home')}
          />
        )}
      </main>
    </div>
  )
}

function HomeView({
  snippetCount,
  folderCount,
  cloudUser,
  onNavigate,
}: {
  snippetCount: number
  folderCount: number
  cloudUser: { email: string; displayName: string } | null
  onNavigate: (view: View) => void
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">可记</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">智能收藏助手</p>
      </div>

      {/* 登录状态 */}
      <div
        onClick={() => onNavigate('auth')}
        className="cursor-pointer rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 flex items-center gap-3 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
          {cloudUser ? cloudUser.email.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {cloudUser ? cloudUser.displayName : '未登录'}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {cloudUser ? cloudUser.email : '点击登录以开启云同步'}
          </div>
        </div>
        <Cloud className="h-4 w-4 text-slate-400" />
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
        <Button className="w-full" variant="outline" onClick={() => onNavigate('export')}>
          <Download className="mr-2 h-4 w-4" />
          导出笔记
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
