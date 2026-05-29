import type { Snippet } from '../lib/types'
import { storage } from '../lib/storage'

/** 从 Markdown 文件解析 Snippet */
function parseMarkdownFile(
  content: string,
  filename: string,
  folderPath: string,
  lastModified: number
): Snippet | null {
  const { meta, body } = parseFrontmatter(content)
  const folder = meta.folder || folderPath || ''
  const filePath = folderPath ? `${folderPath}/${filename}` : filename
  const id = `obsidian-${simpleHash(filePath)}`
  const title = meta.title || filename.replace(/\.md$/, '')

  let question = ''
  let answer = body
  const qMatch = body.match(/##\s*问题\s*\n([\s\S]*?)(?=\n##|$)/)
  const aMatch = body.match(/##\s*回答\s*\n([\s\S]*?)(?=\n##|$)/)
  if (qMatch) question = qMatch[1].trim()
  if (aMatch) answer = aMatch[1].trim()

  let tags: string[] = []
  if (Array.isArray(meta.tags)) tags = meta.tags
  else if (typeof meta.tags === 'string') tags = meta.tags.split(',').map((t: string) => t.trim()).filter(Boolean)

  const timestamp = meta.created || meta.date || new Date(lastModified).toISOString()

  return {
    id, title,
    question: question || 'Obsidian 导入',
    answer,
    contentHtml: '',
    source: meta.source || 'Obsidian',
    folder, tags, timestamp,
    url: meta.url || '',
    isFavourite: meta.favourite === true,
    cloudStatus: 'none',
    media: { images: [], tables: [] },
  }
}

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((v: string) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
    if (value === 'true') value = true
    if (value === 'false') value = false
    meta[key] = value
  }
  return { meta, body }
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash).toString(16).slice(0, 12)
}

const SKIP_DIRS = new Set(['.obsidian', '.trash', 'attachments', '.git', 'node_modules'])

/** 递归扫描目录 */
async function scanDir(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string = ''
): Promise<Snippet[]> {
  const snippets: Snippet[] = []
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue
      const subPath = currentPath ? `${currentPath}/${name}` : name
      snippets.push(...await scanDir(handle as FileSystemDirectoryHandle, subPath))
    } else if (handle.kind === 'file' && name.endsWith('.md')) {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const content = await file.text()
        const snippet = parseMarkdownFile(content, name, currentPath, file.lastModified)
        if (snippet) snippets.push(snippet)
      } catch {}
    }
  }
  return snippets
}

/** 将 Snippet 写回 Obsidian 文件 */
async function writeSnippetToFile(
  snippet: Snippet,
  vaultHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // 导航到文件夹
    let dir = vaultHandle
    const folderParts = (snippet.folder || '').split('/').filter(Boolean)
    for (const part of folderParts) {
      dir = await dir.getDirectoryHandle(part, { create: true })
    }

    // 生成文件名
    const safeName = snippet.title.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim() + '.md'
    const fileHandle = await dir.getFileHandle(safeName, { create: true })
    const writable = await fileHandle.createWritable()

    // 生成 Markdown 内容
    const markdown = generateMarkdown(snippet)
    await writable.write(markdown)
    await writable.close()
    return true
  } catch (err) {
    console.error('[keji] 写入文件失败:', err)
    return false
  }
}

function generateMarkdown(s: Snippet): string {
  const lines: string[] = ['---']
  lines.push(`title: "${(s.title || '').replace(/"/g, '\\"')}"`)
  lines.push(`source: ${s.source || 'Unknown'}`)
  lines.push(`url: "${s.url || ''}"`)
  lines.push(`created: ${s.timestamp || ''}`)
  if (s.tags && s.tags.length) lines.push(`tags: [${s.tags.map(t => `"${t}"`).join(', ')}]`)
  if (s.folder) lines.push(`folder: "${s.folder}"`)
  lines.push(`keji_id: "${s.id}"`)
  if (s.isFavourite) lines.push('favourite: true')
  lines.push('---', '')
  lines.push('## 问题', s.question || '', '')
  lines.push('## 回答', s.answer || '', '')
  lines.push('---', '*由可记智能收藏助手同步*')
  return lines.join('\n')
}

// ── 持久化目录句柄（IndexedDB）─────────────────────────

const DB_NAME = 'keji-obsidian-sync'
const STORE_NAME = 'handles'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveHandle(key: string, handle: FileSystemDirectoryHandle) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(handle, key)
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

// ── 公开 API ──────────────────────────────────────────

export interface SyncResult {
  imported: number
  updated: number
  deleted: number
  folders: number
  errors: string[]
}

/** 选择并保存 Obsidian Vault 目录 */
export async function selectVault(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await saveHandle('vault', handle)
    return handle
  } catch (err: any) {
    if (err.name === 'AbortError') return null
    throw err
  }
}

/** 获取已保存的 Vault 目录句柄 */
export async function getSavedVault(): Promise<FileSystemDirectoryHandle | null> {
  return loadHandle('vault')
}

/** 从 Obsidian 同步到可记（增量） */
export async function syncFromObsidian(
  vaultHandle: FileSystemDirectoryHandle,
  options?: { subfolder?: string }
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, updated: 0, deleted: 0, folders: 0, errors: [] }

  // 扫描 Vault
  let scanTarget = vaultHandle
  if (options?.subfolder) {
    try { scanTarget = await vaultHandle.getDirectoryHandle(options.subfolder) } catch {}
  }
  const remoteSnippets = await scanDir(scanTarget)

  // 获取本地笔记
  const localSnippets = await storage.getSnippets()
  const localMap = new Map(localSnippets.map(s => [s.id, s]))

  // 同步文件夹结构
  const folderSet = new Set<string>()
  for (const s of remoteSnippets) {
    if (s.folder) {
      const topFolder = s.folder.split('/')[0]
      if (topFolder) folderSet.add(topFolder)
    }
  }
  for (const f of folderSet) await storage.addFolder(f)
  result.folders = folderSet.size

  // 增量同步
  for (const remote of remoteSnippets) {
    const local = localMap.get(remote.id)
    if (!local) {
      // 新增
      await storage.saveSnippet(remote)
      result.imported++
    } else if (local.cloudStatus !== 'dirty') {
      // 更新（本地没有修改过才覆盖）
      await storage.updateSnippet(remote.id, {
        title: remote.title,
        answer: remote.answer,
        contentHtml: remote.contentHtml,
        tags: remote.tags,
        folder: remote.folder,
      })
      result.updated++
    }
    localMap.delete(remote.id)
  }

  // 检查本地存在但远程已删除的（可选，这里不自动删除）
  return result
}

/** 从可记同步到 Obsidian（写回） */
export async function syncToObsidian(
  vaultHandle: FileSystemDirectoryHandle,
  snippets: Snippet[]
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0
  for (const snippet of snippets) {
    const ok = await writeSnippetToFile(snippet, vaultHandle)
    if (ok) success++
    else failed++
  }
  return { success, failed }
}

// ── 自动同步管理器 ────────────────────────────────────

type SyncListener = (result: SyncResult) => void

class AutoSyncManager {
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: Set<SyncListener> = new Set()
  private vaultHandle: FileSystemDirectoryHandle | null = null
  private intervalMs: number = 60_000 // 默认 1 分钟
  private isSyncing: boolean = false

  /** 初始化：恢复 Vault 句柄 */
  async init() {
    this.vaultHandle = await getSavedVault()
  }

  /** 设置同步间隔（秒） */
  setInterval(seconds: number) {
    this.intervalMs = seconds * 1000
    if (this.timer) {
      this.stop()
      this.start()
    }
  }

  /** 启动自动同步 */
  start() {
    if (this.timer) return
    if (!this.vaultHandle) return

    // 立即执行一次
    this.runSync()

    // 定时执行
    this.timer = setInterval(() => this.runSync(), this.intervalMs)
  }

  /** 停止自动同步 */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 是否正在运行 */
  get running(): boolean {
    return this.timer !== null
  }

  /** 是否有 Vault */
  get hasVault(): boolean {
    return this.vaultHandle !== null
  }

  /** 更新 Vault 句柄 */
  setVault(handle: FileSystemDirectoryHandle) {
    this.vaultHandle = handle
  }

  /** 监听同步结果 */
  onSync(listener: SyncListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 手动触发同步 */
  async runSync(): Promise<SyncResult | null> {
    if (this.isSyncing || !this.vaultHandle) return null
    this.isSyncing = true

    try {
      const result = await syncFromObsidian(this.vaultHandle)
      this.listeners.forEach((l) => l(result))
      return result
    } catch (err) {
      console.error('[keji] 自动同步失败:', err)
      return null
    } finally {
      this.isSyncing = false
    }
  }
}

export const autoSync = new AutoSyncManager()
