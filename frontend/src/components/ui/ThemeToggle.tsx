import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="theme-toggle fixed bottom-5 right-5 z-50 h-11 w-[5.75rem] rounded-full border shadow-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun className="w-4 h-4" />
        <Moon className="w-4 h-4" />
      </span>
      <span className={`theme-toggle-thumb ${isDark ? 'translate-x-12' : 'translate-x-1'}`} aria-hidden="true">
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </span>
    </button>
  )
}
