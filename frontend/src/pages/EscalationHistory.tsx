import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle, Bell, ArrowUpCircle, CheckCircle2, StopCircle, Activity,
  Clock, Radio,
} from 'lucide-react'
import { escalationApi, type EscalationHistoryRow } from '../api/escalation'
import Header from '../components/layout/Header'
import clsx from 'clsx'

// Visual mapping for each escalation timeline event.
const EVENT_META: Record<string, { label: string; icon: any; cls: string }> = {
  incident_created:     { label: 'Incident Created',     icon: AlertCircle,   cls: 'text-red-400 bg-red-500/10' },
  escalation_triggered: { label: 'Escalation Triggered', icon: Radio,         cls: 'text-amber-400 bg-amber-500/10' },
  notification_sent:    { label: 'Notification Sent',    icon: Bell,          cls: 'text-primary-400 bg-primary-500/10' },
  level_changed:        { label: 'Escalation Level Changed', icon: ArrowUpCircle, cls: 'text-purple-400 bg-purple-500/10' },
  incident_resolved:    { label: 'Incident Resolved',    icon: CheckCircle2,  cls: 'text-green-400 bg-green-500/10' },
  escalation_stopped:   { label: 'Escalation Stopped',   icon: StopCircle,    cls: 'text-slate-400 bg-slate-500/10' },
}

const SEV_CLS: Record<string, string> = {
  NORMAL: 'text-blue-400', WARNING: 'text-amber-400', CRITICAL: 'text-red-400',
  low: 'text-blue-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400',
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString()
}

function countdown(target?: string | null) {
  if (!target) return 'final level'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'escalating…'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `in ${m}m ${s}s`
}

export default function EscalationHistory() {
  const { data: active = [] } = useQuery({
    queryKey: ['escalation-active'],
    queryFn: () => escalationApi.active().then(r => r.data),
    refetchInterval: 5000,
  })
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['escalation-history'],
    queryFn: () => escalationApi.listHistory({ limit: 300 }).then(r => r.data),
    refetchInterval: 10000,
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Escalation History" />

      {/* Active escalations */}
      <div>
        <h3 className="font-semibold app-title flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-amber-400" />Active Escalations
          <span className="text-xs text-muted font-normal">({active.length})</span>
        </h3>
        {active.length === 0 ? (
          <div className="glass-card p-6 text-center text-muted text-sm">No active escalations. All clear.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map(a => (
              <div key={a.incident_id} className="glass-card p-4 space-y-2 border-l-2 border-amber-500/50">
                <div className="flex items-center justify-between">
                  <p className="font-medium app-title text-sm truncate">{a.monitor_name ?? `Monitor #${a.monitor_id}`}</p>
                  <span className={clsx('text-xs font-bold', SEV_CLS[a.severity ?? ''] ?? 'text-muted')}>
                    {(a.severity ?? '').toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted truncate">{a.error_message}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">Level {a.escalation_level}</span>
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <Clock className="w-3 h-3" />{countdown(a.next_escalation_at)}
                  </span>
                </div>
                <p className="text-[11px] text-subtle">Since {fmt(a.outage_start_time)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline feed */}
      <div>
        <h3 className="font-semibold app-title mb-3">Escalation Timeline</h3>
        {isLoading ? (
          <div className="glass-card p-12 text-center text-muted">Loading…</div>
        ) : history.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted">No escalation events recorded yet.</div>
        ) : (
          <div className="glass-card p-2">
            {history.map((row, i) => <TimelineRow key={row.id} row={row} last={i === history.length - 1} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineRow({ row, last }: { row: EscalationHistoryRow; last: boolean }) {
  const meta = EVENT_META[row.event_type] ?? { label: row.event_type, icon: Activity, cls: 'text-muted bg-slate-500/10' }
  const Icon = meta.icon
  return (
    <div className="flex gap-3 px-3 py-2.5 relative">
      <div className="flex flex-col items-center">
        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', meta.cls)}>
          <Icon className="w-4 h-4" />
        </div>
        {!last && <div className="w-px flex-1 bg-[var(--border)] mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium app-title">{meta.label}</span>
          {row.level_number != null && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">L{row.level_number}</span>
          )}
          {row.channel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400">{row.channel}</span>
          )}
          {row.severity && (
            <span className={clsx('text-xs font-medium', SEV_CLS[row.severity] ?? 'text-muted')}>{row.severity.toUpperCase()}</span>
          )}
          {row.status && row.status !== 'info' && (
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full',
              row.status === 'sent' ? 'bg-green-500/10 text-green-400'
                : row.status === 'failed' ? 'bg-red-500/10 text-red-400'
                : 'bg-slate-500/10 text-slate-400')}>{row.status}</span>
          )}
        </div>
        {row.message && <p className="text-xs text-muted mt-0.5">{row.message}</p>}
        <p className="text-[11px] text-subtle mt-0.5">
          Incident #{row.incident_id} · {fmt(row.created_at)}
        </p>
      </div>
    </div>
  )
}
