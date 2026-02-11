import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'artsky-theme'
export type ThemeMode = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ignore
  }
  return 'system'
}

function getResolved(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    /* ignore */
  }
  return 'dark'
}

const THEME_COLOR_LIGHT = '#ebeae6'
const THEME_COLOR_DARK = '#0f0f1a'

function setThemeColorMeta(resolved: 'light' | 'dark') {
  try {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'light' ? THEME_COLOR_LIGHT : THEME_COLOR_DARK)
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getStored)
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => getResolved(theme))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore
    }
    const next = getResolved(theme)
    setResolved(next)
    document.documentElement.setAttribute('data-theme', next)
    setThemeColorMeta(next)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next = getResolved('system')
      setResolved(next)
      document.documentElement.setAttribute('data-theme', next)
      setThemeColorMeta(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
    const next = getResolved(mode)
    setResolved(next)
    document.documentElement.setAttribute('data-theme', next)
    setThemeColorMeta(next)
  }, [])

  const value: ThemeContextValue = { theme, setTheme, resolved }
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
