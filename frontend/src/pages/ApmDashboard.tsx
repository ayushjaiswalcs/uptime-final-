import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Cpu, AlertCircle, Clock, Activity, Globe, Monitor,
  TrendingUp, TrendingDown, CheckCircle, XCircle, Zap, BarChart2
} from 'lucide-react'
import { apmApi, type APMOverview, type APMError } from '../api/apm'
import Header from '../components/layout/Header'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import clsx from 'clsx'

type Tab = 'overview' | 'transactions' | 'errors' | 'rum'

const VITALS_THRESHOLDS: Record<string, { good: number; needs: number; unit: string }> = {
  lcp: { good: 2500, needs: 4000, unit: 'ms' },
  fid: { good: 100, needs: 300, unit: 'ms' },
  cls: { good: 0.1, needs: 0.25, unit: '' },
  ttfb: { good: 800, needs: 1800, unit: 'ms' },
  fcp: { good: 1800, needs: 3000, unit: 'ms' },
}

function getVitalStatus(metric: string, value?: number | null): 'good' | 'needs' | 'poor' | 'n/a' {
  if (!value) return 'n/a'
  const thres = VITALS_THRESHOLDS[metric]
  if (!thres) return 'n/a'
  if (value <= thres.good) return 'good'
  if (value <= thres.needs) return 'needs'
  return 'poor'
}

function VitalCard({ label, value, metric }: { label: string; value?: number | null; metric: string }) {
  const status = getVitalStatus(metric, value)
  const thres = VITALS_THRESHOLDS[metric]
  const display = value ? `${metric === 'cls' ? value.toFixed(3) : Math.round(value)}${thres?.unit || ''}` : 'N/A'
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-subtle uppercase tracking-wider">{label}</p>
        <span className={clsx(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          status === 'good' ? 'bg-green-500/10 text-green-400' :
          status === 'needs' ? 'bg-yellow-500/10 text-yellow-400' :
          status === 'poor' ? 'bg-red-500/10 text-red-400' :
          'bg-slate-500/10 text-slate-400'
        )}>
          {status === 'n/a' ? 'No data' : status === 'needs' ? 'Needs improvement' : status}
        </span>
      </div>
      <p className={clsx(
        'text-2xl font-bold',
        status === 'good' ? 'text-green-400' :
        status === 'needs' ? 'text-yellow-400' :
        status === 'poor' ? 'text-red-400' : 'text-muted'
      )}>{display}</p>
    </div>
  )
}

function ErrorRow({ error, onResolve }: { error: APMError; onResolve: () => void }) {
  return (
    <tr className="border-b border-[var(--border)]/50 hover:bg-white/[0.02]">
      <td className="px-5 py-4">
        <p className="text-sm font-medium app-title">{error.error_type}</p>
        <p className="text-xs text-muted truncate max-w-xs">{error.error_message}</p>
      </td>
      <td className="px-5 py-4">
        <span className="text-sm font-bold text-red-400">{error.count}</span>
      </td>
      <td className="px-5 py-4 text-xs text-muted">{new Date(error.first_seen).toLocaleDateString()}</td>
      <td className="px-5 py-4 text-xs text-muted">{new Date(error.last_seen).toLocaleString()}</td>
      <td className="px-5 py-4">
        {!error.is_resolved ? (
          <button
            onClick={onResolve}
            className="text-xs font-medium text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-2.5 py-1 rounded-lg transition-colors"
          >
            Resolve
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />Resolved
          </span>
        )}
      </td>
    </tr>
  )
}

export default function ApmDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  const [window, setWindow] = useState(24)
  const qc = useQueryClient()

  const { data: overview } = useQuery({
    queryKey: ['apm-overview', window],
    queryFn: () => apmApi.overview(window).then(r => r.data),
    refetchInterval: 30_000,
  })
  const { data: transactions = [] } = useQuery({
    queryKey: ['apm-transactions', window],
    queryFn: () => apmApi.listTransactions({ window_hours: window, limit: 50 }).then(r => r.data),
    enabled: tab === 'transactions',
  })
  const { data: errors = [] } = useQuery({
    queryKey: ['apm-errors'],
    queryFn: () => apmApi.listErrors().then(r => r.data),
    enabled: tab === 'errors',
  })
  const { data: vitals } = useQuery({
    queryKey: ['web-vitals', window],
    queryFn: () => apmApi.webVitals({ window_hours: window }).then(r => r.data),
    enabled: tab === 'rum',
  })

  const resolveError = useMutation({
    mutationFn: (id: number) => apmApi.resolveError(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apm-errors'] }),
  })

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: BarChart2 },
    { id: 'transactions' as Tab, label: 'Transactions', icon: Activity },
    { id: 'errors' as Tab, label: 'Errors', icon: AlertCircle },
    { id: 'rum' as Tab, label: 'Real User Monitoring', icon: Monitor },
  ]

  return (
    <div className="p-6 space-y-6">
      <Header title="Application Performance Monitoring" />

      {/* Tabs + window selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                tab === id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              )}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
        <select
          className="input-field text-sm"
          value={window}
          onChange={e => setWindow(parseInt(e.target.value))}
        >
          <option value={1}>Last 1 hour</option>
          <option value={6}>Last 6 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={72}>Last 3 days</option>
        </select>
      </div>

      {/* Overview */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Throughput</p>
              <p className="text-2xl font-bold text-primary-400">{overview.total_transactions}</p>
              <p className="text-xs text-muted mt-1">transactions</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Avg Response</p>
              <p className={clsx('text-2xl font-bold', overview.avg_duration_ms > 1000 ? 'text-red-400' : overview.avg_duration_ms > 500 ? 'text-yellow-400' : 'text-green-400')}>
                {Math.round(overview.avg_duration_ms)}ms
              </p>
              <p className="text-xs text-muted mt-1">average</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">P95 Latency</p>
              <p className="text-2xl font-bold text-yellow-400">{Math.round(overview.p95_duration_ms)}ms</p>
              <p className="text-xs text-muted mt-1">95th percentile</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Error Rate</p>
              <p className={clsx('text-2xl font-bold', overview.error_rate > 5 ? 'text-red-400' : overview.error_rate > 1 ? 'text-yellow-400' : 'text-green-400')}>
                {overview.error_rate}%
              </p>
              <p className="text-xs text-muted mt-1">{overview.error_count} errors</p>
            </div>
          </div>

          {/* Slow transactions */}
          {overview.slow_transactions.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h3 className="font-semibold app-title flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />Slowest Transactions
                </h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Transaction</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Duration</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.slow_transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-sm font-medium app-title">{tx.name}</td>
                      <td className="px-5 py-3">
                        <span className={clsx(
                          'text-sm font-bold',
                          tx.duration_ms > 2000 ? 'text-red-400' : tx.duration_ms > 1000 ? 'text-yellow-400' : 'text-green-400'
                        )}>
                          {Math.round(tx.duration_ms)}ms
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {tx.is_error ? (
                          <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" />Error</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" />{tx.status_code || 200}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">{new Date(tx.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions tab */}
      {tab === 'transactions' && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold app-title">Recent Transactions</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-muted">No transactions recorded yet. Ingest data via the API.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Transaction</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Trace ID</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-sm font-medium app-title">{tx.name}</td>
                    <td className="px-5 py-3">
                      <span className={clsx(
                        'text-sm font-bold',
                        tx.duration_ms > 2000 ? 'text-red-400' : tx.duration_ms > 1000 ? 'text-yellow-400' : 'text-green-400'
                      )}>
                        {Math.round(tx.duration_ms)}ms
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={clsx(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        tx.is_error ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                      )}>
                        {tx.status_code || (tx.is_error ? 'Error' : '200')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted font-mono">{tx.trace_id?.slice(0, 12) || '—'}</td>
                    <td className="px-5 py-3 text-xs text-muted">{new Date(tx.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Errors tab */}
      {tab === 'errors' && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold app-title flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />Error Tracking
            </h3>
          </div>
          {errors.length === 0 ? (
            <div className="p-12 text-center text-muted">No errors tracked yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Error</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Count</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">First Seen</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Last Seen</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {errors.map(err => (
                  <ErrorRow key={err.id} error={err} onResolve={() => resolveError.mutate(err.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* RUM tab */}
      {tab === 'rum' && vitals && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <VitalCard label="LCP" value={vitals.avg_lcp} metric="lcp" />
            <VitalCard label="FID" value={vitals.avg_fid} metric="fid" />
            <VitalCard label="CLS" value={vitals.avg_cls} metric="cls" />
            <VitalCard label="TTFB" value={vitals.avg_ttfb} metric="ttfb" />
            <VitalCard label="FCP" value={vitals.avg_fcp} metric="fcp" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { title: 'By Device', data: vitals.by_device },
              { title: 'By Browser', data: vitals.by_browser },
              { title: 'By Country', data: vitals.by_country },
            ].map(({ title, data }) => (
              <div key={title} className="glass-card p-5">
                <h3 className="font-semibold app-title text-sm mb-4">{title}</h3>
                {Object.entries(data).length === 0 ? (
                  <p className="text-sm text-muted">No data</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 8).map(([key, count]) => {
                      const total = Object.values(data).reduce((s: number, v) => s + (v as number), 0)
                      const pct = Math.round((count as number) / total * 100)
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted">{key}</span>
                            <span className="text-subtle">{count as number} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="glass-card p-5">
            <p className="text-sm text-muted">
              <span className="font-medium text-primary-400">{vitals.count}</span> page view samples collected in the last {window} hours.
              Use the <code className="bg-white/5 px-1 py-0.5 rounded text-xs">/apm/web-vitals</code> endpoint to ingest real user data from your web application.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
