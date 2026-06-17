import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Plus, Trash2, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Clock, Shield, BarChart2
} from 'lucide-react'
import { slaApi, type SLAPolicy, type SLODefinition, type ErrorBudget } from '../api/sla'
import Header from '../components/layout/Header'
import { monitorsApi } from '../api/monitors'
import clsx from 'clsx'

type Tab = 'overview' | 'policies' | 'slos' | 'budgets'

function StatusBadge({ meets, label }: { meets: boolean; label: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
      meets ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
    )}>
      {meets ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

function BudgetBar({ pct, status }: { pct: number; status: string }) {
  return (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div
        className={clsx(
          'h-full rounded-full transition-all',
          status === 'ok' ? 'bg-green-500' :
          status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
        )}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

export default function SlaManagement() {
  const [tab, setTab] = useState<Tab>('overview')
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [showSLOForm, setShowSLOForm] = useState(false)
  const [policyForm, setPolicyForm] = useState({ name: '', availability_target: 99.9, response_time_target: 200, window_days: 30 })
  const [sloForm, setSloForm] = useState({ name: '', metric_type: 'availability', target_value: 99.9, window_days: 30, monitor_id: '' })
  const qc = useQueryClient()

  const { data: report } = useQuery({
    queryKey: ['sla-report'],
    queryFn: () => slaApi.complianceReport().then(r => r.data),
  })
  const { data: policies = [], isLoading: loadPolicies } = useQuery({
    queryKey: ['sla-policies'],
    queryFn: () => slaApi.listPolicies().then(r => r.data),
  })
  const { data: slos = [] } = useQuery({
    queryKey: ['slos'],
    queryFn: () => slaApi.listSLOs().then(r => r.data),
  })
  const { data: budgets = [] } = useQuery({
    queryKey: ['error-budgets'],
    queryFn: () => slaApi.errorBudgets().then(r => r.data),
  })
  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => monitorsApi.list().then(r => r.data),
  })

  const createPolicy = useMutation({
    mutationFn: () => slaApi.createPolicy(policyForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-policies'] }); setShowPolicyForm(false) },
  })
  const deletePolicy = useMutation({
    mutationFn: (id: number) => slaApi.deletePolicy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  })
  const createSLO = useMutation({
    mutationFn: () => slaApi.createSLO({ ...sloForm, monitor_id: sloForm.monitor_id ? parseInt(sloForm.monitor_id) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['slos'] }); setShowSLOForm(false) },
  })
  const deleteSLO = useMutation({
    mutationFn: (id: number) => slaApi.deleteSLO(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slos'] }),
  })

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Compliance Overview', icon: Shield },
    { id: 'policies', label: 'SLA Policies', icon: Target },
    { id: 'slos', label: 'SLO Definitions', icon: BarChart2 },
    { id: 'budgets', label: 'Error Budgets', icon: AlertTriangle },
  ]

  return (
    <div className="p-6 space-y-6">
      <Header title="SLA & SLO Management" />

      {/* Summary cards */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Monitors</p>
            <p className="text-2xl font-bold text-primary-400">{report.summary.total_monitors}</p>
            <p className="text-xs text-muted mt-1">Total monitored</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Avg Availability</p>
            <p className="text-2xl font-bold text-green-400">{report.summary.avg_availability}%</p>
            <p className="text-xs text-muted mt-1">30-day rolling</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">99.9% Compliant</p>
            <p className="text-2xl font-bold text-yellow-400">{report.summary.compliant_99_9}</p>
            <p className="text-xs text-muted mt-1">of {report.summary.total_monitors} monitors</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Compliance Rate</p>
            <p className="text-2xl font-bold text-purple-400">{report.summary.compliance_rate}%</p>
            <p className="text-xs text-muted mt-1">vs 99.9% target</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
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

      {/* Overview tab */}
      {tab === 'overview' && report && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold app-title">Per-Monitor SLA Compliance (30d)</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Monitor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">30d Availability</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">7d Availability</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Avg Latency</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Downtime</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">SLA Tiers</th>
              </tr>
            </thead>
            <tbody>
              {report.monitors.map(m => (
                <tr key={m.monitor_id} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <p className="font-medium app-title text-sm">{m.monitor_name}</p>
                    <p className="text-xs text-muted truncate max-w-[180px]">{m.url}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={clsx('text-sm font-semibold', m.availability_30d >= 99.9 ? 'text-green-400' : m.availability_30d >= 99 ? 'text-yellow-400' : 'text-red-400')}>
                      {m.availability_30d}%
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted">{m.availability_7d}%</td>
                  <td className="px-5 py-4 text-sm text-muted">{m.avg_latency_ms}ms</td>
                  <td className="px-5 py-4 text-sm text-muted">{m.downtime_minutes_30d}m</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1.5 flex-wrap">
                      <StatusBadge meets={m.meets_99_9} label="99.9%" />
                      <StatusBadge meets={m.meets_99_5} label="99.5%" />
                      <StatusBadge meets={m.meets_99_0} label="99.0%" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Policies tab */}
      {tab === 'policies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowPolicyForm(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />New Policy
            </button>
          </div>
          {showPolicyForm && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold app-title">New SLA Policy</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Name</label>
                  <input className="input-field w-full" value={policyForm.name}
                    onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} placeholder="Production SLA" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Availability Target (%)</label>
                  <input type="number" step="0.01" className="input-field w-full" value={policyForm.availability_target}
                    onChange={e => setPolicyForm(f => ({ ...f, availability_target: parseFloat(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Response Time Target (ms)</label>
                  <input type="number" className="input-field w-full" value={policyForm.response_time_target}
                    onChange={e => setPolicyForm(f => ({ ...f, response_time_target: parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Window (days)</label>
                  <input type="number" className="input-field w-full" value={policyForm.window_days}
                    onChange={e => setPolicyForm(f => ({ ...f, window_days: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPolicyForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={() => createPolicy.mutate()} disabled={!policyForm.name || createPolicy.isPending} className="btn-primary text-sm">
                  {createPolicy.isPending ? 'Creating...' : 'Create Policy'}
                </button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {policies.map(policy => (
              <div key={policy.id} className="glass-card p-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold app-title">{policy.name}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-muted">
                    <span>Availability: <span className="text-green-400 font-medium">{policy.availability_target}%</span></span>
                    <span>Latency: <span className="text-primary-400 font-medium">{policy.response_time_target}ms</span></span>
                    <span>Window: {policy.window_days}d</span>
                  </div>
                </div>
                <button onClick={() => deletePolicy.mutate(policy.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {!loadPolicies && policies.length === 0 && (
              <div className="glass-card p-10 text-center text-muted">No SLA policies defined yet.</div>
            )}
          </div>
        </div>
      )}

      {/* SLOs tab */}
      {tab === 'slos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowSLOForm(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />New SLO
            </button>
          </div>
          {showSLOForm && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold app-title">New SLO Definition</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Name</label>
                  <input className="input-field w-full" value={sloForm.name}
                    onChange={e => setSloForm(f => ({ ...f, name: e.target.value }))} placeholder="API Availability SLO" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Metric Type</label>
                  <select className="input-field w-full" value={sloForm.metric_type}
                    onChange={e => setSloForm(f => ({ ...f, metric_type: e.target.value }))}>
                    <option value="availability">Availability</option>
                    <option value="latency">Latency</option>
                    <option value="error_rate">Error Rate</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Target Value (%)</label>
                  <input type="number" step="0.01" className="input-field w-full" value={sloForm.target_value}
                    onChange={e => setSloForm(f => ({ ...f, target_value: parseFloat(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Monitor</label>
                  <select className="input-field w-full" value={sloForm.monitor_id}
                    onChange={e => setSloForm(f => ({ ...f, monitor_id: e.target.value }))}>
                    <option value="">All monitors</option>
                    {monitors.map((m: any) => <option key={m.id} value={m.id}>{m.monitor_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Window (days)</label>
                  <input type="number" className="input-field w-full" value={sloForm.window_days}
                    onChange={e => setSloForm(f => ({ ...f, window_days: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSLOForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={() => createSLO.mutate()} disabled={!sloForm.name || createSLO.isPending} className="btn-primary text-sm">
                  {createSLO.isPending ? 'Creating...' : 'Create SLO'}
                </button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {slos.map(slo => (
              <div key={slo.id} className="glass-card p-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold app-title">{slo.name}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-muted">
                    <span className="capitalize">{slo.metric_type.replace('_', ' ')}</span>
                    <span>Target: <span className="text-primary-400 font-medium">{slo.target_value}%</span></span>
                    <span>Window: {slo.window_days}d</span>
                    {slo.error_budget_minutes && (
                      <span>Error budget: <span className="text-yellow-400 font-medium">{slo.error_budget_minutes}m</span></span>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteSLO.mutate(slo.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Budgets tab */}
      {tab === 'budgets' && (
        <div className="space-y-4">
          {budgets.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <AlertTriangle className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No SLOs with monitor assignments to track budgets for.</p>
              <p className="text-sm text-subtle mt-1">Create SLOs with monitor links to see error budget tracking.</p>
            </div>
          ) : (
            budgets.map(budget => (
              <div key={budget.slo_id} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold app-title">{budget.slo_name}</p>
                    <p className="text-sm text-muted mt-0.5">
                      Current: <span className={clsx(
                        'font-medium',
                        budget.current >= budget.target ? 'text-green-400' : 'text-red-400'
                      )}>{budget.current}%</span>
                      {' '}/ Target: <span className="font-medium text-primary-400">{budget.target}%</span>
                    </p>
                  </div>
                  <span className={clsx(
                    'text-xs font-semibold px-2.5 py-1 rounded-full capitalize',
                    budget.status === 'ok' ? 'bg-green-500/10 text-green-400' :
                    budget.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-red-500/10 text-red-400'
                  )}>
                    {budget.status}
                  </span>
                </div>
                <BudgetBar pct={budget.budget_consumed_pct} status={budget.status} />
                <div className="flex items-center justify-between mt-2 text-xs text-muted">
                  <span>{budget.budget_consumed_pct}% consumed</span>
                  <span>{budget.budget_minutes_remaining}m remaining of {budget.budget_minutes_total}m</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
