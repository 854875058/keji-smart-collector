import React, { useState, useMemo } from 'react'
import type { Snippet } from '../../lib/types'
import { Button } from '../components/ui/button'
import { Download, FileJson, FileText, File, Loader2, CheckCircle } from 'lucide-react'

interface Props {
  snippets: Snippet[]
  folders: string[]
  activeFolder: string
  showToast: (type: 'success' | 'error', message: string) => void
}

type ExportFormat = 'json' | 'markdown' | 'html'
type ExportScope = 'all' | 'folder' | 'selected'

/** 生成 JSON 导出内容 */
function exportAsJson(snippets: Snippet[]): string {
  return JSON.stringify(snippets, null, 2)
}

/** 生成 Markdown 导出内容（带 frontmatter） */
function exportAsMarkdown(snippets: Snippet[]): string {
  return snippets
    .map((s) => {
      const frontmatter = [
        '---',
        `title: "${(s.title || '').replace(/"/g, '\\"')}"`,
        `source: ${s.source}`,
        `url: ${s.url}`,
        `date: ${s.timestamp}`,
        s.tags?.length ? `tags: [${s.tags.map((t) => `"${t}"`).join(', ')}]` : null,
        s.folder ? `folder: "${s.folder}"` : null,
        s.isFavourite ? 'favourite: true' : null,
        '---',
      ]
        .filter(Boolean)
        .join('\n')

      const body = [
        s.question ? `## 问题\n\n${s.question}\n` : '',
        s.answer ? `## 回答\n\n${s.answer}\n` : '',
        s.summary ? `## 摘要\n\n${s.summary}\n` : '',
      ]
        .filter(Boolean)
        .join('\n')

      return `${frontmatter}\n\n${body}`
    })
    .join('\n\n---\n\n')
}

/** 转义 HTML 特殊字符 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 生成 HTML 导出内容 */
function exportAsHtml(snippets: Snippet[]): string {
  const articles = snippets
    .map((s) => {
      const tagsHtml = s.tags?.length
        ? `<div class="tags">${s.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>`
        : ''

      return `<article class="snippet">
  <h2>${escapeHtml(s.title)}</h2>
  <div class="meta">
    <span class="source">${escapeHtml(s.source)}</span>
    <span class="date">${new Date(s.timestamp).toLocaleString('zh-CN')}</span>
    ${s.folder ? `<span class="folder">${escapeHtml(s.folder)}</span>` : ''}
    ${s.isFavourite ? '<span class="fav">&#9733;</span>' : ''}
  </div>
  ${tagsHtml}
  ${s.question ? `<div class="section"><h3>问题</h3><div class="content">${s.question}</div></div>` : ''}
  <div class="section"><h3>回答</h3><div class="content">${s.contentHtml || escapeHtml(s.answer)}</div></div>
  ${s.summary ? `<div class="section"><h3>摘要</h3><div class="content">${escapeHtml(s.summary)}</div></div>` : ''}
  ${s.url ? `<div class="link"><a href="${escapeHtml(s.url)}" target="_blank">查看原文</a></div>` : ''}
</article>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>可记 - 导出笔记</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    h1 { text-align: center; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { text-align: center; color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
    article.snippet { background: #fff; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; }
    article.snippet h2 { font-size: 1.125rem; margin-bottom: 0.75rem; color: #0f172a; }
    .meta { display: flex; gap: 0.75rem; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .meta span { background: #f1f5f9; padding: 0.125rem 0.5rem; border-radius: 0.375rem; }
    .fav { color: #eab308 !important; }
    .tags { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .tag { background: #ecfdf5; color: #059669; padding: 0.125rem 0.5rem; border-radius: 0.375rem; font-size: 0.75rem; }
    .section { margin-top: 1rem; }
    .section h3 { font-size: 0.875rem; color: #64748b; margin-bottom: 0.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.25rem; }
    .content { font-size: 0.875rem; }
    .content pre { background: #f8fafc; padding: 0.75rem; border-radius: 0.5rem; overflow-x: auto; }
    .content code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8125rem; }
    .link { margin-top: 1rem; }
    .link a { color: #2563eb; text-decoration: none; font-size: 0.875rem; }
    .link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>可记 - 智能收藏助手</h1>
    <p class="subtitle">导出时间: ${new Date().toLocaleString('zh-CN')} | 共 ${snippets.length} 条笔记</p>
    ${articles}
  </div>
</body>
</html>`
}

/** 触发文件下载 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileJson; ext: string }[] = [
  { value: 'json', label: 'JSON', icon: FileJson, ext: '.json' },
  { value: 'markdown', label: 'Markdown', icon: FileText, ext: '.md' },
  { value: 'html', label: 'HTML', icon: File, ext: '.html' },
]

export function ExportNotes({ snippets, folders, activeFolder, showToast }: Props) {
  const [format, setFormat] = useState<ExportFormat>('json')
  const [scope, setScope] = useState<ExportScope>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  // 根据范围筛选笔记
  const scopedSnippets = useMemo(() => {
    switch (scope) {
      case 'folder':
        if (!activeFolder) return snippets
        return snippets.filter((s) => s.folder === activeFolder)
      case 'selected':
        return snippets.filter((s) => selectedIds.has(s.id))
      case 'all':
      default:
        return snippets
    }
  }, [snippets, scope, activeFolder, selectedIds])

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === snippets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(snippets.map((s) => s.id)))
    }
  }

  const handleExport = async () => {
    if (scopedSnippets.length === 0) {
      showToast('error', '没有可导出的笔记')
      return
    }

    setExporting(true)
    setExported(false)

    try {
      // 使用 setTimeout 让 UI 更新后再执行
      await new Promise((r) => setTimeout(r, 50))

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const scopeLabel = scope === 'all' ? '全部' : scope === 'folder' ? (activeFolder || '全部') : '选中'

      let content: string
      let filename: string
      let mimeType: string

      switch (format) {
        case 'json':
          content = exportAsJson(scopedSnippets)
          filename = `可记_${scopeLabel}_${timestamp}.json`
          mimeType = 'application/json'
          break
        case 'markdown':
          content = exportAsMarkdown(scopedSnippets)
          filename = `可记_${scopeLabel}_${timestamp}.md`
          mimeType = 'text/markdown'
          break
        case 'html':
          content = exportAsHtml(scopedSnippets)
          filename = `可记_${scopeLabel}_${timestamp}.html`
          mimeType = 'text/html'
          break
      }

      downloadFile(content, filename, mimeType)
      setExported(true)
      showToast('success', `已导出 ${scopedSnippets.length} 条笔记`)
    } catch (err: any) {
      showToast('error', `导出失败: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">导出笔记</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        将笔记导出为文件，方便备份或迁移
      </p>

      {/* 导出格式 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">导出格式</div>
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-colors ${
                  format === opt.value
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 导出范围 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">导出范围</div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
              className="accent-emerald-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              全部笔记 ({snippets.length})
            </span>
          </label>
          {activeFolder && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={scope === 'folder'}
                onChange={() => setScope('folder')}
                className="accent-emerald-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                当前文件夹 "{activeFolder}" ({snippets.filter((s) => s.folder === activeFolder).length})
              </span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
              className="accent-emerald-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              选中的笔记 ({selectedIds.size})
            </span>
          </label>
        </div>
      </div>

      {/* 选中笔记列表 */}
      {scope === 'selected' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">选择笔记</div>
            <button
              onClick={handleSelectAll}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {selectedIds.size === snippets.length ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {snippets.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-2 cursor-pointer py-1 px-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={() => handleToggleSelect(s.id)}
                  className="mt-0.5 accent-emerald-600"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1">
                  {s.title || s.question?.slice(0, 40) || '无标题'}
                </span>
              </label>
            ))}
            {snippets.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">暂无笔记</p>
            )}
          </div>
        </div>
      )}

      {/* 导出按钮 */}
      <Button
        className="w-full"
        onClick={handleExport}
        disabled={exporting || scopedSnippets.length === 0}
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : exported ? (
          <CheckCircle className="h-4 w-4 mr-2" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {exporting
          ? '导出中...'
          : exported
            ? '导出完成，可再次导出'
            : `导出 ${scopedSnippets.length} 条笔记`}
      </Button>
    </div>
  )
}
