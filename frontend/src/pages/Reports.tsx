import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { dashboardApi } from '../api/dashboard'
import Header from '../components/layout/Header'

export default function Reports() {
  const [days, setDays] = useState(7)

  const { data: uptimeChart } = useQuery({
    queryKey: ['uptime-chart', days],
    queryFn: () => dashboardApi.getUptimeChart(days).then(r => r.data),
  })
  const { data: rtChart } = useQuery({
    queryKey: ['rt-chart', days],
    queryFn: () => dashboardApi.getResponseTimeChart(days).then(r => r.data),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Reports" />

      <div className="flex items-center gap-2">
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${days === d ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {d} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-5">Uptime Percentage</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={uptimeChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis domain={[98, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Uptime']} />
              <Line type="monotone" dataKey="uptime" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: '#4f46e5' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-5">Response Time (ms)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rtChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v}ms`, 'Avg Response']} />
              <Bar dataKey="response_time" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
