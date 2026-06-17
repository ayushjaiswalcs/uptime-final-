import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft, ExternalLink, RefreshCw, AlertTriangle,
  CheckCircle, Clock, Activity, TrendingUp, Zap, Shield,
} from 'lucide-react'
import { monitorsApi } from '../api/monitors'
import { useTheme } from '../context/ThemeContext'
import { Skeleton, ChartSkeleton } from '../components/ui/Skeleton'

type Range = '1d' | '7d' | '30d'

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    up:      'bg-green-500/15 text-green-400 border-green-500/30',
    down:    'bg-red-500/15 text-red-400 border-red-500/30',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    paused:  'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${colors[status] ?? colors.pending}`}>
      <span className={`w-2 h-2 rounded-full ${status === 'up' ? 'bg-green-400 animate-pulse' : status === 'down' ? 'bg-red-400' : 'bg-slate-400'}`} />
      {status.toUpperCase()}
    </span>
  )
}

function fmtDuration(mins: number) {
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h ${mins % 60}m`
  return `${Math.floor(mins / 1440)}d ${Math.round((mins % 1440) / 60)}h`
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MonitorDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tokens } = useTheme()
  const [range, setRange] = useState<Range>('1d')

  const monitorQ = useQuery({
    queryKey: ['monitor', Number(id)],
    queryFn: () => monitorsApi.get(Number(id)).then(r => r.data),
    enabled: !!id,
    refetchInterval: 30_000,
  })

  const metricsQ = useQuery({
    queryKey: ['monitor-metrics', Number(id), range],
    queryFn: () => monitorsApi.getMetrics(Number(id), range).then(r => r.data),
    enabled: !!id,
    refetchInterval: 60_000,
  })

  const monitor = monitorQ.data
  const metrics = metricsQ.data

  if (monitorQ.isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-[var(--text-muted)]">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Monitor Not Found</h2>
        <p className="text-sm">This monitor does not exist or you don't have access to it.</p>
        <button onClick={() => navigate('/monitors')} className="btn-primary flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Monitors
        </button>
      </div>
    )
  }

  const pieData = metrics
    ? [
        { name: 'Up',   value: metrics.up_checks,  color: '#16a34a' },
        { name: 'Down', value: metrics.down_checks, color: '#dc2626' },
      ].filter(d => d.value > 0)
    : []

  const rtBuckets = metrics?.buckets ?? []

  const rtDistribution = (() => {
    if (!rtBuckets.length) return []
    const rts = rtBuckets.map(b => b.response_time).filter(v => v > 0)
    if (!rts.length) return []
    const max = Math.max(...rts)
    const bucketSize = Math.ceil(max / 8) || 100
    const dist: Record<number, number> = {}
    rts.forEach(rt => {
      const bucket = Math.floor(rt / bucketSize) * bucketSize
      dist[bucket] = (dist[bucket] ?? 0) + 1
    })
    return Object.entries(dist)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => ({ label: `${k}ms`, count: v }))
  })()

  const incidentBuckets = (() => {
    if (!metrics?.incidents) return []
    const map: Record<string, number> = {}
    metrics.incidents.forEach(inc => {
      const day = new Date(inc.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      map[day] = (map[day] ?? 0) + 1
    })
    return Object.entries(map).map(([date, count]) => ({ date, count }))
  })()

  return (
    <div className="p-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/monitors')} className="btn-ghost flex items-center gap-1.5 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          {monitorQ.isLoading ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--text-primary)] truncate">{monitor?.monitor_name}</h1>
              {monitor && statusBadge(monitor.current_status)}
              <a href={monitor?.target_url} target="_blank" rel="noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors">
                {monitor?.target_url} <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
          {(['1d', '7d', '30d'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? 'bg-primary-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`}>
              {r === '1d' ? '24h' : r === '7d' ? '7d' : '30d'}
            </button>
          ))}
        </div>
        <button onClick={() => { monitorQ.refetch(); metricsQ.refetch() }}
          className="btn-ghost p-2" title="Refresh">
          <RefreshCw size={14} className={monitorQ.isFetching || metricsQ.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: charts */}
        <div className="xl:col-span-2 space-y-6">

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Uptime', value: monitor ? `${parseFloat(monitor.uptime_percentage as string).toFixed(2)}%` : '—', icon: <TrendingUp size={16} />, color: 'text-green-400' },
              { label: 'Avg Response', value: metrics ? `${metrics.avg_response_time}ms` : '—', icon: <Zap size={16} />, color: 'text-blue-400' },
              { label: 'Total Checks', value: metrics?.total_checks ?? '—', icon: <Activity size={16} />, color: 'text-purple-400' },
              { label: 'Incidents', value: metrics?.incident_count ?? '—', icon: <Shield size={16} />, color: metrics?.incident_count ? 'text-red-400' : 'text-green-400' },
            ].map(k => (
              <div key={k.label} className="card p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)] font-medium">{k.label}</span>
                  <span className={k.color}>{k.icon}</span>
                </div>
                <span className="text-2xl font-bold text-[var(--text-primary)]">{k.value}</span>
              </div>
            ))}
          </div>

          {/* Response time area chart */}
          {metricsQ.isLoading ? <ChartSkeleton height={220} /> : (
            <div className="card p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Activity size={16} className="text-primary-400" /> Response Time
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={rtBuckets}>
                  <defs>
                    <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={tokens.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={tokens.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis dataKey="label" tick={{ fill: tokens.tick, fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: tokens.tick, fontSize: 10 }} tickFormatter={v => `${v}ms`} />
                  <Tooltip
                    contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }}
                    formatter={(v: number) => [`${v}ms`, 'Response Time']}
                  />
                  <Area type="monotone" dataKey="response_time" stroke={tokens.primary} fill="url(#rtGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Uptime % area chart */}
          {metricsQ.isLoading ? <ChartSkeleton height={200} /> : (
            <div className="card p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-green-400" /> Uptime %
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={rtBuckets}>
                  <defs>
                    <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis dataKey="label" tick={{ fill: tokens.tick, fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[90, 100]} tick={{ fill: tokens.tick, fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }}
                    formatter={(v: number) => [`${v}%`, 'Uptime']}
                  />
                  <Area type="monotone" dataKey="uptime" stroke="#16a34a" fill="url(#upGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bottom row: Donut + Distribution + Incident bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Status donut */}
            <div className="card p-5 flex flex-col items-center">
              <h3 className="font-semibold text-[var(--text-primary)] mb-3 self-start text-sm">Status Split</h3>
              {metricsQ.isLoading ? <Skeleton className="w-36 h-36 rounded-full" /> : (
                <div className="relative">
                  <PieChart width={144} height={144}>
                    <Pie
                      data={pieData.length ? pieData : [{ name: 'No data', value: 1, color: tokens.muted }]}
                      cx={72} cy={72} innerRadius={44} outerRadius={68} dataKey="value" strokeWidth={0}
                    >
                      {(pieData.length ? pieData : [{ color: tokens.muted }]).map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, color: tokens.tooltipText }} />
                  </PieChart>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xl font-bold text-[var(--text-primary)]">{metrics?.total_checks ?? 0}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">checks</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="w-full mt-3 space-y-1">
                {[{ label: 'Up', color: '#16a34a', val: metrics?.up_checks }, { label: 'Down', color: '#dc2626', val: metrics?.down_checks }].map(d => (
                  <div key={d.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-[var(--text-muted)]">{d.label}</span>
                    </div>
                    <span className="font-semibold text-[var(--text-primary)]">{d.val ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response time distribution */}
            <div className="card p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-3 text-sm">RT Distribution</h3>
              {metricsQ.isLoading ? <Skeleton className="h-32 w-full" /> : rtDistribution.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-[var(--text-muted)]">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={rtDistribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: tokens.tick, fontSize: 9 }} />
                    <YAxis tick={{ fill: tokens.tick, fontSize: 9 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 11, color: tokens.tooltipText }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {rtDistribution.map((_, i) => (
                        <Cell key={i} fill={`hsl(${200 + i * 20}, 70%, 55%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Incident bar chart */}
            <div className="card p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-3 text-sm">Incidents / Day</h3>
              {metricsQ.isLoading ? <Skeleton className="h-32 w-full" /> : incidentBuckets.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-[var(--text-muted)]">
                  <div className="text-center">
                    <CheckCircle size={24} className="text-green-500/50 mx-auto mb-1" />
                    No incidents
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={incidentBuckets} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: tokens.tick, fontSize: 9 }} />
                    <YAxis tick={{ fill: tokens.tick, fontSize: 9 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 11, color: tokens.tooltipText }} />
                    <Bar dataKey="count" fill="#dc2626" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Monitor Info */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Clock size={15} /> Monitor Info
            </h3>
            {monitorQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : monitor && (
              <dl className="space-y-3 text-sm">
                {[
                  { label: 'Type',       value: monitor.monitor_type.toUpperCase() },
                  { label: 'Interval',   value: `${monitor.interval}s` },
                  { label: 'Timeout',    value: `${monitor.timeout}s` },
                  { label: 'Method',     value: monitor.http_method },
                  { label: 'Expected',   value: monitor.expected_status_code },
                  { label: 'Threshold',  value: `${monitor.alert_threshold} failures` },
                  { label: 'Created',    value: new Date(monitor.created_at).toLocaleDateString() },
                  { label: 'Last check', value: monitor.last_checked_at ? fmtTs(monitor.last_checked_at) : 'Never' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">{row.label}</dt>
                    <dd className="font-medium text-[var(--text-primary)] text-right">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Checks summary */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Checks Summary</h3>
            {metricsQ.isLoading ? <Skeleton className="h-16 w-full" /> : metrics && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-green-400 font-medium">Up</span>
                  <span className="text-[var(--text-muted)]">{metrics.up_checks} / {metrics.total_checks}</span>
                </div>
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: metrics.total_checks ? `${metrics.up_checks / metrics.total_checks * 100}%` : '0%' }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-red-400 font-medium">Down</span>
                  <span className="text-[var(--text-muted)]">{metrics.down_checks} / {metrics.total_checks}</span>
                </div>
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
                  <div className="bg-red-500 h-2 rounded-full transition-all"
                    style={{ width: metrics.total_checks ? `${metrics.down_checks / metrics.total_checks * 100}%` : '0%' }} />
                </div>
              </div>
            )}
          </div>

          {/* Incident timeline */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" /> Incident Timeline
            </h3>
            {metricsQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !metrics?.incidents?.length ? (
              <div className="flex flex-col items-center py-6 text-[var(--text-muted)]">
                <CheckCircle size={24} className="text-green-500/50 mb-2" />
                <p className="text-xs">No incidents in this period</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {metrics.incidents.map((inc, i) => (
                  <div key={inc.id} className="relative pl-4">
                    {i < metrics.incidents.length - 1 && (
                      <div className="absolute left-[7px] top-5 bottom-0 w-px bg-[var(--border)]" />
                    )}
                    <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${inc.status === 'resolved' ? 'bg-green-500 border-green-700' : 'bg-red-500 border-red-700'}`} />
                    <div className="card p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${inc.status === 'resolved' ? 'text-green-400' : 'text-red-400'}`}>
                          {inc.status === 'resolved' ? 'Resolved' : 'Ongoing'}
                        </span>
                        <span className="text-[var(--text-muted)]">{fmtDuration(inc.duration_mins)}</span>
                      </div>
                      <p className="text-[var(--text-muted)]">{fmtTs(inc.started_at)}</p>
                      {inc.error && <p className="text-red-400 truncate" title={inc.error}>{inc.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
