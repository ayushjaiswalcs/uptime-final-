import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark'

export const themeTokens = {
  light: {
    grid: '#e2e8f0',
    tick: '#64748b',
    tooltipBg: '#ffffff',
    tooltipBorder: '#dbe3ef',
    tooltipText: '#0f172a',
    primary: '#4f46e5',
    success: '#16a34a',
    muted: '#f1f5f9',
  },
  dark: {
    grid: '#1e293b',
    tick: '#94a3b8',
    tooltipBg: '#1e293b',
    tooltipBorder: '#334155',
    tooltipText: '#f8fafc',
    primary: '#818cf8',
    success: '#22c55e',
    muted: '#334155',
  },
} as const

interface ThemeContextValue {
  theme: Theme
  tokens: typeof themeTokens[Theme]
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('uptime-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    root.style.colorScheme = theme
    localStorage.setItem('uptime-theme', theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      tokens: themeTokens[theme],
      setTheme,
      toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
