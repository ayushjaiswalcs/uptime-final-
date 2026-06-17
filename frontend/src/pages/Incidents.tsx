import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle, Clock, TrendingDown, TrendingUp,
  User, ChevronDown, ChevronRight, FileText, Activity, Zap
} from 'lucide-react'
import { incidentsApi, type Incident } from '../api/incidents'
import Header from '../components/layout/Header'
import clsx from 'clsx'

const SEVERITY_CONFIG = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-500' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-500' },
  medium:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', dot: 'bg-yellow-500' },
  low:      { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', dot: 'bg-blue-500' },
}

function formatDuration(start: string, end: string | null): string {
  const diff = ((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s`
  if (diff < 3600) return `${Math.round(diff / 60)}m`
  return `${Math.round(diff / 3600)}h ${Math.round((diff % 3600) / 60)}m`
}

function MetricCard({ label, value, sub, icon: Icon, color = 'text-primary-400' }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-subtle uppercase tracking-wider">{label}</span>
        <Icon className={clsx('w-4 h-4', color)} />
      </div>
      <p className={clsx('text-2xl font-bold app-title', color)}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

function TimelineModal({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['incident-timeline', incident.id],
    queryFn: () => incidentsApi.timeline(incident.id).then(r => r.data),
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold app-title">Incident Timeline</h2>
          <p className="text-sm text-muted mt-1">{incident.monitor_name || `Monitor #${incident.monitor_id}`}</p>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[var(--border)]" />
              <div className="space-y-4">
                {(timeline?.events || []).map((ev: any, i: number) => (
                  <div key={i} className="relative pl-9">
                    <div className={clsx(
                      'absolute left-2 top-1.5 w-3 h-3 rounded-full border-2 border-[var(--surface)]',
                      ev.type === 'incident_start' ? 'bg-red-500' :
                      ev.type === 'resolved' ? 'bg-green-500' :
                      ev.type === 'acknowledged' ? 'bg-yellow-500' :
                      ev.status === 'up' ? 'bg-green-400' : 'bg-slate-500'
                    )} />
                    <p className="text-xs text-muted">{new Date(ev.time).toLocaleTimeString()}</p>
                    <p className="text-sm app-title mt-0.5">{ev.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-[var(--border)] flex justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

function PostmortemModal({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const [form, setForm] = useState({
    title: `Post-Incident Review: ${incident.monitor_name}`,
    summary: '',
    timeline: '',
    root_cause: incident.root_cause || '',
    impact: '',
    action_items: '',
    prevention: '',
  })
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => incidentsApi.postmortem(incident.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold app-title">Create Postmortem</h2>
        </div>
        <div className="p-6 space-y-4">
          {(['title', 'summary', 'timeline', 'root_cause', 'impact', 'action_items', 'prevention'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1.5 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              {field === 'title' ? (
                <input
                  className="input-field w-full"
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                />
              ) : (
                <textarea
                  rows={3}
                  className="input-field w-full resize-none"
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={
                    field === 'summary' ? 'Brief description of the incident and impact...' :
                    field === 'timeline' ? 'Step-by-step timeline of events...' :
                    field === 'root_cause' ? 'What caused the incident?' :
                    field === 'impact' ? 'Who was affected and how?' :
                    field === 'action_items' ? 'What actions will we take to prevent recurrence?' :
                    'How will we prevent this in the future?'
                  }
                />
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary text-sm"
          >
            {mutation.isPending ? 'Saving...' : 'Save Postmortem'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Incidents() {
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'resolved' | 'acknowledged'>('all')
  const [severity, setSeverity] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [timelineInc, setTimelineInc] = useState<Incident | null>(null)
  const [postmortemInc, setPostmortemInc] = useState<Incident | null>(null)
  const qc = useQueryClient()

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', filter, severity],
    queryFn: () => incidentsApi.list(
      filter === 'all' ? undefined : filter,
      severity || undefined
    ).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: metrics } = useQuery({
    queryKey: ['incident-metrics'],
    queryFn: () => incidentsApi.metrics().then(r => r.data),
    refetchInterval: 60_000,
  })

  const resolveMutation = useMutation({
    mutationFn: (id: number) => incidentsApi.resolve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => incidentsApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const updateSeverityMutation = useMutation({
    mutationFn: ({ id, severity }: { id: number; severity: string }) =>
      incidentsApi.update(id, { severity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Incident Management" />

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Incidents"
            value={metrics.total}
            sub={`Last ${metrics.window_days} days`}
            icon={AlertTriangle}
            color="text-orange-400"
          />
          <MetricCard
            label="Ongoing"
            value={metrics.ongoing}
            sub="Requires attention"
            icon={Activity}
            color={metrics.ongoing > 0 ? 'text-red-400' : 'text-green-400'}
          />
          <MetricCard
            label="MTTR"
            value={`${metrics.mttr_minutes}m`}
            sub="Mean Time to Resolve"
            icon={Clock}
            color="text-primary-400"
          />
          <MetricCard
            label="MTBF"
            value={`${metrics.mtbf_hours}h`}
            sub="Mean Time Between Failures"
            icon={TrendingUp}
            color="text-purple-400"
          />
        </div>
      )}

      {/* Severity breakdown */}
      {metrics?.by_severity && Object.keys(metrics.by_severity).length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(metrics.by_severity).map(([sev, count]) => {
            const cfg = SEVERITY_CONFIG[sev as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium
            return (
              <button
                key={sev}
                onClick={() => setSeverity(severity === sev ? '' : sev)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                  cfg.bg, cfg.color,
                  severity === sev ? 'ring-2 ring-white/20' : ''
                )}
              >
                <span className={clsx('w-2 h-2 rounded-full', cfg.dot)} />
                {sev}: {String(count)}
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
          {(['all', 'ongoing', 'acknowledged', 'resolved'] as const).map(f => (
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
      </div>

      {/* Incidents table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-card">
          <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
          <h3 className="text-xl font-semibold app-title mb-2">No incidents found</h3>
          <p className="text-muted text-sm">Everything is running smoothly</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="w-8 px-4 py-3.5" />
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-subtle uppercase tracking-wider">Monitor</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-subtle uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-subtle uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-subtle uppercase tracking-wider">Started</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-subtle uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const sevCfg = SEVERITY_CONFIG[(inc.severity || 'medium') as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium
                const isExp = expanded === inc.id
                return (
                  <>
                    <tr
                      key={inc.id}
                      className="border-b border-[var(--border)]/50 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => setExpanded(isExp ? null : inc.id)}
                    >
                      <td className="px-4 py-4">
                        {isExp
                          ? <ChevronDown className="w-4 h-4 text-muted" />
                          : <ChevronRight className="w-4 h-4 text-muted" />
                        }
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center text-xs font-bold text-primary-400">
                            {inc.monitor_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium app-title text-sm">{inc.monitor_name || `Monitor #${inc.monitor_id}`}</p>
                            {inc.title && <p className="text-xs text-muted">{inc.title}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={inc.severity || 'medium'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateSeverityMutation.mutate({ id: inc.id, severity: e.target.value })}
                          className={clsx('text-xs font-semibold px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer', sevCfg.bg, sevCfg.color)}
                        >
                          {['critical', 'high', 'medium', 'low'].map(s => (
                            <option key={s} value={s} className="bg-slate-800 text-white">{s.toUpperCase()}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
                          inc.incident_status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                          inc.incident_status === 'acknowledged' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-red-500/10 text-red-400'
                        )}>
                          <span className={clsx(
                            'w-1.5 h-1.5 rounded-full',
                            inc.incident_status === 'resolved' ? 'bg-green-400' :
                            inc.incident_status === 'acknowledged' ? 'bg-yellow-400 animate-pulse' :
                            'bg-red-400 animate-pulse'
                          )} />
                          {inc.incident_status === 'resolved' ? 'Resolved' :
                           inc.incident_status === 'acknowledged' ? 'Acknowledged' : 'Ongoing'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted">
                        {new Date(inc.outage_start_time).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted flex items-center gap-1 mt-3">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDuration(inc.outage_start_time, inc.recovery_time ?? null)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {inc.incident_status === 'ongoing' && (
                            <button
                              onClick={() => acknowledgeMutation.mutate(inc.id)}
                              className="text-xs font-medium text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              ACK
                            </button>
                          )}
                          {inc.incident_status !== 'resolved' && (
                            <button
                              onClick={() => resolveMutation.mutate(inc.id)}
                              className="text-xs font-medium text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${inc.id}-expanded`} className="bg-white/[0.01]">
                        <td colSpan={7} className="px-12 py-4">
                          <div className="space-y-3">
                            {inc.error_message && (
                              <div>
                                <span className="text-xs font-semibold text-subtle uppercase tracking-wider">Error</span>
                                <p className="text-sm text-muted mt-1 font-mono bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                                  {inc.error_message}
                                </p>
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setTimelineInc(inc)}
                                className="flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                View Timeline
                              </button>
                              {inc.incident_status === 'resolved' && (
                                <button
                                  onClick={() => setPostmortemInc(inc)}
                                  className="flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Create Postmortem
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {timelineInc && <TimelineModal incident={timelineInc} onClose={() => setTimelineInc(null)} />}
      {postmortemInc && <PostmortemModal incident={postmortemInc} onClose={() => setPostmortemInc(null)} />}
    </div>
  )
}
