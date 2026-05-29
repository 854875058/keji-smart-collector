import React, { useState, useEffect } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import {
  FolderSync, Download, Upload, Loader2, CheckCircle, AlertCircle, HardDrive, RefreshCw,
} from 'lucide-react'
import {
  selectVault, getSavedVault, syncFromObsidian, syncToObsidian,
  type SyncResult,
} from '../../obsidian/SyncManager'

interface Props {
  snippets: Snippet[]
  showToast: (type: 'success' | 'error', message: string) => void
}

export function SyncObsidian({ snippets, showToast }: Props) {
  const [vaultHandle, setVaultHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [vaultName, setVaultName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [direction, setDirection] = useState<'pull' | 'push' | null>(null)

  // 尝试恢复已保存的目录句柄
  useEffect(() => {
    getSavedVault().then((h) => {
      if (h) {
        setVaultHandle(h)
        setVaultName(h.name)
      }
    })
  }, [])

  const handleSelectVault = async () => {
    const handle = await selectVault()
    if (handle) {
      setVaultHandle(handle)
      setVaultName(handle.name)
      showToast('success', `已选择：${handle.name}`)
    }
  }

  const handlePull = async () => {
    if (!vaultHandle) return
    setSyncing(true)
    setDirection('pull')
    try {
      const result = await syncFromObsidian(vaultHandle)
      setLastResult(result)
      showToast('success',
        `同步完成：${result.imported} 条新增，${result.updated} 条更新，${result.folders} 个目录`
      )
    } catch (err: any) {
      showToast('error', `同步失败：${err.message}`)
    } finally {
      setSyncing(false)
      setDirection(null)
    }
  }

  const handlePush = async () => {
    if (!vaultHandle) return
    setSyncing(true)
    setDirection('push')
    try {
      const result = await syncToObsidian(vaultHandle, snippets)
      showToast('success', `写入完成：${result.success} 条成功，${result.failed} 条失败`)
    } catch (err: any) {
      showToast('error', `写入失败：${err.message}`)
    } finally {
      setSyncing(false)
      setDirection(null)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-lg mx-auto">
      <h3 className="text-lg font-semibold text-slate-900">Obsidian 同步</h3>
      <p className="text-sm text-slate-500">
        与本地 Obsidian Vault 双向同步笔记
      </p>

      {/* Vault 选择 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-slate-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900">
              {vaultName || '未选择 Vault'}
            </div>
            <div className="text-xs text-slate-400">
              {vaultHandle ? '已连接，可进行同步' : '点击右侧按钮选择 Obsidian Vault 文件夹'}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSelectVault}>
            {vaultName ? '更换' : '选择'}
          </Button>
        </div>
      </div>

      {/* 同步操作 */}
      {vaultHandle && (
        <div className="space-y-3">
          {/* 从 Obsidian 拉取 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Download className="h-4 w-4 text-emerald-600" />
                  从 Obsidian 拉取
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  扫描 Vault，将新增和修改的笔记同步到可记
                </div>
              </div>
              <Button
                size="sm"
                onClick={handlePull}
                disabled={syncing}
              >
                {syncing && direction === 'push' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                同步
              </Button>
            </div>
          </div>

          {/* 推送到 Obsidian */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Upload className="h-4 w-4 text-blue-600" />
                  推送到 Obsidian
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  将可记的 {snippets.length} 条笔记写入 Vault
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePush}
                disabled={syncing}
              >
                {syncing && direction === 'pull' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                写入
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 同步结果 */}
      {lastResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 mb-2">
            <CheckCircle className="h-4 w-4" />
            上次同步结果
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-emerald-600">{lastResult.imported}</div>
              <div className="text-[10px] text-emerald-700">新增</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600">{lastResult.updated}</div>
              <div className="text-[10px] text-emerald-700">更新</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600">{lastResult.folders}</div>
              <div className="text-[10px] text-emerald-700">目录</div>
            </div>
          </div>
          {lastResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-600">
              {lastResult.errors.length} 个错误
            </div>
          )}
        </div>
      )}

      {/* 提示 */}
      {!vaultHandle && (
        <div className="text-center py-6 text-slate-400">
          <FolderSync className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">选择 Obsidian Vault 后即可开始同步</p>
        </div>
      )}
    </div>
  )
}
