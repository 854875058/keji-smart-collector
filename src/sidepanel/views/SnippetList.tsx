import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Snippet, AgentConfig, SmartFolder, SmartFolderRule } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Search, Star, Trash2, ExternalLink, Copy, FolderOpen,
  ArrowLeft, Tag, X, CheckSquare, Square, MinusSquare,
  ArrowUpDown, ChevronDown, Save, FolderInput, Filter,
  Sparkles, Loader2, GitCompareArrows, Plus, Network,
} from 'lucide-react'
import { formatDate, highlightText, filterBySearch, escapeHtml, type SearchScope } from '../../lib/utils'
import { replaceWikiLinks } from '../../lib/wikiLink'
import { findRelatedNotes } from '../../agent/relatedNotes'
import { batchAutoTag, batchFindDuplicates } from '../../agent/batchOps'
import { getSmartFolderSnippets } from '../../agent/smartFolders'
import NoteAIPanel from '../components/NoteAIPanel'

/** 在新标签页打开 web.html 笔记详情 */
async function openNoteInWebTab(snippetId: string) {
  const webUrl = chrome.runtime.getURL('web.html')
  const targetUrl = `${webUrl}?snippet=${encodeURIComponent(snippetId)}`

  const tabs = await chrome.tabs.query({ url: `${webUrl}*` })
  const existing = tabs[0]
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: targetUrl })
    return
  }
  await chrome.tabs.create({ url: targetUrl })
}

type SortOption = 'time-desc' | 'time-asc' | 'source' | 'title'

const SORT_LABELS: Record<SortOption, string> = {
  'time-desc': '最新优先',
  'time-asc': '最早优先',
  'source': '按来源',
  'title': '按标题',
}

const SCOPE_LABELS: Record<SearchScope, string> = {
  'all': '全部',
  'title': '标题',
  'content': '内容',
  'tags': '标签',
}

interface Props {
  snippets: Snippet[]
  allSnippets: Snippet[]
  folders: string[]
  activeFolder: string
  searchQuery: string
  searchScope: SearchScope
  onSearchChange: (q: string) => void
  onSearchScopeChange: (scope: SearchScope) => void
  onFolderChange: (folder: string) => void
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
}

export function SnippetList({
  snippets,
  allSnippets,
  folders,
  activeFolder,
  searchQuery,
  searchScope,
  onSearchChange,
  onSearchScopeChange,
  onFolderChange,
  onDelete,
  onToggleFavourite,
  showToast,
}: Props) {
  const [sortOption, setSortOption] = useState<SortOption>('time-desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showBatchMoveMenu, setShowBatchMoveMenu] = useState(false)
  const [showScopeDropdown, setShowScopeDropdown] = useState(false)
  const [batchAiLoading, setBatchAiLoading] = useState(false)
  const [duplicateResults, setDuplicateResults] = useState<{ group1: string; group2: string; reason: string }[]>([])
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false)

  // ── 智能文件夹状态 ──────────────────────────────────────
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([])
  const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(null)
  const [showCreateSmartFolder, setShowCreateSmartFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderOperator, setNewFolderOperator] = useState<'and' | 'or'>('and')
  const [newFolderRules, setNewFolderRules] = useState<SmartFolderRule[]>([
    { field: 'title', operator: 'contains', value: '' },
  ])

  // 加载智能文件夹
  useEffect(() => {
    storage.getSmartFolders().then(setSmartFolders)
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.smartFolders) setSmartFolders(changes.smartFolders.newValue || [])
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  // 当前激活的智能文件夹
  const activeSmartFolder = useMemo(
    () => (activeSmartFolderId ? smartFolders.find((f) => f.id === activeSmartFolderId) || null : null),
    [smartFolders, activeSmartFolderId]
  )

  // 智能文件夹匹配的笔记
  const smartFolderSnippets = useMemo(() => {
    if (!activeSmartFolder) return null
    return getSmartFolderSnippets(allSnippets, activeSmartFolder)
  }, [allSnippets, activeSmartFolder])

  // 实际显示的笔记（智能文件夹优先）
  const displaySnippets = useMemo(() => {
    if (smartFolderSnippets !== null) {
      // 智能文件夹模式：搜索作用于匹配结果
      if (searchQuery.trim()) {
        const matches = filterBySearch(smartFolderSnippets, searchQuery, searchScope)
        return matches.map((m) => m.snippet)
      }
      return smartFolderSnippets
    }
    return snippets
  }, [smartFolderSnippets, snippets, searchQuery, searchScope])

  // 创建智能文件夹
  const handleCreateSmartFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return
    const validRules = newFolderRules.filter((r) => r.value.trim() !== '')
    if (validRules.length === 0) return

    const folder: SmartFolder = {
      id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      rules: validRules,
      operator: newFolderOperator,
    }
    await storage.addSmartFolder(folder)
    setShowCreateSmartFolder(false)
    setNewFolderName('')
    setNewFolderRules([{ field: 'title', operator: 'contains', value: '' }])
    setNewFolderOperator('and')
    showToast('success', `已创建智能文件夹「${name}」`)
  }, [newFolderName, newFolderRules, newFolderOperator, showToast])

  // 删除智能文件夹
  const handleDeleteSmartFolder = useCallback(async (id: string) => {
    await storage.deleteSmartFolder(id)
    if (activeSmartFolderId === id) setActiveSmartFolderId(null)
    showToast('success', '已删除智能文件夹')
  }, [activeSmartFolderId, showToast])

  // 排序后的列表
  const sortedSnippets = useMemo(() => {
    const sorted = [...displaySnippets]
    switch (sortOption) {
      case 'time-desc':
        sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        break
      case 'time-asc':
        sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        break
      case 'source':
        sorted.sort((a, b) => a.source.localeCompare(b.source))
        break
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
        break
    }
    return sorted
  }, [displaySnippets, sortOption])

  // 当前详情笔记（从全部笔记中查找，支持从相关笔记跳转到不在筛选列表中的笔记）
  const detailSnippet = useMemo(
    () => (detailId ? allSnippets.find((s) => s.id === detailId) || null : null),
    [allSnippets, detailId]
  )

  // ── 选择操作 ──────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === sortedSnippets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedSnippets.map((s) => s.id)))
    }
  }, [selectedIds.size, sortedSnippets])

  // ── 批量操作 ──────────────────────────────────────
  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size
    for (const id of selectedIds) {
      await storage.deleteSnippet(id)
    }
    setSelectedIds(new Set())
    showToast('success', `已删除 ${count} 条笔记`)
  }, [selectedIds, showToast])

  const handleBatchMove = useCallback(async (folder: string | null) => {
    const count = selectedIds.size
    for (const id of selectedIds) {
      await storage.updateSnippet(id, { folder: folder || undefined })
    }
    setSelectedIds(new Set())
    setShowBatchMoveMenu(false)
    showToast('success', folder ? `已移动 ${count} 条到「${folder}」` : `已移出 ${count} 条`)
  }, [selectedIds, showToast])

  const handleCopy = useCallback(async (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(snippet.answer)
      showToast('success', '已复制')
    } catch {
      showToast('error', '复制失败')
    }
  }, [showToast])

  // ── AI 批量操作 ──────────────────────────────────────
  const handleBatchAutoTag = useCallback(async () => {
    const config = await storage.getAgentConfig()
    if (!config?.apiKey) {
      showToast('error', '请先在 AI 页面配置 API Key')
      return
    }
    const selectedSnippets = sortedSnippets.filter((s) => selectedIds.has(s.id))
    if (selectedSnippets.length === 0) return

    setBatchAiLoading(true)
    try {
      const results = await batchAutoTag(selectedSnippets, config)
      let updated = 0
      for (const [id, { tags, summary }] of results) {
        await storage.updateSnippet(id, { tags, summary })
        updated++
      }
      showToast('success', `已为 ${updated} 条笔记生成标签和摘要`)
    } catch (err: any) {
      showToast('error', `AI 标签失败: ${err.message || '未知错误'}`)
    } finally {
      setBatchAiLoading(false)
    }
  }, [sortedSnippets, selectedIds, showToast])

  const handleBatchFindDuplicates = useCallback(async () => {
    const config = await storage.getAgentConfig()
    if (!config?.apiKey) {
      showToast('error', '请先在 AI 页面配置 API Key')
      return
    }
    const selectedSnippets = sortedSnippets.filter((s) => selectedIds.has(s.id))
    if (selectedSnippets.length < 2) {
      showToast('error', '请至少选择 2 条笔记')
      return
    }

    setBatchAiLoading(true)
    try {
      const results = await batchFindDuplicates(selectedSnippets, config)
      setDuplicateResults(results)
      setShowDuplicatePanel(true)
      if (results.length === 0) {
        showToast('success', '未发现重复笔记')
      } else {
        showToast('success', `发现 ${results.length} 组重复笔记`)
      }
    } catch (err: any) {
      showToast('error', `查重失败: ${err.message || '未知错误'}`)
    } finally {
      setBatchAiLoading(false)
    }
  }, [sortedSnippets, selectedIds, showToast])

  // ── 详情视图 ──────────────────────────────────────
  if (detailSnippet) {
    return (
      <NoteDetailInline
        snippet={detailSnippet}
        allSnippets={allSnippets}
        folders={folders}
        onBack={() => setDetailId(null)}
        onDelete={onDelete}
        onToggleFavourite={onToggleFavourite}
        showToast={showToast}
        onSelectNote={(id) => setDetailId(id)}
      />
    )
  }

  // ── 列表视图 ──────────────────────────────────────
  const allSelected = sortedSnippets.length > 0 && selectedIds.size === sortedSnippets.length
  const someSelected = selectedIds.size > 0 && !allSelected

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="p-3 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8 pr-20"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {/* 搜索范围选择器 */}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <button
              onClick={() => setShowScopeDropdown(!showScopeDropdown)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
            >
              <Filter className="h-3 w-3" />
              {SCOPE_LABELS[searchScope]}
            </button>
            {showScopeDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowScopeDropdown(false)} />
                <div className="absolute top-full right-0 mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[80px] dark:bg-slate-800 dark:border-slate-700">
                  {(Object.entries(SCOPE_LABELS) as [SearchScope, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${
                        searchScope === key ? 'text-emerald-600 font-medium' : 'text-slate-700 dark:text-slate-300'
                      }`}
                      onClick={() => { onSearchScopeChange(key); setShowScopeDropdown(false) }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* 搜索匹配数量 */}
        {searchQuery.trim() && (
          <div className="mt-1.5 text-xs text-slate-400">
            找到 {sortedSnippets.length} 条匹配笔记
          </div>
        )}
      </div>

      {/* 排序 + 全选 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
        {/* 排序下拉 */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {SORT_LABELS[sortOption]}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showSortDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortDropdown(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[120px] dark:bg-slate-800 dark:border-slate-700">
                {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${
                      sortOption === key ? 'text-emerald-600 font-medium' : 'text-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => { setSortOption(key); setShowSortDropdown(false) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 全选按钮 */}
        {sortedSnippets.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"
          >
            {allSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
            ) : someSelected ? (
              <MinusSquare className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : '全选'}
          </button>
        )}
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="px-3 py-2 border-b border-slate-200 bg-emerald-50 dark:border-slate-700 dark:bg-emerald-900/30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-700 font-medium">
              已选 {selectedIds.size} 项
            </span>
            <div className="flex-1" />
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBatchMoveMenu(!showBatchMoveMenu)}
              >
                <FolderInput className="h-3.5 w-3.5 mr-1" />
                移动到
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {showBatchMoveMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowBatchMoveMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[140px] dark:bg-slate-800 dark:border-slate-700">
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-700 dark:text-slate-300"
                      onClick={() => handleBatchMove(null)}
                    >
                      移出文件夹
                    </button>
                    {folders.map((f) => (
                      <button
                        key={f}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-700 dark:text-slate-300"
                        onClick={() => handleBatchMove(f)}
                      >
                        <FolderOpen className="h-3 w-3 inline-block mr-1" />
                        {f}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              删除
            </Button>
          </div>
          {/* AI 批量操作 */}
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchAutoTag}
              disabled={batchAiLoading}
            >
              {batchAiLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              AI 自动标签
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchFindDuplicates}
              disabled={batchAiLoading}
            >
              {batchAiLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
              )}
              查找重复
            </Button>
          </div>
        </div>
      )}

      {/* 重复笔记检测结果 */}
      {showDuplicatePanel && duplicateResults.length > 0 && (
        <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              发现 {duplicateResults.length} 组重复笔记
            </span>
            <button
              onClick={() => setShowDuplicatePanel(false)}
              className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400"
            >
              关闭
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {duplicateResults.map((d, idx) => {
              const s1 = allSnippets.find((s) => s.id === d.group1)
              const s2 = allSnippets.find((s) => s.id === d.group2)
              if (!s1 || !s2) return null
              return (
                <div key={idx} className="flex items-start gap-2 text-xs p-2 rounded bg-white border border-amber-200 dark:bg-slate-800 dark:border-amber-800">
                  <GitCompareArrows className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        className="font-medium text-slate-700 hover:text-emerald-600 truncate dark:text-slate-300"
                        onClick={() => setDetailId(d.group1)}
                      >
                        {s1.title}
                      </button>
                      <span className="text-slate-400">&</span>
                      <button
                        className="font-medium text-slate-700 hover:text-emerald-600 truncate dark:text-slate-300"
                        onClick={() => setDetailId(d.group2)}
                      >
                        {s2.title}
                      </button>
                    </div>
                    <div className="text-slate-500 mt-0.5 dark:text-slate-400">{d.reason}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 文件夹标签 */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => onFolderChange('')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !activeFolder
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
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
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 智能文件夹 */}
      {(smartFolders.length > 0 || showCreateSmartFolder) && (
        <div className="px-3 py-2 border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-1 mb-1.5">
            <Sparkles className="h-3 w-3 text-violet-500" />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">智能文件夹</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {smartFolders.map((sf) => {
              const matchCount = getSmartFolderSnippets(allSnippets, sf).length
              return (
                <div key={sf.id} className="inline-flex items-center group">
                  <button
                    onClick={() => {
                      setActiveSmartFolderId(activeSmartFolderId === sf.id ? null : sf.id)
                      onFolderChange('') // 清除普通文件夹选择
                    }}
                    className={`inline-flex items-center gap-1 rounded-l-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeSmartFolderId === sf.id
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {sf.name}
                    <span className="text-[10px] opacity-60">({matchCount})</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSmartFolder(sf.id) }}
                    className="rounded-r-full px-1 py-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除智能文件夹"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
            <button
              onClick={() => setShowCreateSmartFolder(!showCreateSmartFolder)}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Plus className="h-3 w-3" />
              新建
            </button>
          </div>
        </div>
      )}

      {/* 智能文件夹创建表单 */}
      {showCreateSmartFolder && (
        <div className="px-3 py-3 border-b border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-900/10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">新建智能文件夹</span>
            <div className="flex-1" />
            <button
              onClick={() => setShowCreateSmartFolder(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input
            className="h-7 text-xs mb-2"
            placeholder="文件夹名称"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] text-slate-500">满足</span>
            <select
              value={newFolderOperator}
              onChange={(e) => setNewFolderOperator(e.target.value as 'and' | 'or')}
              className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white dark:bg-slate-700 dark:border-slate-600"
            >
              <option value="and">全部</option>
              <option value="or">任一</option>
            </select>
            <span className="text-[10px] text-slate-500">条件</span>
          </div>
          <div className="space-y-1.5 mb-2">
            {newFolderRules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <select
                  value={rule.field}
                  onChange={(e) => {
                    const updated = [...newFolderRules]
                    updated[idx] = { ...updated[idx], field: e.target.value as SmartFolderRule['field'] }
                    setNewFolderRules(updated)
                  }}
                  className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white dark:bg-slate-700 dark:border-slate-600"
                >
                  <option value="title">标题</option>
                  <option value="answer">内容</option>
                  <option value="tags">标签</option>
                  <option value="source">来源</option>
                </select>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const updated = [...newFolderRules]
                    updated[idx] = { ...updated[idx], operator: e.target.value as SmartFolderRule['operator'] }
                    setNewFolderRules(updated)
                  }}
                  className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white dark:bg-slate-700 dark:border-slate-600"
                >
                  <option value="contains">包含</option>
                  <option value="equals">等于</option>
                  <option value="startsWith">开头是</option>
                </select>
                <Input
                  className="flex-1 h-6 text-[10px]"
                  placeholder="值"
                  value={rule.value}
                  onChange={(e) => {
                    const updated = [...newFolderRules]
                    updated[idx] = { ...updated[idx], value: e.target.value }
                    setNewFolderRules(updated)
                  }}
                />
                {newFolderRules.length > 1 && (
                  <button
                    onClick={() => setNewFolderRules(newFolderRules.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] text-violet-600"
              onClick={() => setNewFolderRules([...newFolderRules, { field: 'title', operator: 'contains', value: '' }])}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              添加条件
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              className="h-6 text-[10px]"
              onClick={handleCreateSmartFolder}
            >
              创建
            </Button>
          </div>
        </div>
      )}

      {/* 如果没有普通文件夹且没有智能文件夹，显示新建智能文件夹入口 */}
      {folders.length === 0 && smartFolders.length === 0 && !showCreateSmartFolder && (
        <div className="px-3 py-2 border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setShowCreateSmartFolder(true)}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600"
          >
            <Plus className="h-3 w-3" />
            创建智能文件夹
          </button>
        </div>
      )}

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedSnippets.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {searchQuery ? '没有找到匹配的笔记' : '暂无笔记，去 AI 页面保存内容吧'}
          </div>
        ) : (
          sortedSnippets.map((snippet) => {
            const isSelected = selectedIds.has(snippet.id)
            return (
              <div
                key={snippet.id}
                className={`rounded-xl border bg-white p-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer dark:hover:border-slate-600 ${
                  isSelected ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-600 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(snippet.id) }}
                    className="shrink-0 mt-0.5"
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                    )}
                  </button>

                  {/* 内容区 - 点击打开详情 */}
                  <div
                    className="min-w-0 flex-1"
                    onClick={() => setDetailId(snippet.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900 truncate dark:text-slate-100"
                        dangerouslySetInnerHTML={{ __html: highlightText(snippet.title, searchQuery) }}
                      />
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
                    <div className="text-xs text-slate-500 mt-1 truncate dark:text-slate-400"
                      dangerouslySetInnerHTML={{ __html: `Q: ${highlightText(snippet.question, searchQuery)}` }}
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-600 mt-2 line-clamp-2 pl-6 dark:text-slate-400" onClick={() => setDetailId(snippet.id)}
                  dangerouslySetInnerHTML={{ __html: highlightText(snippet.answer.slice(0, 120), searchQuery) }}
                />

                {/* 标签预览 */}
                {snippet.tags && snippet.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pl-6">
                    {snippet.tags.slice(0, 3).map((t) => (
                      <span key={t} className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px]"
                        dangerouslySetInnerHTML={{ __html: `#${highlightText(t, searchQuery)}` }}
                      />
                    ))}
                    {snippet.tags.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{snippet.tags.length - 3}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pl-6">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
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
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 dark:hover:bg-slate-700"
                      title="复制"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {snippet.url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(snippet.url) }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 dark:hover:bg-slate-700"
                        title="打开原网页"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(snippet.id) }}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 dark:hover:bg-red-900/30"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── 内联笔记详情（含标签编辑） ──────────────────────────

function NoteDetailInline({
  snippet,
  allSnippets,
  folders,
  onBack,
  onDelete,
  onToggleFavourite,
  showToast,
  onSelectNote,
}: {
  snippet: Snippet
  allSnippets: Snippet[]
  folders: string[]
  onBack: () => void
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
  onSelectNote: (id: string) => void
}) {
  const [tags, setTags] = useState<string[]>(snippet.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  const relatedNotes = useMemo(
    () => findRelatedNotes(snippet, allSnippets, 5),
    [snippet, allSnippets]
  )

  // WikiLink 查找回调
  const findSnippetId = useCallback((title: string): string | undefined => {
    const found = allSnippets.find((s) => s.title === title)
    return found?.id
  }, [allSnippets])

  // WikiLink 渲染后处理点击
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const handler = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'A' && target.dataset.snippetId) {
        e.preventDefault()
        onSelectNote(target.dataset.snippetId)
      }
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [onSelectNote])

  const handleAddTag = useCallback(async () => {
    const newTag = tagInput.trim()
    if (!newTag) return
    if (tags.includes(newTag)) {
      showToast('error', '标签已存在')
      return
    }
    const updated = [...tags, newTag]
    await storage.updateSnippet(snippet.id, { tags: updated })
    setTags(updated)
    setTagInput('')
    showToast('success', `已添加标签「${newTag}」`)
  }, [tagInput, tags, snippet.id, showToast])

  const handleRemoveTag = useCallback(async (tag: string) => {
    const updated = tags.filter((t) => t !== tag)
    await storage.updateSnippet(snippet.id, { tags: updated })
    setTags(updated)
    showToast('success', `已移除标签「${tag}」`)
  }, [tags, snippet.id, showToast])

  const handleMoveToFolder = useCallback(async (folder: string | null) => {
    await storage.updateSnippet(snippet.id, { folder: folder || undefined })
    setShowMoveMenu(false)
    showToast('success', folder ? `已移动到「${folder}」` : '已移出文件夹')
  }, [snippet.id, showToast])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet.answer)
      showToast('success', '已复制')
    } catch {
      showToast('error', '复制失败')
    }
  }, [snippet.answer, showToast])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-700 dark:text-slate-400"
          title="返回列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400 dark:text-slate-500">{snippet.source}</div>
          <div className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100">{snippet.title}</div>
        </div>
        <button
          onClick={() => onToggleFavourite(snippet.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <Star
            className={`h-4 w-4 ${
              snippet.isFavourite ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
            }`}
          />
        </button>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
        <Button size="sm" variant="ghost" onClick={handleCopy}>
          <Copy className="h-3.5 w-3.5 mr-1" />
          复制
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openNoteInWebTab(snippet.id)}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          详情页
        </Button>
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowMoveMenu(!showMoveMenu)}
          >
            <FolderOpen className="h-3.5 w-3.5 mr-1" />
            {snippet.folder || '未归类'}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {showMoveMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMoveMenu(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[140px] dark:bg-slate-800 dark:border-slate-700">
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-700 dark:text-slate-300"
                  onClick={() => handleMoveToFolder(null)}
                >
                  未归类
                </button>
                {folders.map((f) => (
                  <button
                    key={f}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${
                      snippet.folder === f ? 'text-emerald-600 font-medium' : 'text-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => handleMoveToFolder(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => { onDelete(snippet.id); onBack() }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 标签编辑 */}
      <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">标签</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs"
            >
              #{t}
              <button
                onClick={() => handleRemoveTag(t)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <span className="text-xs text-slate-400">暂无标签</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            placeholder="输入标签，回车添加"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
            className="flex-1 h-8 text-xs"
          />
          <Button size="sm" onClick={handleAddTag} className="h-8 px-3">
            添加
          </Button>
        </div>
      </div>

      {/* 问题 */}
      <div className="px-3 py-2">
        <div className="text-xs text-slate-400 mb-1 dark:text-slate-500">问题</div>
        <div className="text-sm text-slate-700 dark:text-slate-300">{snippet.question}</div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="text-xs text-slate-400 mb-1 dark:text-slate-500">回答</div>
        <div
          ref={contentRef}
          className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed dark:text-slate-200 wiki-link-content"
          dangerouslySetInnerHTML={{
            __html: replaceWikiLinks(
              // answer 是纯文本，必须先转义再拼 <br/>，否则正文里的
              // <img onerror=...> 之类会被当成真的 HTML 渲染
              escapeHtml(snippet.answer).replace(/\n/g, '<br/>'),
              findSnippetId,
              'text-emerald-600 hover:text-emerald-700 underline underline-offset-2 cursor-pointer'
            ),
          }}
        />
      </div>

      {/* 笔记 AI：思维导图 + 追问 */}
      <NoteAIPanel
        snippet={snippet}
        onUpdated={() => {
          /* storage.onChanged 会驱动 App 刷新，这里无需额外动作 */
        }}
        showToast={showToast}
        compact
      />

      {/* 相关笔记 */}
      {relatedNotes.length > 0 && (
        <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">相关笔记</span>
          </div>
          <div className="space-y-1.5">
            {relatedNotes.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectNote(r.id)}
                className="w-full text-left p-2 rounded-lg border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors dark:border-slate-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20"
              >
                <div className="text-xs font-medium text-slate-800 truncate dark:text-slate-200">
                  {r.title}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 dark:text-slate-400">
                  {r.answer.slice(0, 80)}
                </div>
                {r.tags && r.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {r.tags.slice(0, 3).map((t) => (
                      <span key={t} className="px-1 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] dark:bg-amber-900/30 dark:text-amber-400">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 底部信息 */}
      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between dark:border-slate-700 dark:text-slate-500">
        <span>{formatDate(snippet.timestamp)}</span>
        {snippet.url && (
          <a
            href={snippet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline"
          >
            查看原网页
          </a>
        )}
      </div>
    </div>
  )
}
