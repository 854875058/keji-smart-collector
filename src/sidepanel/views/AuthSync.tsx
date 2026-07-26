import React, { useState, useEffect, useCallback } from 'react'
import type { Snippet, AIUsage } from '../../lib/types'
import { storage } from '../../lib/storage'
import { createSupabaseClient, mapUser } from '../../lib/supabase'
import { fetchUsage, PRO_URL, RESET_PASSWORD_URL, SITE_URL } from '../../lib/aiProxy'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Cloud, LogIn, LogOut, UserPlus, Loader2, CheckCircle, AlertCircle,
  RefreshCw, Upload, Download, Globe, Crown, ExternalLink,
} from 'lucide-react'

/** 在新标签页打开外部链接（侧边栏里不能直接跳转） */
function openExternal(url: string) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

interface Props {
  snippets: Snippet[]
  showToast: (type: 'success' | 'error', message: string) => void
}

interface UserInfo {
  id: string
  email: string
  displayName: string
  identifier: string
}

export function AuthSync({ snippets, showToast }: Props) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string>('')
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<AIUsage | null>(null)

  // 初始化：检查已有 session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = createSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(mapUser(session.user))
          // 登录后拉取当日 AI 免费额度
          fetchUsage().then(setUsage).catch(() => undefined)
        }
      } catch {
        // 忽略初始化错误
      }
    }
    checkSession()

    // 读取上次同步时间
    chrome.storage.local.get('lastCloudSyncTime', (result) => {
      if (result.lastCloudSyncTime) setLastSyncTime(result.lastCloudSyncTime)
    })
  }, [])

  // 邮箱密码登录
  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('请输入邮箱和密码')
      return
    }
    setError('')
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error: authError } = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password })

      if (authError) {
        setError(authError.message)
        return
      }
      if (data.user) {
        setUser(mapUser(data.user))
        showToast('success', mode === 'login' ? '登录成功' : '注册成功')
        setPassword('')
      }
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  // Google OAuth 登录
  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error: urlError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: chrome.identity.getRedirectURL(),
        },
      })
      if (urlError || !data.url) {
        setError(urlError?.message || '获取 OAuth URL 失败')
        setLoading(false)
        return
      }

      // 使用 chrome.identity.launchWebAuthFlow
      const redirectUrl = await chrome.identity.launchWebAuthFlow(
        { url: data.url, interactive: true },
      )
      if (!redirectUrl) {
        setError('OAuth 登录已取消')
        setLoading(false)
        return
      }

      // 从 redirect URL 提取 tokens
      const url = new URL(redirectUrl)
      const hashParams = new URLSearchParams(url.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        })
        if (sessionError) {
          setError(sessionError.message)
        } else if (sessionData.session?.user) {
          setUser(mapUser(sessionData.session.user))
          showToast('success', 'Google 登录成功')
        }
      } else {
        // 尝试从 query params 获取 code (PKCE flow)
        const code = url.searchParams.get('code')
        if (code) {
          const { data: exchangeData, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
          } else if (exchangeData.session?.user) {
            setUser(mapUser(exchangeData.session.user))
            showToast('success', 'Google 登录成功')
          }
        } else {
          setError('未能从 OAuth 回调中获取认证信息')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Google 登录失败')
    } finally {
      setLoading(false)
    }
  }

  // 登出
  const handleLogout = async () => {
    try {
      const supabase = createSupabaseClient()
      await supabase.auth.signOut()
      setUser(null)
      setUsage(null)
      showToast('success', '已退出登录')
    } catch (err: any) {
      showToast('error', '退出失败')
    }
  }

  // 同步笔记到云端
  const handleSyncToCloud = async () => {
    if (!user) return
    setSyncing(true)
    setSyncProgress({ current: 0, total: snippets.length })
    try {
      const supabase = createSupabaseClient()
      let synced = 0
      const batchSize = 10

      for (let i = 0; i < snippets.length; i += batchSize) {
        const batch = snippets.slice(i, i + batchSize)
        const rows = batch.map((s) => ({
          id: s.id,
          user_id: user.id,
          payload: s,
          updated_at: new Date().toISOString(),
        }))

        const { error } = await supabase
          .from('snippets')
          .upsert(rows, { onConflict: 'id' })

        if (error) {
          showToast('error', `同步失败: ${error.message}`)
          setSyncing(false)
          setSyncProgress(null)
          return
        }
        synced += batch.length
        setSyncProgress({ current: synced, total: snippets.length })
      }

      // 更新本地笔记的 cloudStatus
      for (const s of snippets) {
        await storage.updateSnippet(s.id, { cloudStatus: 'synced' })
      }

      const now = new Date().toLocaleString('zh-CN')
      setLastSyncTime(now)
      await chrome.storage.local.set({ lastCloudSyncTime: now })
      showToast('success', `已同步 ${synced} 条笔记到云端`)
    } catch (err: any) {
      showToast('error', `同步出错: ${err.message}`)
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  // 从云端拉取笔记
  const handleSyncFromCloud = async () => {
    if (!user) return
    setSyncing(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from('snippets')
        .select('payload, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) {
        showToast('error', `拉取失败: ${error.message}`)
        return
      }

      if (!data || data.length === 0) {
        showToast('success', '云端暂无笔记')
        return
      }

      const localSnippets = await storage.getSnippets()
      const localIds = new Set(localSnippets.map((s) => s.id))
      let imported = 0

      for (const row of data) {
        const snippet = row.payload as Snippet
        if (localIds.has(snippet.id)) {
          // 本地已存在，跳过（本地优先）
          continue
        }
        await storage.saveSnippet({ ...snippet, cloudStatus: 'synced' })
        imported++
      }

      const now = new Date().toLocaleString('zh-CN')
      setLastSyncTime(now)
      await chrome.storage.local.set({ lastCloudSyncTime: now })
      showToast('success', `从云端导入 ${imported} 条新笔记`)
    } catch (err: any) {
      showToast('error', `拉取出错: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // 未登录状态
  if (!user) {
    return (
      <div className="p-6 space-y-4 max-w-md mx-auto">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">云同步</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          登录后可将笔记同步到云端，多设备共享
        </p>

        {/* 模式切换 */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => { setMode('login'); setError('') }}
            className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setError('') }}
            className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
              mode === 'register'
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            注册
          </button>
        </div>

        {/* 邮箱密码表单 */}
        <div className="space-y-3">
          <Input
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
          />
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button className="w-full" onClick={handleEmailAuth} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : mode === 'login' ? (
              <LogIn className="h-4 w-4 mr-2" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            {mode === 'login' ? '登录' : '注册'}
          </Button>
          {mode === 'login' && (
            <button
              onClick={() => openExternal(RESET_PASSWORD_URL)}
              className="w-full text-xs text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              忘记密码？
            </button>
          )}
        </div>

        {/* 分隔线 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-400">或</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Google 登录 */}
        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
          <Globe className="h-4 w-4 mr-2" />
          使用 Google 账号登录
        </Button>
      </div>
    )
  }

  // 已登录状态
  const dirtyCount = snippets.filter((s) => s.cloudStatus === 'dirty').length

  return (
    <div className="p-6 space-y-4 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">云同步</h3>

      {/* 用户信息 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {user.displayName}
            </div>
            <div className="text-xs text-slate-400 truncate">{user.email}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} title="退出登录">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* AI 免费额度与 Pro */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              AI 免费额度
            </span>
          </div>
          <button
            onClick={() => fetchUsage().then(setUsage).catch(() => undefined)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
            title="刷新额度"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {usage ? (
          <>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 dark:text-slate-400">
                今日已用 {usage.used} / {usage.limit}
              </span>
              <span className="text-slate-400">每日 0 点刷新</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usage.used >= usage.limit ? 'bg-red-500' : 'bg-emerald-500'
                }`}
                style={{
                  width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%`,
                }}
              />
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400">额度信息暂不可用</div>
        )}
        <Button
          variant="outline"
          className="w-full mt-3"
          onClick={() => openExternal(PRO_URL)}
        >
          <Crown className="h-4 w-4 mr-2" />
          升级 Pro 获取更多额度
        </Button>
        <button
          onClick={() => openExternal(SITE_URL)}
          className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          访问可记官网
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* 同步状态 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">同步状态</div>
            <div className="text-xs text-slate-400">
              {lastSyncTime ? `上次同步: ${lastSyncTime}` : '尚未同步'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {dirtyCount > 0 ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {dirtyCount} 条待同步
                </span>
              </>
            ) : snippets.length > 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400">已同步</span>
              </>
            ) : (
              <span className="text-xs text-slate-400">暂无笔记</span>
            )}
          </div>
        </div>

        {/* 同步进度 */}
        {syncProgress && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>同步中...</span>
              <span>{syncProgress.current}/{syncProgress.total}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 同步按钮 */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleSyncToCloud} disabled={syncing || snippets.length === 0}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            推送到云端
          </Button>
          <Button variant="outline" onClick={handleSyncFromCloud} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            从云端拉取
          </Button>
        </div>
      </div>

      {/* 笔记统计 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{snippets.length}</div>
          <div className="text-[10px] text-slate-400">总计</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {snippets.filter((s) => s.cloudStatus === 'synced').length}
          </div>
          <div className="text-[10px] text-slate-400">已同步</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{dirtyCount}</div>
          <div className="text-[10px] text-slate-400">待同步</div>
        </div>
      </div>
    </div>
  )
}
