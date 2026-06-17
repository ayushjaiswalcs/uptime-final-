import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Activity, CheckCircle, XCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import { monitorsApi, type Monitor } from '../../api/monitors'
import { useTheme } from '../../context/ThemeContext'
import clsx from 'clsx'

interface Props {
  monitor: Monitor | null
  onClose: () => void
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MonitorDetailModal({ monitor, onClose }: Props) {
  const { tokens } = useTheme()
  const isOpen = !!monitor

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['monitor-logs', monitor?.id],
    queryFn: () => monitorsApi.getLogs(monitor!.id, 24).then(r => r.data),
    enabled: isOpen,
    refetchInterval: 60_000, // keep the detail view fresh as new checks land
  })

  // Logs arrive newest-first; chronological order for charts/bars.
  const chrono = [...logs].reverse()
  const chartData = chrono.map(l => ({
    t: fmtTime(l.checked_at),
    response_time: l.response_time ?? 0,
  }))

  const upCount = logs.filter(l => l.is_up).length
  const avgRt = logs.length
    ? Math.round(logs.reduce((s, l) => s + (l.response_time ?? 0), 0) / logs.length)
    : 0
  const windowUptime = logs.length ? ((upCount / logs.length) * 100).toFixed(2) : null

  // Last 40 checks as a real status strip (oldest -> newest).
  const bars = chrono.slice(-40)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={monitor?.monitor_name || 'Monitor'} size="lg">
      {!monitor ? null : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              monitor.is_paused ? 'bg-amber-500/15 text-amber-400'
                : monitor.current_status === 'up' ? 'bg-green-500/15 text-green-400'
                : monitor.current_status === 'down' ? 'bg-red-500/15 text-red-400'
                : 'bg-slate-500/15 text-slate-400'
            )}>
              {monitor.is_paused ? 'Paused' : monitor.current_status === 'up' ? 'Operational' : monitor.current_status === 'down' ? 'Down' : 'Pending'}
            </span>
            <a href={monitor.target_url} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline truncate max-w-xs">
              {monitor.target_url}
            </a>
            <span className="text-muted flex items-center gap-1 uppercase text-xs">{monitor.monitor_type}</span>
            <span className="text-muted flex items-center gap-1 text-xs">
              <Clock className="w-3 h-3" />every {monitor.interval >= 60 ? `${monitor.interval / 60}m` : `${monitor.interval}s`}
            </span>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Uptime (24h)</p>
              <p className="text-2xl font-bold text-green-400">{windowUptime != null ? `${windowUptime}%` : '—'}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Avg Response</p>
              <p className="text-2xl font-bold app-title">{logs.length ? `${avgRt}ms` : '—'}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Checks (24h)</p>
              <p className="text-2xl font-bold app-title">{logs.length}</p>
            </div>
          </div>

          {/* Real uptime strip */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Recent Checks</p>
            {bars.length === 0 ? (
              <p className="text-sm text-muted">No checks recorded yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-8">
                {bars.map(l => (
                  <div
                    key={l.id}
                    title={`${l.is_up ? 'Up' : 'Down'} · ${l.response_time ?? '—'}ms · ${fmtTime(l.checked_at)}${l.error_message ? ` · ${l.error_message}` : ''}`}
                    className={clsx('flex-1 rounded-sm h-full min-w-[3px]', l.is_up ? 'bg-green-500/70' : 'bg-red-500')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Response time chart */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Response Time (24h)</p>
            {isLoading ? (
              <div className="h-[160px] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No data to chart yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis dataKey="t" tick={{ fill: tokens.tick, fontSize: 10 }} minTickGap={40} />
                  <YAxis tick={{ fill: tokens.tick, fontSize: 10 }} tickFormatter={v => `${v}ms`} width={48} />
                  <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }} formatter={(v: number) => [`${v}ms`, 'Response']} />
                  <Line type="monotone" dataKey="response_time" stroke={tokens.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent checks list */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Check Log</p>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
              {logs.length === 0 ? (
                <p className="text-sm text-muted p-4 text-center flex items-center justify-center gap-2">
                  <Activity className="w-4 h-4" /> No checks recorded in the last 24h.
                </p>
              ) : (
                logs.slice(0, 50).map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {l.is_up
                      ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    <span className="text-muted w-32 flex-shrink-0">{fmtTime(l.checked_at)}</span>
                    <span className="app-title w-20 flex-shrink-0">{l.response_time != null ? `${l.response_time}ms` : '—'}</span>
                    {l.http_status != null && <span className="text-muted w-12 flex-shrink-0">{l.http_status}</span>}
                    {l.error_message && <span className="text-red-400 truncate text-xs">{l.error_message}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
