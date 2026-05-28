import React, { useState, useEffect } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { FolderOpen, Download, Check, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  onImportComplete: () => void
  showToast: (type: 'success' | 'error', message: string) => void
}

const NATIVE_HOST_NAME = 'com.keji.obsidian'
const DEFAULT_VAULT_PATH = 'E:\\文档'

export function ImportObsidian({ onImportComplete, showToast }: Props) {
  const [vaultPath, setVaultPath] = useState(DEFAULT_VAULT_PATH)
  const [folders, setFolders] = useState<{ name: string; mdCount: number }[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [preview, setPreview] = useState<Snippet[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // 连接 Native Host 并加载文件夹
  useEffect(() => {
    connectAndLoadFolders()
  }, [])

  const connectAndLoadFolders = async () => {
    setIsLoading(true)
    try {
      const result = await sendNativeMessage({
        action: 'list_vault_folders',
        payload: { path: vaultPath },
      })
      if (result.success) {
        setIsConnected(true)
        setFolders(result.data.folders || [])
      } else {
        showToast('error', result.error || '无法连接到 Obsidian')
      }
    } catch (err: any) {
      showToast('error', `Native Host 连接失败: ${err.message}。请先运行 install.bat 注册。`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = async () => {
    setIsLoading(true)
    try {
      const result = await sendNativeMessage({
        action: 'import_vault',
        payload: {
          path: vaultPath,
          subfolder: selectedFolder,
        },
      })
      if (result.success) {
        setPreview(result.data.snippets || [])
        showToast('success', `找到 ${result.data.total} 条笔记`)
      } else {
        showToast('error', result.error || '扫描失败')
      }
    } catch (err: any) {
      showToast('error', err.message)
    } finally {
      setIsLoading(false)
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
        // 检查是否已存在（通过 keji_id）
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
        // 跳过失败的
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
        扫描你的 Obsidian Vault，将 Markdown 笔记导入到可记
      </p>

      {/* Vault 路径 */}
      <div>
        <label className="text-xs text-slate-600 mb-1 block">Obsidian Vault 路径</label>
        <div className="flex gap-2">
          <Input
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            placeholder="E:\文档"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={connectAndLoadFolders}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '连接'}
          </Button>
        </div>
      </div>

      {/* 文件夹选择 */}
      {isConnected && folders.length > 0 && (
        <div>
          <label className="text-xs text-slate-600 mb-1 block">选择文件夹（留空导入全部）</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <button
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedFolder === ''
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
              onClick={() => setSelectedFolder('')}
            >
              <FolderOpen className="inline h-3.5 w-3.5 mr-1.5" />
              全部文件夹
            </button>
            {folders.map((f) => (
              <button
                key={f.name}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedFolder === f.name
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
                onClick={() => setSelectedFolder(f.name)}
              >
                <FolderOpen className="inline h-3.5 w-3.5 mr-1.5" />
                {f.name}
                <span className="ml-2 text-xs text-slate-400">{f.mdCount} 篇</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 预览和导入按钮 */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handlePreview}
          disabled={isLoading || !isConnected}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Download className="h-4 w-4 mr-1.5" />
          )}
          扫描预览
        </Button>
        <Button
          className="flex-1"
          onClick={handleImport}
          disabled={!preview || preview.length === 0 || importing}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Check className="h-4 w-4 mr-1.5" />
          )}
          {importing ? `导入中 ${progress.done}/${progress.total}` : '开始导入'}
        </Button>
      </div>

      {/* 预览列表 */}
      {preview && preview.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-2">
            预览：{preview.length} 条笔记
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {preview.slice(0, 20).map((s) => (
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
            {preview.length > 20 && (
              <div className="text-xs text-slate-400 text-center py-1">
                ...还有 {preview.length - 20} 条
              </div>
            )}
          </div>
        </div>
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

/** 通过 Native Messaging 发送消息（简易实现，不依赖 port 持久连接） */
function sendNativeMessage(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      message,
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(response)
        }
      }
    )
  })
}
