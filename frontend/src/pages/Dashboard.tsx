import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Activity, CheckCircle, Wifi, WifiOff } from 'lucide-react'
import { dashboardApi } from '../api/dashboard'
import StatsCard from '../components/dashboard/StatsCard'
import Header from '../components/layout/Header'
import AddMonitorModal from '../components/monitors/AddMonitorModal'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'

function formatDuration(start: string, end: string | null): string {
  const diff = ((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s`
  if (diff < 3600) return `${Math.round(diff / 60)}m`
  return `${Math.round(diff / 3600)}h`
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${connected ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
      {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {connected ? 'Live' : 'Polling'}
    </div>
  )
}

export default function Dashboard() {
  const [addOpen, setAddOpen] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [liveEvents, setLiveEvents] = useState<{ id: number; message: string; type: string }[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const qc = useQueryClient()
  const { user } = useAuth()
  const { tokens } = useTheme()
  const { toast } = useToast()

  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: () => dashboardApi.getStats().then(r => r.data), refetchInterval: wsConnected ? false : 30_000 })
  const { data: uptimeChart } = useQuery({ queryKey: ['uptime-chart'], queryFn: () => dashboardApi.getUptimeChart().then(r => r.data) })
  const { data: rtChart } = useQuery({ queryKey: ['rt-chart'], queryFn: () => dashboardApi.getResponseTimeChart().then(r => r.data) })
  const { data: incidents } = useQuery({ queryKey: ['recent-incidents'], queryFn: () => dashboardApi.getRecentIncidents().then(r => r.data), refetchInterval: wsConnected ? false : 30_000 })

  // WebSocket for real-time updates
  useEffect(() => {
    if (!user) return
    const wsUrl = `ws://${window.location.host}/ws/${user.id}`
    let ws: WebSocket
    let retryTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        retryTimer = setTimeout(connect, 5000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'monitor_status') {
            qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
            qc.invalidateQueries({ queryKey: ['recent-incidents'] })
            qc.invalidateQueries({ queryKey: ['monitors'] })
            const text = msg.message || `${msg.monitor_name} is ${msg.status}`
            setLiveEvents(prev => [
              { id: Date.now(), message: text, type: msg.status },
              ...prev.slice(0, 4),
            ])
            toast(text, msg.status === 'up' ? 'success' : 'error')
          }
        } catch { /* ignore malformed frames */ }
      }
    }

    connect()
    return () => { clearTimeout(retryTimer); ws?.close() }
  }, [user?.id])

  const pieData = stats ? [
    { name: 'Up',     value: stats.up_monitors,     color: '#16a34a' },
    { name: 'Down',   value: stats.down_monitors,   color: '#dc2626' },
    { name: 'Paused', value: stats.paused_monitors, color: '#d97706' },
  ].filter(d => d.value > 0) : []

  const totalPie = pieData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="p-6 space-y-6">
      <Header
        title="Overview"
        action={{ label: 'Add Monitor', onClick: () => setAddOpen(true) }}
        extra={<LiveBadge connected={wsConnected} />}
      />

      {/* Live events ticker */}
      {liveEvents.length > 0 && (
        <div className="glass-card p-3 flex items-center gap-3 overflow-hidden">
          <Activity className="w-4 h-4 text-primary-400 flex-shrink-0" />
          <div className="flex gap-3 flex-wrap">
            {liveEvents.map(e => (
              <span key={e.id} className={`text-xs px-2.5 py-1 rounded-full ${e.type === 'up' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                {e.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Monitors"   value={stats?.total_monitors ?? 0}   subtitle={`${stats?.paused_monitors ?? 0} paused`} />
        <StatsCard title="Up Monitors"      value={stats?.up_monitors ?? 0}      accent="green" subtitle="Currently healthy" />
        <StatsCard title="Down Monitors"    value={stats?.down_monitors ?? 0}    accent={stats?.down_monitors ? 'red' : undefined} subtitle="Currently failing" />
        <StatsCard title="Warning"          value={stats?.warning_monitors ?? 0} accent={stats?.warning_monitors ? 'yellow' : undefined} subtitle="95–99% uptime" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Avg. Response"    value={stats ? `${stats.avg_response_time}ms` : '0ms'} subtitle="Last 24 hours" />
        <StatsCard title="Uptime (Overall)" value={stats ? `${stats.overall_uptime}%` : '100%'} accent="green" subtitle="Last 30 days" />
        <StatsCard title="Total Incidents"  value={stats?.total_incidents ?? 0}  accent={stats?.total_incidents ? 'red' : undefined} subtitle="All time" />
        <StatsCard title="Incidents Today"  value={stats?.incidents_today ?? 0}  accent={stats?.incidents_today ? 'red' : undefined} subtitle="Since midnight UTC" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-white">Uptime</h2>
            <span className="text-xs bg-slate-700 text-slate-300 px-3 py-1 rounded-lg">Last 7 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={uptimeChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
              <XAxis dataKey="date" tick={{ fill: tokens.tick, fontSize: 11 }} />
              <YAxis domain={[99, 100]} tick={{ fill: tokens.tick, fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }} formatter={(v: number) => [`${v}%`, 'Uptime']} />
              <Line type="monotone" dataKey="uptime" stroke={tokens.primary} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: tokens.primary }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5 flex flex-col">
          <h2 className="font-semibold text-white mb-4">Monitors by Status</h2>
          <div className="flex-1 flex items-center justify-center relative">
            <PieChart width={200} height={200}>
              <Pie
                data={pieData.length ? pieData : [{ name: 'No data', value: 1, color: tokens.muted }]}
                cx={100} cy={100} innerRadius={60} outerRadius={90} dataKey="value" strokeWidth={0}
              >
                {(pieData.length ? pieData : [{ color: tokens.muted }]).map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, color: tokens.tooltipText }} />
            </PieChart>
            {totalPie > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{totalPie}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {[
              { label: 'Up',     color: '#16a34a', count: stats?.up_monitors ?? 0     },
              { label: 'Down',   color: '#dc2626', count: stats?.down_monitors ?? 0   },
              { label: 'Paused', color: '#d97706', count: stats?.paused_monitors ?? 0 },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-slate-400">{item.label}</span>
                </div>
                <span className="font-semibold text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents + Response time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-4">Recent Incidents</h2>
          {!incidents?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <CheckCircle className="w-10 h-10 mb-3 text-green-500/50" />
              <p className="text-sm">No recent incidents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map(inc => (
                <div key={inc.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${inc.incident_status === 'resolved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {inc.monitor_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{inc.monitor_name}</p>
                    <p className="text-xs text-slate-500">{new Date(inc.outage_start_time).toLocaleString()}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${inc.incident_status === 'resolved' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {inc.incident_status}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{formatDuration(inc.outage_start_time, inc.recovery_time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-white">Response Time</h2>
            <span className="text-xs bg-slate-700 text-slate-300 px-3 py-1 rounded-lg">Last 7 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rtChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
              <XAxis dataKey="date" tick={{ fill: tokens.tick, fontSize: 11 }} />
              <YAxis tick={{ fill: tokens.tick, fontSize: 11 }} tickFormatter={v => `${v}ms`} />
              <Tooltip contentStyle={{ background: tokens.tooltipBg, border: `1px solid ${tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tokens.tooltipText }} formatter={(v: number) => [`${v}ms`, 'Response Time']} />
              <Line type="monotone" dataKey="response_time" stroke={tokens.success} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AddMonitorModal isOpen={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
