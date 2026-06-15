import { TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: string; positive: boolean }
  accent?: 'red' | 'green' | 'blue' | 'amber'
}

export default function StatsCard({ title, value, subtitle, trend, accent }: StatsCardProps) {
  const accentClasses = {
    red: 'text-red-400',
    green: 'text-green-400',
    blue: 'text-primary-400',
    amber: 'text-amber-400',
  }

  return (
    <div className="stat-card">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      <p className={clsx('text-3xl font-bold', accent ? accentClasses[accent] : 'text-white')}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      {trend && (
        <div className={clsx('flex items-center gap-1 text-xs font-medium', trend.positive ? 'text-green-400' : 'text-red-400')}>
          {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend.value}
        </div>
      )}
    </div>
  )
}
