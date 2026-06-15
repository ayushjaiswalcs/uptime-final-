import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, AlertTriangle, Radio } from 'lucide-react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface PublicData {
  company_name: string
  logo_url: string
  description: string
  overall_status: string
  avg_uptime: string
  monitors: { id: number; name: string; status: string; uptime: string }[]
  incidents: { id: number; started_at: string; resolved_at: string | null; status: string; error: string }[]
}

function UptimeBar({ uptime }: { uptime: string }) {
  const pct = parseFloat(uptime)
  const color = pct >= 99.9 ? '#16a34a' : pct >= 99 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-semibold text-white w-16 text-right">{uptime}%</span>
    </div>
  )
}

export default function PublicStatus() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<PublicData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    axios.get(`${API_BASE}/status-pages/public/${slug}`)
      .then(r => setData(r.data))
      .catch(() => setError(true))
  }, [slug])

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Status Page Not Found</h1>
        <p className="text-slate-400">This status page does not exist or is private.</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const isOperational = data.overall_status === 'operational'

  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Radio className="w-8 h-8 text-primary-400" />
            <span className="text-2xl font-bold text-white">{data.company_name}</span>
          </div>
          {data.description && <p className="text-slate-400 text-sm">{data.description}</p>}
        </div>

        {/* Overall status banner */}
        <div className={`rounded-2xl p-6 flex items-center gap-4 ${isOperational ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          {isOperational ? (
            <CheckCircle className="w-10 h-10 text-green-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-red-500 flex-shrink-0" />
          )}
          <div>
            <h2 className={`text-xl font-bold ${isOperational ? 'text-green-400' : 'text-red-400'}`}>
              {isOperational ? 'All Systems Operational' : 'Service Disruption Detected'}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {isOperational ? 'Everything is running smoothly.' : 'Some services may be experiencing issues.'}
            </p>
          </div>
        </div>

        {/* Services */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-semibold text-white mb-4">Services</h3>
          {data.monitors.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No monitors configured</p>
          ) : (
            data.monitors.map(m => (
              <div key={m.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${m.status === 'up' ? 'bg-green-500' : m.status === 'down' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <span className="text-sm text-white">{m.name}</span>
                  </div>
                  <span className={`text-xs font-semibold ${m.status === 'up' ? 'text-green-400' : m.status === 'down' ? 'text-red-400' : 'text-amber-400'}`}>
                    {m.status === 'up' ? 'Operational' : m.status === 'down' ? 'Down' : 'Paused'}
                  </span>
                </div>
                <UptimeBar uptime={m.uptime || '100.00'} />
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{data.avg_uptime}%</p>
            <p className="text-xs text-slate-500 mt-1">Uptime (90 days)</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-white">{data.incidents.filter(i => i.status === 'resolved').length}</p>
            <p className="text-xs text-slate-500 mt-1">Incidents (90 days)</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-white">—</p>
            <p className="text-xs text-slate-500 mt-1">Response Time (avg)</p>
          </div>
        </div>

        {/* Recent incidents */}
        {data.incidents.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="font-semibold text-white mb-4">Recent Incidents</h3>
            <div className="space-y-3">
              {data.incidents.map(inc => (
                <div key={inc.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-700/30">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${inc.status === 'resolved' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{inc.error || 'Service disruption'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(inc.started_at).toLocaleString()}
                      {inc.resolved_at && ` → ${new Date(inc.resolved_at).toLocaleString()}`}
                    </p>
                  </div>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${inc.status === 'resolved' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {inc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-600 pb-4">
          Powered by <span className="text-primary-500 font-semibold">Uptime</span> · Updated 1 min ago
        </p>
      </div>
    </div>
  )
}
