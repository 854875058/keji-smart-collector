import React, { useState } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { FolderOpen, Download, Check, Loader2, AlertCircle, HardDrive } from 'lucide-react'

interface Props {
  onImportComplete: () => void
  showToast: (type: 'success' | 'error', message: string) => void
}

export function ImportObsidian({ onImportComplete, showToast }: Props) {
  const [dirName, setDirName] = useState<string>('')
  const [preview, setPreview] = useState<Snippet[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [scanning, setScanning] = useState(false)
  // 保存目录句柄供导入时使用
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const handleSelectFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      setDirHandle(handle)
      setDirName(handle.name)
      setScanning(true)

      const snippets = await scanDirectory(handle, handle.name)
      setPreview(snippets)
      showToast('success', `找到 ${snippets.length} 条笔记`)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast('error', `选择文件夹失败: ${err.message}`)
      }
    } finally {
      setScanning(false)
    }
  }

  const handleImport = async () => {
    if (!preview || preview.length === 0) return

    setImporting(true)
    setProgress({ done: 0, total: preview.length })

    let imported = 0
    let skipped = 0

    for (const snippet of preview) {
      try {
        const existing = await storage.getSnippets()
        const duplicate = existing.find(
          (s) => s.id === snippet.id || s.title === snippet.title
        )
        if (duplicate) {
          skipped++
        } else {
          await storage.saveSnippet(snippet)
          imported++
        }
      } catch {
        // skip
      }
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    }

    setImporting(false)
    showToast('success', `导入完成：${imported} 条新增，${skipped} 条跳过`)
    onImportComplete()
  }

  return (
    <div className="p-6 space-y-4 max-w-lg mx-auto">
      <h3 className="text-lg font-semibold text-slate-900">从 Obsidian 导入</h3>
      <p className="text-sm text-slate-500">
        选择你的 Obsidian Vault 文件夹，将 Markdown 笔记导入到可记
      </p>

      {/* 选择文件夹 */}
      <div>
        <Button
          className="w-full"
          variant="outline"
          onClick={handleSelectFolder}
          disabled={scanning}
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <HardDrive className="h-4 w-4 mr-2" />
          )}
          {scanning ? '扫描中...' : dirName ? `已选择：${dirName}` : '选择 Obsidian 文件夹'}
        </Button>
        <p className="text-[10px] text-slate-400 mt-1">
          浏览器会弹出文件夹选择窗口，找到你的 Obsidian Vault 目录
        </p>
      </div>

      {/* 预览和导入按钮 */}
      {preview && (
        <>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
              <div className="text-lg font-bold text-emerald-600">{preview.length}</div>
              <div className="text-[10px] text-slate-500">条笔记</div>
            </div>
            <div className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
              <div className="text-lg font-bold text-emerald-600">
                {new Set(preview.map((s) => s.folder).filter(Boolean)).size}
              </div>
              <div className="text-[10px] text-slate-500">个文件夹</div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleImport}
            disabled={preview.length === 0 || importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" />
            )}
            {importing ? `导入中 ${progress.done}/${progress.total}` : '开始导入'}
          </Button>

          {/* 预览列表 */}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {preview.slice(0, 30).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {s.folder && `${s.folder} · `}
                    {s.tags?.join(', ')}
                  </div>
                </div>
              </div>
            ))}
            {preview.length > 30 && (
              <div className="text-xs text-slate-400 text-center py-1">
                ...还有 {preview.length - 30} 条
              </div>
            )}
          </div>
        </>
      )}

      {/* 空状态 */}
      {preview && preview.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">未找到 Markdown 文件</p>
        </div>
      )}
    </div>
  )
}

// ── 文件系统扫描 ──────────────────────────────────────

/** 递归扫描目录，读取所有 .md 文件 */
async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  rootName: string,
  currentPath: string = ''
): Promise<Snippet[]> {
  const snippets: Snippet[] = []
  const skipDirs = new Set(['.obsidian', '.trash', 'attachments', '.git', 'node_modules'])

  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === 'directory') {
      if (skipDirs.has(name)) continue
      const subPath = currentPath ? `${currentPath}/${name}` : name
      const subSnippets = await scanDirectory(handle as FileSystemDirectoryHandle, rootName, subPath)
      snippets.push(...subSnippets)
    } else if (handle.kind === 'file' && name.endsWith('.md')) {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const content = await file.text()
        const snippet = parseMarkdownFile(content, name, currentPath, file.lastModified)
        if (snippet) snippets.push(snippet)
      } catch {
        // skip unreadable files
      }
    }
  }

  return snippets
}

/** 解析 Markdown 文件为 Snippet */
function parseMarkdownFile(
  content: string,
  filename: string,
  folderPath: string,
  lastModified: number
): Snippet | null {
  const { meta, body } = parseFrontmatter(content)

  // 文件夹名
  const folder = meta.folder || folderPath || ''

  // 生成稳定 ID
  const filePath = folderPath ? `${folderPath}/${filename}` : filename
  const id = `obsidian-${simpleHash(filePath)}`

  // 提取标题
  const title = meta.title || filename.replace(/\.md$/, '')

  // 从 body 提取问题和回答
  let question = ''
  let answer = body

  const qMatch = body.match(/##\s*问题\s*\n([\s\S]*?)(?=\n##|$)/)
  const aMatch = body.match(/##\s*回答\s*\n([\s\S]*?)(?=\n##|$)/)
  if (qMatch) question = qMatch[1].trim()
  if (aMatch) answer = aMatch[1].trim()

  // 标签
  let tags: string[] = []
  if (Array.isArray(meta.tags)) {
    tags = meta.tags
  } else if (typeof meta.tags === 'string') {
    tags = meta.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
  }

  // 时间戳
  const timestamp = meta.created || meta.date || new Date(lastModified).toISOString()

  return {
    id,
    title,
    question: question || 'Obsidian 导入',
    answer,
    contentHtml: '',
    source: meta.source || 'Obsidian',
    folder,
    tags,
    timestamp,
    url: meta.url || '',
    isFavourite: meta.favourite === true,
    cloudStatus: 'none',
    media: { images: [], tables: [] },
  }
}

/** 解析 YAML frontmatter */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const fmText = match[1]
  const body = match[2].trim()
  const meta: Record<string, any> = {}

  for (const line of fmText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes(':')) continue

    const colonIdx = trimmed.indexOf(':')
    const key = trimmed.slice(0, colonIdx).trim()
    let value: any = trimmed.slice(colonIdx + 1).trim()

    // 去引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // 数组 [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1)
        .split(',')
        .map((v: string) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }

    // 布尔
    if (value === 'true') value = true
    if (value === 'false') value = false

    meta[key] = value
  }

  return { meta, body }
}

/** 简单哈希 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return Math.abs(hash).toString(16).slice(0, 12)
}
