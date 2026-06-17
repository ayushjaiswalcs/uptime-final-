import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft, ExternalLink, RefreshCw, AlertTriangle,
  CheckCircle, Clock, Activity, TrendingUp, Zap, Shield,
  Radio, Wifi, WifiOff, Package,
} from 'lucide-react'
import { monitorsApi, type PingStats } from '../api/monitors'
import { useTheme } from '../context/ThemeContext'
import { Skeleton, ChartSkeleton } from '../components/ui/Skeleton'

type Range = '1d' | '7d' | '30d'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function fmtShortTs(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ─── Ping-specific panel ─────────────────────────────────────────────────────

function lossColor(loss: number) {
  if (loss === 0) return '#16a34a'
  if (loss < 25) return '#eab308'
  if (loss < 75) return '#f97316'
  return '#dc2626'
}

function PingDashboard({ monitorId, range, tokens }: {
  monitorId: number
  range: Range
  tokens: Record<string, string>
}) {
  const hours = range === '30d' ? 720 : range === '7d' ? 168 : 24

  const { data: ps, isLoading, refetch } = useQuery<PingStats>({
    queryKey: ['ping-stats', monitorId, hours],
    queryFn: () => monitorsApi.getPingStats(monitorId, hours).then(r => r.data),
    refetchInterval: 60_000,
  })

  // Thin the series for charting (max 120 points)
  const series = ps?.series ?? []
  const step = Math.max(1, Math.floor(series.length / 120))
  const chartData = series
    .filter((_, i) => i % step === 0)
    .map(pt => ({
      t: fmtShortTs(pt.timestamp),
      loss: pt.packet_loss,
      avg: pt.avg_ms,
      min: pt.min_ms,
      max: pt.max_ms,
      up: pt.is_up ? 1 : 0,
    }))

  const avgLoss = ps?.avg_packet_loss ?? null
  const overallMin = ps?.overall_min_ms ?? null
  const overallAvg = ps?.overall_avg_ms ?? null
  const overallMax = ps?.overall_max_ms ?? null

  // Last 50 rows for history table (most recent first)
  const tableRows = [...series].reverse().slice(0, 50)

  if (isLoading) return (
    <div className="space-y-4">
      {[220, 200, 180].map(h => <ChartSkeleton key={h} height={h} />)}
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Diagnostic header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Radio size={14} className="text-primary-400" /> Ping Diagnostics
        </h2>
        <button onClick={() => refetch()} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Summary KPI cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Packet Loss', value: avgLoss !== null ? `${avgLoss.toFixed(1)}%` : '—', color: avgLoss === 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Min RTT', value: overallMin !== null ? `${overallMin}ms` : '—', color: 'text-blue-400' },
          { label: 'Avg RTT', value: overallAvg !== null ? `${overallAvg}ms` : '—', color: 'text-primary-400' },
          { label: 'Max RTT', value: overallMax !== null ? `${overallMax}ms` : '—', color: 'text-yellow-400' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Last Success / Last Failure ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 border-l-4 border-green-500">
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={14} className="text-green-400" />
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">Last Successful Check</span>
          </div>
          {ps?.last_success ? (
            <>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{fmtTs(ps.last_success.timestamp)}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                avg {ps.last_success.avg_ms ?? '—'}ms
                {ps.last_success.min_ms !== null && ` · min ${ps.last_success.min_ms}ms`}
                {ps.last_success.max_ms !== null && ` · max ${ps.last_success.max_ms}ms`}
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No successful check in this period</p>
          )}
        </div>

        <div className="card p-4 border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff size={14} className="text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Last Failed Check</span>
          </div>
          {ps?.last_failure ? (
            <>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{fmtTs(ps.last_failure.timestamp)}</p>
              <p className="text-xs text-red-400 mt-1 truncate" title={ps.last_failure.error ?? ''}>
                {ps.last_failure.error ?? 'Unknown error'}
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No failures in this period</p>
          )}
        </div>
      </div>

      {/* ── Packet Loss Over Time ─────────────────────────────────────── */}
      <div className="card p-5">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2 text-sm">
          <Package size={14} className="text-red-400" /> Packet Loss %
        </h3>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-xs text-[var(--text-muted)]">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
              <XAxis dataKey="t" tick={{ fill: tokens.tick, fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fill: tokens.tick, fontSize: 9 }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }}
                formatter={(v: number) => [`${v}%`, 'Packet Loss']}
              />
              <Area type="monotone" dataKey="loss" stroke="#dc2626" fill="url(#lossGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── RTT Latency (min / avg / max) ────────────────────────────── */}
      <div className="card p-5">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2 text-sm">
          <Zap size={14} className="text-primary-400" /> RTT Latency — min / avg / max
        </h3>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-xs text-[var(--text-muted)]">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
              <XAxis dataKey="t" tick={{ fill: tokens.tick, fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: tokens.tick, fontSize: 9 }} tickFormatter={v => `${v}ms`} />
              <Tooltip
                contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }}
                formatter={(v: number, name: string) => [`${v}ms`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: tokens.tick }} />
              <Line type="monotone" dataKey="min" stroke="#16a34a" strokeWidth={1.5} dot={false} name="Min" />
              <Line type="monotone" dataKey="avg" stroke={tokens.primary} strokeWidth={2} dot={false} name="Avg" />
              <Line type="monotone" dataKey="max" stroke="#f97316" strokeWidth={1.5} dot={false} name="Max" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Error Reason Breakdown ────────────────────────────────────── */}
      {ps?.error_breakdown && ps.error_breakdown.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2 text-sm">
            <AlertTriangle size={14} className="text-yellow-400" /> Error Reasons
          </h3>
          <div className="space-y-3">
            {ps.error_breakdown.map((eb, i) => {
              const maxCount = ps.error_breakdown[0].count
              const pct = Math.round((eb.count / maxCount) * 100)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--text-muted)] truncate max-w-[80%]" title={eb.reason}>{eb.reason}</span>
                    <span className="font-semibold text-red-400 ml-2 flex-shrink-0">{eb.count}×</span>
                  </div>
                  <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5">
                    <div className="bg-red-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Ping History Table ────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
            <Clock size={14} className="text-[var(--text-muted)]" /> Ping History (last 50 checks)
          </h3>
          <span className="text-xs text-[var(--text-muted)]">{tableRows.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                {['Time', 'Status', 'Avg RTT', 'Min', 'Max', 'Loss %', 'Error'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">No ping history yet</td>
                </tr>
              ) : tableRows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                  <td className="px-4 py-2.5 text-[var(--text-muted)] whitespace-nowrap">{fmtTs(row.timestamp)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${row.is_up ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${row.is_up ? 'bg-green-400' : 'bg-red-400'}`} />
                      {row.is_up ? 'UP' : 'DOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-primary)]">
                    {row.avg_ms !== null ? `${row.avg_ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-green-400">
                    {row.min_ms !== null ? `${row.min_ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-orange-400">
                    {row.max_ms !== null ? `${row.max_ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                    <span style={{ color: lossColor(row.packet_loss) }} className="font-semibold">
                      {row.packet_loss.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)] max-w-[240px] truncate" title={row.error ?? ''}>
                    {row.error ?? <span className="text-green-400/50">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

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
  const isPing = monitor?.monitor_type === 'ping'

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
        { name: 'Up',   value: metrics.up_checks,   color: '#16a34a' },
        { name: 'Down', value: metrics.down_checks,  color: '#dc2626' },
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

      {/* ── Top bar ─────────────────────────────────────────────────── */}
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
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full uppercase font-medium">
                {monitor?.monitor_type}
              </span>
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

        {/* ── Left: charts ─────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-6">

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Uptime',       value: monitor ? `${parseFloat(monitor.uptime_percentage as string).toFixed(2)}%` : '—', icon: <TrendingUp size={16} />, color: 'text-green-400' },
              { label: 'Avg Response', value: metrics ? `${metrics.avg_response_time}ms` : '—', icon: <Zap size={16} />, color: 'text-blue-400' },
              { label: 'Total Checks', value: metrics?.total_checks ?? '—', icon: <Activity size={16} />, color: 'text-purple-400' },
              { label: 'Incidents',    value: metrics?.incident_count ?? '—', icon: <Shield size={16} />, color: metrics?.incident_count ? 'text-red-400' : 'text-green-400' },
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

          {/* ── Ping-specific dashboard (only for Ping monitors) ─────── */}
          {isPing && !monitorQ.isLoading && (
            <PingDashboard monitorId={Number(id)} range={range} tokens={tokens} />
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

        {/* ── Right sidebar ─────────────────────────────────────────── */}
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
                  ...(monitor.monitor_type !== 'ping' && monitor.monitor_type !== 'tcp' && monitor.monitor_type !== 'dns' ? [
                    { label: 'Method',   value: monitor.http_method },
                    { label: 'Expected', value: String(monitor.expected_status_code) },
                  ] : []),
                  { label: 'Threshold',  value: `${monitor.alert_threshold} failure${monitor.alert_threshold !== 1 ? 's' : ''}` },
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
