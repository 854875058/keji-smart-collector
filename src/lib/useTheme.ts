import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark'

function getSystemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

/**
 * 主题管理 hook
 * - 优先读取 chrome.storage.local 中的 theme 键
 * - 未设置时跟随系统 prefers-color-scheme
 * - 切换时同时写入 storage 和 DOM class
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getSystemTheme)

  // 初始化：从 storage 读取主题
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const result = await chrome.storage.local.get('theme')
        const saved = result.theme as Theme | undefined
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved)
          applyTheme(saved)
        } else {
          const sys = getSystemTheme()
          setTheme(sys)
          applyTheme(sys)
        }
      } catch {
        const sys = getSystemTheme()
        setTheme(sys)
        applyTheme(sys)
      }
    }
    loadTheme()

    // 监听系统主题变化（仅在用户未手动设置时生效）
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = async () => {
      try {
        const result = await chrome.storage.local.get('theme')
        if (!result.theme) {
          const sys = getSystemTheme()
          setTheme(sys)
          applyTheme(sys)
        }
      } catch {
        // ignore
      }
    }
    mediaQuery.addEventListener('change', handleSystemChange)
    return () => mediaQuery.removeEventListener('change', handleSystemChange)
  }, [])

  // 切换主题
  const toggleTheme = useCallback(async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    try {
      await chrome.storage.local.set({ theme: next })
    } catch {
      // ignore
    }
  }, [theme])

  return { theme, toggleTheme }
}
