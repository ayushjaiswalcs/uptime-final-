import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus,
  Trash2, Server, Cloud, Package, BarChart2
} from 'lucide-react'
import { costsApi, type CostSummary, type BudgetAlert, type ResourceInventory } from '../api/costs'
import Header from '../components/layout/Header'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import clsx from 'clsx'

type Tab = 'overview' | 'budgets' | 'inventory'

const PROVIDER_COLORS: Record<string, string> = {
  aws: '#FF9900',
  azure: '#0078D4',
  gcp: '#4285F4',
}

const PROVIDER_ICONS: Record<string, string> = {
  aws: 'AWS',
  azure: 'AZ',
  gcp: 'GCP',
}

function ProviderBadge({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider.toLowerCase()] || '#6366f1'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, backgroundColor: color + '22' }}>
      {PROVIDER_ICONS[provider.toLowerCase()] || provider.toUpperCase()}
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

export default function CostMonitoring() {
  const [tab, setTab] = useState<Tab>('overview')
  const [windowDays, setWindowDays] = useState(30)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showResourceForm, setShowResourceForm] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ name: '', provider: '', service: '', budget_amount: 1000, alert_threshold: 80, period: 'monthly' })
  const [resourceForm, setResourceForm] = useState({ provider: 'aws', resource_type: 'server', resource_id: '', resource_name: '', region: '', status: 'running', monthly_cost: '', owner: '' })
  const qc = useQueryClient()

  const { data: summary } = useQuery({
    queryKey: ['cost-summary', windowDays],
    queryFn: () => costsApi.summary(windowDays).then(r => r.data),
  })
  const { data: budgets = [] } = useQuery({
    queryKey: ['budget-alerts'],
    queryFn: () => costsApi.budgetAlerts().then(r => r.data),
    enabled: tab === 'budgets',
  })
  const { data: inventory = [] } = useQuery({
    queryKey: ['resource-inventory'],
    queryFn: () => costsApi.inventory().then(r => r.data),
    enabled: tab === 'inventory',
  })

  const createBudget = useMutation({
    mutationFn: () => costsApi.createBudgetAlert(budgetForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budget-alerts'] }); setShowBudgetForm(false) },
  })
  const deleteBudget = useMutation({
    mutationFn: (id: number) => costsApi.deleteBudgetAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget-alerts'] }),
  })
  const createResource = useMutation({
    mutationFn: () => costsApi.addResource({
      ...resourceForm,
      monthly_cost: resourceForm.monthly_cost ? parseFloat(resourceForm.monthly_cost) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resource-inventory'] }); setShowResourceForm(false) },
  })
  const deleteResource = useMutation({
    mutationFn: (id: number) => costsApi.deleteResource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resource-inventory'] }),
  })

  const providerPieData = summary ? Object.entries(summary.by_provider).map(([name, value]) => ({ name, value })) : []
  const serviceData = summary ? Object.entries(summary.by_service).slice(0, 8).map(([name, value]) => ({ name, value })) : []

  return (
    <div className="p-6 space-y-6">
      <Header title="Cloud Cost Monitoring" />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Total Cost</p>
            <p className="text-2xl font-bold text-primary-400">${summary.total_cost.toLocaleString()}</p>
            <p className="text-xs text-muted mt-1">Last {summary.window_days} days</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">vs Previous</p>
            <div className="flex items-center gap-2">
              {summary.change_pct >= 0
                ? <TrendingUp className="w-5 h-5 text-red-400" />
                : <TrendingDown className="w-5 h-5 text-green-400" />
              }
              <p className={clsx('text-2xl font-bold', summary.change_pct >= 0 ? 'text-red-400' : 'text-green-400')}>
                {summary.change_pct >= 0 ? '+' : ''}{summary.change_pct}%
              </p>
            </div>
            <p className="text-xs text-muted mt-1">${summary.prev_period_cost.toLocaleString()} prior</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Providers</p>
            <p className="text-2xl font-bold text-blue-400">{Object.keys(summary.by_provider).length}</p>
            <div className="flex gap-1.5 mt-2">
              {Object.keys(summary.by_provider).map(p => <ProviderBadge key={p} provider={p} />)}
            </div>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Top Service</p>
            {summary.by_service && Object.keys(summary.by_service).length > 0 ? (
              <>
                <p className="text-lg font-bold text-purple-400 truncate">{Object.keys(summary.by_service)[0]}</p>
                <p className="text-xs text-muted mt-1">${Object.values(summary.by_service)[0].toLocaleString()}</p>
              </>
            ) : (
              <p className="text-muted text-sm">No data</p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {([
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'budgets', label: 'Budget Alerts', icon: AlertTriangle },
          { id: 'inventory', label: 'Resource Inventory', icon: Server },
        ] as const).map(({ id, label, icon: Icon }) => (
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

      {/* Overview */}
      {tab === 'overview' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Provider pie */}
          <div className="glass-card p-5">
            <h3 className="font-semibold app-title mb-4">Cost by Provider</h3>
            {providerPieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted text-sm">No cost data yet</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={providerPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                      {providerPieData.map((entry) => (
                        <Cell key={entry.name} fill={PROVIDER_COLORS[entry.name.toLowerCase()] || '#6366f1'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Cost']} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex gap-4 flex-wrap mt-2">
              {providerPieData.map(({ name, value }) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PROVIDER_COLORS[name.toLowerCase()] || '#6366f1' }} />
                  <span className="text-xs text-muted">{name.toUpperCase()}: <span className="text-white">${value.toLocaleString()}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Top services */}
          <div className="glass-card p-5">
            <h3 className="font-semibold app-title mb-4">Top Services</h3>
            {serviceData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted text-sm">No cost data yet</div>
            ) : (
              <div className="space-y-3">
                {serviceData.map(({ name, value }) => {
                  const maxVal = serviceData[0].value
                  const pct = Math.round((value / maxVal) * 100)
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted">{name}</span>
                        <span className="font-medium text-primary-400">${value.toLocaleString()}</span>
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

          {/* Top resources */}
          {summary.top_resources.length > 0 && (
            <div className="glass-card p-5 lg:col-span-2">
              <h3 className="font-semibold app-title mb-4">Top Cost Resources</h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {summary.top_resources.map(r => (
                  <div key={r.name} className="bg-white/[0.03] border border-[var(--border)] rounded-xl p-3">
                    <p className="text-xs text-muted truncate">{r.name}</p>
                    <p className="font-bold text-primary-400 mt-1">${r.cost.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Budget Alerts */}
      {tab === 'budgets' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowBudgetForm(true)} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />New Budget Alert
            </button>
          </div>
          {showBudgetForm && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold app-title">New Budget Alert</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Name</label>
                  <input className="input-field w-full" value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="AWS Monthly Budget" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Provider</label>
                  <select className="input-field w-full" value={budgetForm.provider} onChange={e => setBudgetForm(f => ({ ...f, provider: e.target.value }))}>
                    <option value="">All providers</option>
                    <option value="aws">AWS</option>
                    <option value="azure">Azure</option>
                    <option value="gcp">GCP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Budget ($)</label>
                  <input type="number" className="input-field w-full" value={budgetForm.budget_amount} onChange={e => setBudgetForm(f => ({ ...f, budget_amount: parseFloat(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Alert Threshold (%)</label>
                  <input type="number" className="input-field w-full" value={budgetForm.alert_threshold} onChange={e => setBudgetForm(f => ({ ...f, alert_threshold: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowBudgetForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={() => createBudget.mutate()} disabled={!budgetForm.name} className="btn-primary text-sm">Create</button>
              </div>
            </div>
          )}
          {budgets.length === 0 ? (
            <div className="glass-card p-12 text-center text-muted">No budget alerts configured</div>
          ) : (
            <div className="space-y-4">
              {budgets.map(alert => (
                <div key={alert.id} className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold app-title">{alert.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {alert.provider && <ProviderBadge provider={alert.provider} />}
                        <span className="text-xs text-muted">{alert.period} · ${alert.budget_amount.toLocaleString()} budget</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={clsx(
                        'text-xs font-semibold px-2.5 py-1 rounded-full capitalize',
                        alert.status === 'ok' ? 'bg-green-500/10 text-green-400' :
                        alert.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      )}>
                        {alert.status}
                      </span>
                      <button onClick={() => deleteBudget.mutate(alert.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <BudgetBar pct={alert.pct_used} status={alert.status} />
                  <div className="flex items-center justify-between mt-2 text-xs text-muted">
                    <span>${alert.current_spend.toLocaleString()} spent</span>
                    <span>{alert.pct_used}% of budget · alert at {alert.alert_threshold}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inventory */}
      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowResourceForm(true)} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />Add Resource
            </button>
          </div>
          {showResourceForm && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold app-title">Add Resource</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Provider</label>
                  <select className="input-field w-full" value={resourceForm.provider} onChange={e => setResourceForm(f => ({ ...f, provider: e.target.value }))}>
                    <option value="aws">AWS</option>
                    <option value="azure">Azure</option>
                    <option value="gcp">GCP</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Type</label>
                  <select className="input-field w-full" value={resourceForm.resource_type} onChange={e => setResourceForm(f => ({ ...f, resource_type: e.target.value }))}>
                    {['server', 'database', 'loadbalancer', 'storage', 'network', 'cdn', 'cache'].map(t => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Resource ID</label>
                  <input className="input-field w-full" value={resourceForm.resource_id} onChange={e => setResourceForm(f => ({ ...f, resource_id: e.target.value }))} placeholder="i-1234567890" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Name</label>
                  <input className="input-field w-full" value={resourceForm.resource_name} onChange={e => setResourceForm(f => ({ ...f, resource_name: e.target.value }))} placeholder="prod-web-01" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Region</label>
                  <input className="input-field w-full" value={resourceForm.region} onChange={e => setResourceForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Monthly Cost ($)</label>
                  <input type="number" className="input-field w-full" value={resourceForm.monthly_cost} onChange={e => setResourceForm(f => ({ ...f, monthly_cost: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowResourceForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={() => createResource.mutate()} disabled={!resourceForm.resource_id} className="btn-primary text-sm">Add</button>
              </div>
            </div>
          )}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="font-semibold app-title">Resources ({inventory.length})</h3>
            </div>
            {inventory.length === 0 ? (
              <div className="p-12 text-center text-muted text-sm">No resources in inventory</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Resource</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Provider</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Region</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Monthly Cost</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(r => (
                    <tr key={r.id} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02]">
                      <td className="px-5 py-4">
                        <p className="font-medium app-title text-sm">{r.resource_name || r.resource_id}</p>
                        <p className="text-xs text-muted font-mono">{r.resource_id}</p>
                      </td>
                      <td className="px-5 py-4"><ProviderBadge provider={r.provider} /></td>
                      <td className="px-5 py-4 text-sm text-muted capitalize">{r.resource_type}</td>
                      <td className="px-5 py-4 text-sm text-muted">{r.region || '—'}</td>
                      <td className="px-5 py-4">
                        <span className={clsx(
                          'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                          r.status === 'running' ? 'bg-green-500/10 text-green-400' :
                          r.status === 'stopped' ? 'bg-red-500/10 text-red-400' :
                          'bg-yellow-500/10 text-yellow-400'
                        )}>{r.status}</span>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-primary-400">
                        {r.monthly_cost ? `$${r.monthly_cost.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => deleteResource.mutate(r.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
