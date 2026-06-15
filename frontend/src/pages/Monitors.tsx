import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Plus, Pause, Play, Trash2, ExternalLink, Clock, RefreshCw } from 'lucide-react'
import { monitorsApi, type Monitor } from '../api/monitors'
import Header from '../components/layout/Header'
import AddMonitorModal from '../components/monitors/AddMonitorModal'
import clsx from 'clsx'

function StatusBadge({ status }: { status: string }) {
  const classes = {
    up: 'badge-up',
    down: 'badge-down',
    paused: 'badge-paused',
    pending: 'badge-pending',
  }
  const labels = { up: '● UP', down: '● DOWN', paused: '⏸ PAUSED', pending: '○ PENDING' }
  return <span className={classes[status as keyof typeof classes] || 'badge-pending'}>{labels[status as keyof typeof labels] || status}</span>
}

export default function Monitors() {
  const [addOpen, setAddOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'up' | 'down' | 'paused'>('all')
  const qc = useQueryClient()

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => monitorsApi.list().then(r => r.data),
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

  const filtered = monitors.filter(m => filter === 'all' || m.current_status === filter || (filter === 'paused' && m.is_paused))

  const counts = {
    all: monitors.length,
    up: monitors.filter(m => m.current_status === 'up').length,
    down: monitors.filter(m => m.current_status === 'down').length,
    paused: monitors.filter(m => m.is_paused).length,
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="Monitors" action={{ label: 'Add Monitor', onClick: () => setAddOpen(true) }} />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
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
              {/* Status indicator */}
              <div className={clsx(
                'w-3 h-3 rounded-full flex-shrink-0',
                m.current_status === 'up' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                m.current_status === 'down' ? 'bg-red-500 shadow-lg shadow-red-500/50 animate-pulse' :
                'bg-amber-500'
              )} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-white text-sm truncate">{m.monitor_name}</h3>
                  <StatusBadge status={m.is_paused ? 'paused' : m.current_status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <a href={m.target_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary-400 flex items-center gap-1 truncate max-w-xs">
                    {m.target_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.interval >= 60 ? `${m.interval / 60}m` : `${m.interval}s`}</span>
                  <span className="uppercase text-slate-600 font-medium">{m.monitor_type}</span>
                </div>
              </div>

              {/* Uptime bar */}
              <div className="hidden lg:flex items-center gap-1 w-40">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className={clsx('uptime-bar', m.current_status === 'up' ? 'bg-green-500/70' : i > 27 ? 'bg-red-500' : 'bg-green-500/70')} />
                ))}
              </div>

              {/* Uptime % */}
              <div className="text-right flex-shrink-0 hidden md:block">
                <p className={clsx('text-lg font-bold', parseFloat(m.uptime_percentage) >= 99 ? 'text-green-400' : 'text-amber-400')}>
                  {m.uptime_percentage}%
                </p>
                <p className="text-xs text-slate-500">30 day</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
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
    </div>
  )
}
