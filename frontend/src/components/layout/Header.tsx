import { Bell, Search, Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Link } from 'react-router-dom'

interface HeaderProps {
  title: string
  action?: { label: string; onClick: () => void }
  /** Optional content rendered on the right-hand side, before the search box. */
  extra?: React.ReactNode
}

export default function Header({ title, action, extra }: HeaderProps) {
  const { user } = useAuth()

  return (
    <header className="h-16 app-header flex items-center justify-between px-6 sticky top-0 z-30">
      <h1 className="text-lg font-semibold app-title">{title}</h1>
      <div className="flex items-center gap-3">
        {extra}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search monitors..."
            className="input-field text-sm pl-9 pr-4 py-2 w-56"
          />
        </div>
        {action && (
          <button onClick={action.onClick} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            {action.label}
          </button>
        )}
        <button className="icon-button relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <Link to="/settings" className="flex items-center gap-2 pl-2 app-divider-l">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium app-title leading-none">{user?.name}</p>
            <p className="text-xs text-muted mt-0.5">{user?.email}</p>
          </div>
        </Link>
      </div>
    </header>
  )
}
