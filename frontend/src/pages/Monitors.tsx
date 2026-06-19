import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Plus, Pause, Play, Trash2, ExternalLink, Clock, Pencil, BarChart2, Users, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { monitorsApi, type Monitor } from '../api/monitors'
import { useAuth } from '../context/AuthContext'
import Header from '../components/layout/Header'
import AddMonitorModal from '../components/monitors/AddMonitorModal'
import MonitorDetailModal from '../components/monitors/MonitorDetailModal'
import clsx from 'clsx'

function StatusBadge({ status }: { status: string }) {
  const classes = { up: 'badge-up', down: 'badge-down', paused: 'badge-paused', pending: 'badge-pending' }
  const labels = { up: '● UP', down: '● DOWN', paused: '⏸ PAUSED', pending: '○ PENDING' }
  return <span className={classes[status as keyof typeof classes] || 'badge-pending'}>{labels[status as keyof typeof labels] || status}</span>
}

export default function Monitors() {
  const [addOpen, setAddOpen] = useState(false)
  const [editMonitor, setEditMonitor] = useState<Monitor | null>(null)
  const [detailMonitor, setDetailMonitor] = useState<Monitor | null>(null)
  const [filter, setFilter] = useState<'all' | 'up' | 'down' | 'paused'>('all')
  const [showAll, setShowAll] = useState(false)
  const qc = useQueryClient()
  const { user } = useAuth()

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['monitors', showAll],
    queryFn: () => monitorsApi.list(showAll).then(r => r.data),
    refetchInterval: 30_000,
  })

  const pauseMutation = useMutation({
    mutationFn: (id: number) => monitorsApi.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitors'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => monitorsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitors'] }),
  })

  const filtered = monitors.filter(m =>
    filter === 'all' ||
    m.current_status === filter ||
    (filter === 'paused' && m.is_paused)
  )

  const counts = {
    all: monitors.length,
    up: monitors.filter(m => m.current_status === 'up').length,
    down: monitors.filter(m => m.current_status === 'down').length,
    paused: monitors.filter(m => m.is_paused).length,
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="Monitors" action={{ label: 'Add Monitor', onClick: () => setAddOpen(true) }} />

      {/* Filter + All-users toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
          {(['all', 'up', 'down', 'paused'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                filter === f ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Show all monitors toggle — only visible to admin/owner */}
        {isAdmin && (
          <button
            onClick={() => setShowAll(v => !v)}
            className={clsx(
              'flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-medium border transition-all',
              showAll
                ? 'bg-primary-600/20 border-primary-500 text-primary-400'
                : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white'
            )}
          >
            <Users className="w-4 h-4" />
            {showAll ? 'All Users' : 'My Monitors'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-card">
          <Activity className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No monitors yet</h3>
          <p className="text-slate-400 mb-6 text-sm">Add your first monitor to start tracking uptime</p>
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Your First Monitor
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="glass-card p-4 flex items-center gap-4 hover:border-slate-600/70 transition-all">
              {/* Status dot */}
              <div className={clsx(
                'w-3 h-3 rounded-full flex-shrink-0',
                m.current_status === 'up' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                m.current_status === 'down' ? 'bg-red-500 shadow-lg shadow-red-500/50 animate-pulse' :
                'bg-amber-500'
              )} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <Link
                    to={`/monitors/${m.id}`}
                    className="font-semibold text-white text-sm truncate hover:text-primary-400 transition-colors"
                    title="View full detail page"
                  >
                    {m.monitor_name}
                  </Link>
                  <StatusBadge status={m.is_paused ? 'paused' : m.current_status} />
                  {/* Owner badge — only shown in all-users view */}
                  {showAll && m.owner_name && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5" />{m.owner_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <a
                    href={m.target_url.startsWith('http') ? m.target_url : `http://${m.target_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary-400 flex items-center gap-1 truncate max-w-xs"
                  >
                    {m.target_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {m.interval >= 60 ? `${m.interval / 60}m` : `${m.interval}s`}
                  </span>
                  <span className="uppercase text-slate-600 font-medium">{m.monitor_type}</span>
                  {m.escalation_matrix_name && (
                    <Link
                      to={`/escalation/${m.escalation_config_id}`}
                      className="flex items-center gap-1 text-amber-400/80 hover:text-amber-300 transition-colors"
                      title={`Escalation: ${m.escalation_matrix_name}`}
                      onClick={e => e.stopPropagation()}
                    >
                      <Shield className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{m.escalation_matrix_name}</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Real uptime strip — red proportion = actual downtime */}
              <Link
                to={`/monitors/${m.id}`}
                className="hidden lg:flex items-center gap-1 w-40"
                title="View full detail page"
              >
                {(() => {
                  const downBars = Math.round(((100 - parseFloat(m.uptime_percentage || '100')) / 100) * 30)
                  return Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className={clsx('uptime-bar', i >= 30 - downBars ? 'bg-red-500' : 'bg-green-500/70')} />
                  ))
                })()}
              </Link>

              {/* Uptime % */}
              <div className="text-right flex-shrink-0 hidden md:block">
                <p className={clsx('text-lg font-bold', parseFloat(m.uptime_percentage) >= 99 ? 'text-green-400' : 'text-amber-400')}>
                  {m.uptime_percentage}%
                </p>
                <p className="text-xs text-slate-500">5 minutes</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link
                  to={`/monitors/${m.id}`}
                  className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  title="View full detail page"
                >
                  <BarChart2 className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setEditMonitor(m)}
                  className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  title="Edit monitor"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => pauseMutation.mutate(m.id)}
                  className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  title={m.is_paused ? 'Resume' : 'Pause'}
                >
                  {m.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { if (confirm('Delete this monitor?')) deleteMutation.mutate(m.id) }}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddMonitorModal isOpen={addOpen} onClose={() => setAddOpen(false)} />
      <AddMonitorModal
        isOpen={!!editMonitor}
        editMonitor={editMonitor}
        onClose={() => setEditMonitor(null)}
      />
      <MonitorDetailModal monitor={detailMonitor} onClose={() => setDetailMonitor(null)} />
    </div>
  )
}
