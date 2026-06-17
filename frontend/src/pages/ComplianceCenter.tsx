import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, ChevronRight,
  ChevronDown, FileText, Database, Lock, Plus
} from 'lucide-react'
import { complianceApi, type ComplianceFramework, type ComplianceControl } from '../api/compliance'
import Header from '../components/layout/Header'
import clsx from 'clsx'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  compliant:     { label: 'Compliant',       color: 'text-green-400 bg-green-500/10',    icon: CheckCircle },
  non_compliant: { label: 'Non-compliant',   color: 'text-red-400 bg-red-500/10',       icon: XCircle },
  in_progress:   { label: 'In Progress',     color: 'text-yellow-400 bg-yellow-500/10', icon: Clock },
  not_started:   { label: 'Not Started',     color: 'text-slate-400 bg-slate-500/10',   icon: AlertTriangle },
  na:            { label: 'Not Applicable',  color: 'text-slate-500 bg-slate-600/10',   icon: Shield },
}

const DATA_TYPES = ['monitor_logs', 'audit_logs', 'incidents', 'apm_transactions', 'web_vitals']

function CircleProgress({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = size * 0.4
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.07} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={size * 0.07}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="bold">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

function FrameworkCard({ fw, onClick, selected }: { fw: ComplianceFramework; onClick: () => void; selected: boolean }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'glass-card p-5 cursor-pointer transition-all hover:border-primary-500/30',
        selected ? 'border-primary-500/50' : ''
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold app-title">{fw.name}</p>
          <p className="text-xs text-muted mt-0.5">{fw.version}</p>
        </div>
        <CircleProgress pct={fw.compliance_pct} size={56} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{fw.compliant_controls}/{fw.total_controls} controls</span>
        <span className={clsx(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          fw.compliance_pct >= 80 ? 'bg-green-500/10 text-green-400' :
          fw.compliance_pct >= 50 ? 'bg-yellow-500/10 text-yellow-400' :
          'bg-red-500/10 text-red-400'
        )}>
          {fw.compliance_pct >= 80 ? 'Good' : fw.compliance_pct >= 50 ? 'Partial' : 'Needs work'}
        </span>
      </div>
    </div>
  )
}

function ControlRow({ control, onUpdate }: { control: ComplianceControl; onUpdate: (status: string, notes?: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(control.notes || '')
  const statusCfg = STATUS_CONFIG[control.status] || STATUS_CONFIG.not_started
  const StatusIcon = statusCfg.icon

  return (
    <div className="border-b border-[var(--border)]/50 last:border-0">
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted">{control.control_id}</span>
            <span className="text-xs text-subtle">·</span>
            <span className="text-xs text-muted">{control.category}</span>
          </div>
          <p className="font-medium app-title text-sm mt-0.5">{control.title}</p>
        </div>
        <span className={clsx('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0', statusCfg.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>
      </div>
      {expanded && (
        <div className="px-5 pb-4 pl-13 space-y-3 ml-8">
          {control.description && (
            <p className="text-sm text-muted">{control.description}</p>
          )}
          <div>
            <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Evidence / Notes</label>
            <textarea
              rows={2}
              className="input-field w-full text-sm resize-none"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add evidence or notes..."
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
              const Icon = cfg.icon
              return (
                <button
                  key={status}
                  onClick={() => onUpdate(status, notes)}
                  className={clsx(
                    'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all',
                    control.status === status
                      ? cfg.color + ' border-current'
                      : 'border-[var(--border)] text-muted hover:border-white/20'
                  )}
                >
                  <Icon className="w-3 h-3" />{cfg.label}
                </button>
              )
            })}
          </div>
          {control.assessed_at && (
            <p className="text-xs text-muted">Last assessed: {new Date(control.assessed_at).toLocaleDateString()}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ComplianceCenter() {
  const [selectedFw, setSelectedFw] = useState<ComplianceFramework | null>(null)
  const [tab, setTab] = useState<'frameworks' | 'retention'>('frameworks')
  const [retentionForm, setRetentionForm] = useState({ data_type: 'monitor_logs', retention_days: 90, auto_delete: false })
  const qc = useQueryClient()

  const { data: frameworks = [], isLoading } = useQuery({
    queryKey: ['compliance-frameworks'],
    queryFn: () => complianceApi.frameworks().then(r => r.data),
  })
  const { data: controls = [] } = useQuery({
    queryKey: ['compliance-controls', selectedFw?.id],
    queryFn: () => complianceApi.controls(selectedFw!.id).then(r => r.data),
    enabled: !!selectedFw,
  })
  const { data: summary } = useQuery({
    queryKey: ['compliance-summary'],
    queryFn: () => complianceApi.summary().then(r => r.data),
  })
  const { data: retentionPolicies = [] } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: () => complianceApi.retentionPolicies().then(r => r.data),
    enabled: tab === 'retention',
  })

  const updateAssessment = useMutation({
    mutationFn: ({ controlId, status, notes }: { controlId: number; status: string; notes?: string }) =>
      complianceApi.updateAssessment(controlId, { status, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-controls'] })
      qc.invalidateQueries({ queryKey: ['compliance-frameworks'] })
      qc.invalidateQueries({ queryKey: ['compliance-summary'] })
    },
  })

  const createRetention = useMutation({
    mutationFn: () => complianceApi.createRetentionPolicy(retentionForm),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retention-policies'] }),
  })

  const categoryGroups = controls.reduce((acc, ctrl) => {
    const cat = ctrl.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ctrl)
    return acc
  }, {} as Record<string, ComplianceControl[]>)

  return (
    <div className="p-6 space-y-6">
      <Header title="Compliance & Governance" />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Frameworks</p>
            <p className="text-2xl font-bold text-primary-400">{summary.total_frameworks}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Total Controls</p>
            <p className="text-2xl font-bold text-blue-400">{summary.total_controls}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Compliant</p>
            <p className="text-2xl font-bold text-green-400">{summary.compliant_controls}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Overall Score</p>
            <p className={clsx(
              'text-2xl font-bold',
              summary.overall_compliance_pct >= 80 ? 'text-green-400' :
              summary.overall_compliance_pct >= 50 ? 'text-yellow-400' : 'text-red-400'
            )}>{summary.overall_compliance_pct}%</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {([
          { id: 'frameworks', label: 'Frameworks & Controls', icon: Shield },
          { id: 'retention', label: 'Data Retention', icon: Database },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelectedFw(null) }}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            )}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'frameworks' && !selectedFw && (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {frameworks.map(fw => (
                <FrameworkCard key={fw.id} fw={fw} selected={false} onClick={() => setSelectedFw(fw)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'frameworks' && selectedFw && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedFw(null)} className="text-sm text-muted hover:text-white transition-colors">
              ← All Frameworks
            </button>
            <span className="text-muted">/</span>
            <span className="text-sm font-medium app-title">{selectedFw.name}</span>
          </div>

          {Object.entries(categoryGroups).map(([category, ctls]) => (
            <div key={category} className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold app-title text-sm">{category}</h3>
                  <span className="text-xs text-muted">
                    {ctls.filter(c => c.status === 'compliant').length}/{ctls.length} compliant
                  </span>
                </div>
              </div>
              {ctls.map(ctrl => (
                <ControlRow
                  key={ctrl.id}
                  control={ctrl}
                  onUpdate={(status, notes) => updateAssessment.mutate({ controlId: ctrl.id, status, notes })}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'retention' && (
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <h3 className="font-semibold app-title">Create Retention Policy</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Data Type</label>
                <select className="input-field w-full" value={retentionForm.data_type}
                  onChange={e => setRetentionForm(f => ({ ...f, data_type: e.target.value }))}>
                  {DATA_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Retention (days)</label>
                <input type="number" className="input-field w-full" value={retentionForm.retention_days}
                  onChange={e => setRetentionForm(f => ({ ...f, retention_days: parseInt(e.target.value) }))} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={retentionForm.auto_delete}
                    onChange={e => setRetentionForm(f => ({ ...f, auto_delete: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-700 text-primary-600" />
                  <span className="text-sm app-title">Auto-delete</span>
                </label>
              </div>
            </div>
            <button onClick={() => createRetention.mutate()} disabled={createRetention.isPending} className="btn-primary text-sm">
              {createRetention.isPending ? 'Saving...' : 'Save Policy'}
            </button>
          </div>

          {retentionPolicies.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h3 className="font-semibold app-title">Active Policies</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Data Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Retention</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wider">Auto Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {retentionPolicies.map((p: any) => (
                    <tr key={p.id} className="border-b border-[var(--border)]/50">
                      <td className="px-5 py-3 text-sm app-title capitalize">{p.data_type.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-sm text-primary-400 font-medium">{p.retention_days} days</td>
                      <td className="px-5 py-3">
                        {p.auto_delete
                          ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Enabled</span>
                          : <span className="text-xs text-muted">Disabled</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
