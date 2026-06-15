import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { incidentsApi, type Incident } from '../api/incidents'
import Header from '../components/layout/Header'
import clsx from 'clsx'

function formatDuration(start: string, end: string | null): string {
  const diff = ((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s`
  if (diff < 3600) return `${Math.round(diff / 60)}m`
  return `${Math.round(diff / 3600)}h ${Math.round((diff % 3600) / 60)}m`
}

export default function Incidents() {
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'resolved'>('all')
  const qc = useQueryClient()

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => incidentsApi.list(filter === 'all' ? undefined : filter).then(r => r.data),
    refetchInterval: 30_000,
  })

  const resolveMutation = useMutation({
    mutationFn: (id: number) => incidentsApi.resolve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Incidents" />

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(['all', 'ongoing', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
              filter === f ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-card">
          <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No incidents</h3>
          <p className="text-slate-400 text-sm">Everything is running smoothly</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Monitor</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Started</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Error</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={inc.id} className={clsx('border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors', i % 2 === 0 ? '' : 'bg-slate-800/20')}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center text-xs font-bold text-primary-400">
                        {inc.monitor_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="font-medium text-white text-sm">{inc.monitor_name || `Monitor #${inc.monitor_id}`}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={inc.incident_status === 'resolved' ? 'badge-up' : 'badge-down'}>
                      {inc.incident_status === 'resolved' ? '✓ Resolved' : '● Ongoing'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">
                    {new Date(inc.outage_start_time).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDuration(inc.outage_start_time, inc.recovery_time)}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {inc.error_message || '—'}
                  </td>
                  <td className="px-5 py-4">
                    {inc.incident_status === 'ongoing' && (
                      <button
                        onClick={() => resolveMutation.mutate(inc.id)}
                        className="text-xs font-medium text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
