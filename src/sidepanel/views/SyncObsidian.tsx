import React, { useState, useEffect } from 'react'
import type { Snippet } from '../../lib/types'
import { storage } from '../../lib/storage'
import { Button } from '../components/ui/button'
import {
  FolderSync, Download, Upload, Loader2, CheckCircle, AlertCircle, HardDrive, RefreshCw,
} from 'lucide-react'
import {
  selectVault, getSavedVault, syncFromObsidian, syncToObsidian, autoSync,
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
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncInterval, setSyncInterval] = useState(60) // 秒
  const [lastSyncTime, setLastSyncTime] = useState<string>('')

  // 初始化：恢复 Vault + 启动自动同步
  useEffect(() => {
    const init = async () => {
      await autoSync.init()
      const h = await getSavedVault()
      if (h) {
        setVaultHandle(h)
        setVaultName(h.name)
        autoSync.setVault(h)
      }
      if (autoSync.running) setAutoSyncEnabled(true)
    }
    init()

    // 监听自动同步结果
    const unsub = autoSync.onSync((result) => {
      setLastResult(result)
      setLastSyncTime(new Date().toLocaleTimeString())
    })

    // 窗口获得焦点时触发同步
    const onFocus = () => { if (autoSync.running) autoSync.runSync() }
    window.addEventListener('focus', onFocus)

    return () => { unsub(); window.removeEventListener('focus', onFocus) }
  }, [])

  const toggleAutoSync = () => {
    if (autoSyncEnabled) {
      autoSync.stop()
      setAutoSyncEnabled(false)
    } else {
      if (!vaultHandle) {
        showToast('error', '请先选择 Vault')
        return
      }
      autoSync.setVault(vaultHandle)
      autoSync.setInterval(syncInterval)
      autoSync.start()
      setAutoSyncEnabled(true)
      showToast('success', `已开启自动同步（每 ${syncInterval} 秒）`)
    }
  }

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
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Obsidian 同步</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        与本地 Obsidian Vault 双向同步笔记
      </p>

      {/* Vault 选择 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {vaultName || '未选择 Vault'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {vaultHandle ? '已连接，可进行同步' : '点击右侧按钮选择 Obsidian Vault 文件夹'}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSelectVault}>
            {vaultName ? '更换' : '选择'}
          </Button>
        </div>
      </div>

      {/* 自动同步 */}
      {vaultHandle && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">自动同步</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {autoSyncEnabled
                  ? `已开启，每 ${syncInterval} 秒扫描一次${lastSyncTime ? `，上次：${lastSyncTime}` : ''}`
                  : '开启后自动检测 Obsidian 文件变更'}
              </div>
            </div>
            <button
              onClick={toggleAutoSync}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                autoSyncEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          {!autoSyncEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">间隔：</span>
              <select
                className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
              >
                <option value={30}>30 秒</option>
                <option value={60}>1 分钟</option>
                <option value={180}>3 分钟</option>
                <option value={300}>5 分钟</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* 同步操作 */}
      {vaultHandle && (
        <div className="space-y-3">
          {/* 从 Obsidian 拉取 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <Download className="h-4 w-4 text-emerald-600" />
                  从 Obsidian 拉取
                </div>
                <div className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">
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
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <Upload className="h-4 w-4 text-blue-600" />
                  推送到 Obsidian
                </div>
                <div className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">
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
        <div className="text-center py-6 text-slate-400 dark:text-slate-500">
          <FolderSync className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">选择 Obsidian Vault 后即可开始同步</p>
        </div>
      )}
    </div>
  )
}
