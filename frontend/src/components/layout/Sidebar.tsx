import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, AlertTriangle, Globe, Bell, BarChart2,
  Settings, LogOut, Radio, Users, Key, Wrench, ShieldCheck, Webhook,
  FolderOpen, Building2, TrendingUp, Target, Phone, BookOpen,
  Cpu, Lock, DollarSign, ChevronDown, ChevronsDownUp, ChevronsUpDown
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Overview'     },
  { to: '/monitors',     icon: Activity,        label: 'Monitors'     },
  { to: '/incidents',    icon: AlertTriangle,   label: 'Incidents'    },
  { to: '/status-pages', icon: Globe,           label: 'Status Pages' },
  { to: '/notifications',icon: Bell,            label: 'Alerts'       },
  { to: '/reports',      icon: BarChart2,       label: 'Reports'      },
]

const observabilityItems = [
  { to: '/apm',         icon: Cpu,          label: 'APM'          },
  { to: '/sla',         icon: Target,       label: 'SLA / SLO'    },
  { to: '/oncall',      icon: Phone,        label: 'On-Call'      },
  { to: '/runbooks',    icon: BookOpen,     label: 'Runbooks'     },
]

const orgItems = [
  { to: '/teams',        icon: Building2,    label: 'Organizations' },
  { to: '/projects',     icon: FolderOpen,   label: 'Projects'      },
  { to: '/org-analytics',icon: TrendingUp,   label: 'Analytics'     },
  { to: '/maintenance',  icon: Wrench,       label: 'Maintenance'   },
  { to: '/members',      icon: Users,        label: 'Members'       },
  { to: '/compliance',   icon: Lock,         label: 'Compliance'    },
  { to: '/costs',        icon: DollarSign,   label: 'Cost Monitor'  },
]

const devItems = [
  { to: '/api-keys',    icon: Key,           label: 'API Keys'   },
  { to: '/webhooks',    icon: Webhook,       label: 'Webhooks'   },
  { to: '/audit-logs',  icon: ShieldCheck,   label: 'Audit Logs' },
]

const sections = [
  { key: 'observability', title: 'Observability', items: observabilityItems },
  { key: 'organization',  title: 'Organization',  items: orgItems },
  { key: 'developer',     title: 'Developer',      items: devItems },
]

function NavItem({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
      <Icon className="w-4 h-4 flex-shrink-0" />{label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  // All sections expanded by default; master button collapses/expands all.
  const [open, setOpen] = useState<Record<string, boolean>>({
    observability: true, organization: true, developer: true,
  })
  const allOpen = Object.values(open).every(Boolean)

  const toggle = (key: string) => setOpen(p => ({ ...p, [key]: !p[key] }))
  const toggleAll = () => {
    const next = !allOpen
    setOpen({ observability: next, organization: next, developer: next })
  }

  return (
    <aside className="w-60 h-screen app-sidebar flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-5 app-divider-b">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold app-title text-lg tracking-tight">Uptime</span>
        </div>
      </div>

      {/* Org selector */}
      <div className="px-3 py-3 app-divider-b">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--surface-hover)] transition-colors text-left focus-ring">
          <div className="w-7 h-7 bg-primary-600/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400">
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium app-title truncate">{user?.name || 'Acme Inc.'}</p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto sidebar-scroll space-y-3">
        {/* Main */}
        <div className="space-y-0.5">
          {navItems.map(item => <NavItem key={item.to} {...item} />)}
        </div>

        {/* Master expand/collapse — the push-down button */}
        <button
          onClick={toggleAll}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-subtle hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          title={allOpen ? 'Collapse all sections' : 'Show all features'}
        >
          <span className="uppercase tracking-wider">{allOpen ? 'Collapse all' : 'Show all features'}</span>
          {allOpen ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
        </button>

        {/* Collapsible sections */}
        {sections.map(({ key, title, items }) => (
          <div key={key}>
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-3 mb-1.5 text-xs font-semibold text-subtle uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors"
            >
              {title}
              <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform duration-200', !open[key] && '-rotate-90')} />
            </button>
            <div className={clsx('space-y-0.5 overflow-hidden transition-all duration-200', open[key] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0')}>
              {items.map(item => <NavItem key={item.to} {...item} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 app-divider-t space-y-0.5">
        <NavLink to="/settings" className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
          <Settings className="w-4 h-4 flex-shrink-0" />Settings
        </NavLink>
        <button onClick={logout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut className="w-4 h-4 flex-shrink-0" />Sign Out
        </button>
      </div>
    </aside>
  )
}
