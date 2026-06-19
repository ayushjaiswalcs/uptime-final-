import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Shield, Globe, MessageCircle, Smartphone, PhoneCall, Mail,
  Webhook, Clock, Check, X, Plus, Pencil, Trash2, Activity,
  AlertCircle, Bell, ArrowUpCircle, CheckCircle2, StopCircle, Radio,
  Layers, Zap, Eye, Monitor as MonitorIcon, Link2, Unlink2, Search,
  ExternalLink,
} from 'lucide-react'
import {
  escalationApi,
  type EscalationConfig,
  type EscalationLevel,
  type EscalationHistoryRow,
  type Channel,
  type EscalationStatus,
  type LevelInput,
  CHANNELS,
} from '../api/escalation'
import { monitorsApi, type Monitor, type MonitorBrief } from '../api/monitors'
import { useToast } from '../context/ToastContext'
import clsx from 'clsx'

// ─── Meta tables ──────────────────────────────────────────────────────────────

const STATUS_META: Record<EscalationStatus, { label: string; dot: string; cls: string }> = {
  active:   { label: 'Active',   dot: 'bg-green-400',  cls: 'text-green-400  bg-green-500/10  border-green-500/30'  },
  inactive: { label: 'Inactive', dot: 'bg-slate-400',  cls: 'text-slate-400  bg-slate-500/10  border-slate-500/30'  },
  draft:    { label: 'Draft',    dot: 'bg-amber-400',  cls: 'text-amber-400  bg-amber-500/10  border-amber-500/30'  },
}

const SEVERITY_META: Record<string, { cls: string }> = {
  NORMAL:   { cls: 'text-blue-400  bg-blue-500/10'   },
  WARNING:  { cls: 'text-amber-400 bg-amber-500/10'  },
  CRITICAL: { cls: 'text-red-400   bg-red-500/10'    },
  low:      { cls: 'text-blue-400  bg-blue-500/10'   },
  medium:   { cls: 'text-amber-400 bg-amber-500/10'  },
  high:     { cls: 'text-orange-400 bg-orange-500/10' },
  critical: { cls: 'text-red-400   bg-red-500/10'    },
}

const CHANNEL_META: Record<Channel, { label: string; Icon: any }> = {
  web:      { label: 'Web',      Icon: Globe       },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle},
  sms:      { label: 'SMS',      Icon: Smartphone  },
  call:     { label: 'Call',     Icon: PhoneCall   },
  email:    { label: 'Email',    Icon: Mail        },
  webhook:  { label: 'Webhook',  Icon: Webhook     },
}

const EVENT_META: Record<string, { label: string; Icon: any; cls: string }> = {
  incident_created:     { label: 'Incident Created',      Icon: AlertCircle,   cls: 'text-red-400    bg-red-500/10'     },
  escalation_triggered: { label: 'Escalation Triggered',  Icon: Radio,         cls: 'text-amber-400  bg-amber-500/10'   },
  notification_sent:    { label: 'Notification Sent',     Icon: Bell,          cls: 'text-primary-400 bg-primary-500/10' },
  level_changed:        { label: 'Level Changed',         Icon: ArrowUpCircle, cls: 'text-purple-400 bg-purple-500/10'  },
  incident_resolved:    { label: 'Incident Resolved',     Icon: CheckCircle2,  cls: 'text-green-400  bg-green-500/10'   },
  escalation_stopped:   { label: 'Escalation Stopped',    Icon: StopCircle,    cls: 'text-slate-400  bg-slate-500/10'   },
}

const STATUS_ROW_CLS: Record<string, string> = {
  sent:         'text-green-400  bg-green-500/10',
  failed:       'text-red-400    bg-red-500/10',
  acknowledged: 'text-purple-400 bg-purple-500/10',
  skipped:      'text-slate-400  bg-slate-500/10',
  info:         'text-blue-400   bg-blue-500/10',
}

type Tab = 'overview' | 'monitors' | 'policy' | 'history'

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EscalationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [editingLevel, setEditingLevel] = useState<{ level?: EscalationLevel; nextNumber: number } | null>(null)

  const configId = Number(id)

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['escalation-config', configId],
    queryFn: () => escalationApi.getConfig(configId).then(r => r.data),
    enabled: !!configId,
    refetchInterval: 30_000,
  })

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['escalation-history', configId],
    queryFn: () => escalationApi.listHistory({ config_id: configId, limit: 500 }).then(r => r.data),
    enabled: !!configId && tab === 'history',
    refetchInterval: 15_000,
  })

  const { data: attachedMonitors = [], isLoading: monitorsLoading } = useQuery({
    queryKey: ['escalation-config-monitors', configId],
    queryFn: () => escalationApi.listConfigMonitors(configId).then(r => r.data),
    enabled: !!configId && (tab === 'monitors' || tab === 'overview'),
    refetchInterval: 30_000,
  })

  const { data: allMonitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => monitorsApi.list().then(r => r.data),
    enabled: !!configId && tab === 'monitors',
  })

  const invalidateConfig = () => {
    qc.invalidateQueries({ queryKey: ['escalation-config', configId] })
    qc.invalidateQueries({ queryKey: ['escalation-configs'] })
    qc.invalidateQueries({ queryKey: ['escalation-config-monitors', configId] })
  }

  const attachMut = useMutation({
    mutationFn: (monitorId: number) => escalationApi.attachMonitor(configId, monitorId),
    onSuccess: () => { invalidateConfig(); qc.invalidateQueries({ queryKey: ['monitors'] }); toast('Monitor attached', 'success') },
    onError: () => toast('Attach failed', 'error'),
  })

  const detachMut = useMutation({
    mutationFn: (monitorId: number) => escalationApi.detachMonitor(configId, monitorId),
    onSuccess: () => { invalidateConfig(); qc.invalidateQueries({ queryKey: ['monitors'] }); toast('Monitor detached', 'success') },
    onError: () => toast('Detach failed', 'error'),
  })

  const deleteLevelMut = useMutation({
    mutationFn: (lid: number) => escalationApi.deleteLevel(lid),
    onSuccess: () => { invalidateConfig(); toast('Level removed', 'success') },
    onError: () => toast('Delete failed', 'error'),
  })

  const toggleChannelMut = useMutation({
    mutationFn: ({ level, channel }: { level: EscalationLevel; channel: Channel }) =>
      escalationApi.setChannels(level.id, { [channel]: !level.channels[channel] }),
    onSuccess: () => invalidateConfig(),
  })

  if (configLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading escalation policy…</span>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-muted mx-auto mb-3" />
        <p className="text-muted">Policy not found</p>
        <button onClick={() => navigate('/escalation')} className="btn-secondary text-sm mt-4">
          Back to Matrix
        </button>
      </div>
    )
  }

  const status = config.status ?? (config.is_active ? 'active' : 'inactive')
  const sm = STATUS_META[status as EscalationStatus] ?? STATUS_META.inactive

  return (
    <div className="p-6 space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/escalation')}
          className="mt-0.5 p-2 text-muted hover:text-white hover:bg-white/5 rounded-xl transition-colors border border-[var(--border)]"
          title="Back to Escalation Matrix"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold app-title">{config.name}</h1>
              <p className="text-sm text-muted mt-0.5">{config.description || 'No description provided'}</p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-md', SEVERITY_META[config.severity]?.cls)}>
                {config.severity}
              </span>
              <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', sm.cls)}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', sm.dot)} />
                {sm.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {([
          { key: 'overview',  label: 'Overview',           Icon: Eye         },
          { key: 'monitors',  label: 'Attached Monitors',  Icon: MonitorIcon },
          { key: 'policy',    label: 'Escalation Policy',  Icon: Layers      },
          { key: 'history',   label: 'Escalation History', Icon: Activity    },
        ] as { key: Tab; label: string; Icon: any }[]).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-muted hover:text-[var(--text)]'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === 'monitors' && attachedMonitors.length > 0 && (
              <span className="ml-1 text-xs bg-primary-500/15 text-primary-400 px-1.5 py-0.5 rounded-full font-medium">
                {attachedMonitors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab config={config} status={status as EscalationStatus} attachedCount={attachedMonitors.length} />
      )}
      {tab === 'monitors' && (
        <AttachedMonitorsTab
          configId={configId}
          attached={attachedMonitors}
          allMonitors={allMonitors}
          isLoading={monitorsLoading}
          onAttach={id => attachMut.mutate(id)}
          onDetach={id => {
            if (confirm('Remove this monitor from the policy?')) detachMut.mutate(id)
          }}
        />
      )}
      {tab === 'policy' && (
        <PolicyTab
          config={config}
          onAddLevel={() => setEditingLevel({
            nextNumber: Math.max(0, ...config.levels.map(l => l.level_number)) + 1,
          })}
          onEditLevel={level => setEditingLevel({ level, nextNumber: level.level_number })}
          onDeleteLevel={id => {
            if (confirm('Remove this escalation level?')) deleteLevelMut.mutate(id)
          }}
          onToggleChannel={(level, channel) => toggleChannelMut.mutate({ level, channel })}
        />
      )}
      {tab === 'history' && (
        <HistoryTab rows={history} isLoading={historyLoading} />
      )}

      {/* Level editor modal */}
      {editingLevel && (
        <LevelModal
          configId={configId}
          level={editingLevel.level}
          nextNumber={editingLevel.nextNumber}
          onClose={() => setEditingLevel(null)}
          onSaved={() => { setEditingLevel(null); invalidateConfig() }}
        />
      )}
    </div>
  )
}

// ─── Tab 1: Overview ──────────────────────────────────────────────────────────

function OverviewTab({ config, status, attachedCount }: {
  config: EscalationConfig; status: EscalationStatus; attachedCount: number
}) {
  const sm = STATUS_META[status] ?? STATUS_META.inactive

  const stats = [
    { label: 'Total Levels',        value: config.total_levels ?? config.levels.length, Icon: Layers,      color: 'text-primary-400 bg-primary-500/10' },
    { label: 'Attached Monitors',   value: attachedCount,                                Icon: MonitorIcon, color: 'text-cyan-400    bg-cyan-500/10'    },
    { label: 'Total Notifications', value: config.total_notifications ?? 0,             Icon: Bell,        color: 'text-amber-400   bg-amber-500/10'   },
    { label: 'Active Channels',
      value: config.levels.reduce((acc, l) => acc + Object.values(l.channels).filter(Boolean).length, 0),
      Icon: Zap, color: 'text-green-400 bg-green-500/10' },
  ]

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Policy Name',   value: config.name },
    { label: 'Description',   value: config.description || <span className="text-subtle italic">None</span> },
    {
      label: 'Status',
      value: (
        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', sm.cls)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', sm.dot)} />{sm.label}
        </span>
      ),
    },
    {
      label: 'Severity',
      value: (
        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-md', SEVERITY_META[config.severity]?.cls)}>
          {config.severity}
        </span>
      ),
    },
    { label: 'Created By',   value: config.created_by || '—' },
    {
      label: 'Created Date',
      value: config.created_at
        ? new Date(config.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : '—',
    },
    {
      label: 'Last Updated',
      value: config.updated_at
        ? new Date(config.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : '—',
    },
    { label: 'Scope', value: config.monitor_id ? `Monitor #${config.monitor_id}` : 'All monitors' },
    { label: 'Default Policy', value: config.is_default ? 'Yes' : 'No' },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, Icon, color }) => (
          <div key={label} className="glass-card p-5 flex items-center gap-4">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold app-title">{value}</p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Metadata grid */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold app-title text-sm">Policy Details</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
          {[fields.slice(0, Math.ceil(fields.length / 2)), fields.slice(Math.ceil(fields.length / 2))].map((group, gi) => (
            <div key={gi} className="divide-y divide-[var(--border)]">
              {group.map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4 px-5 py-3.5">
                  <span className="text-xs text-subtle font-medium w-32 shrink-0 pt-0.5">{label}</span>
                  <span className="text-sm app-title flex-1">{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Channel coverage summary */}
      {config.levels.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold app-title text-sm">Channel Coverage</h3>
            <p className="text-xs text-muted mt-0.5">Channels enabled across all escalation levels</p>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            {CHANNELS.map(ch => {
              const meta = CHANNEL_META[ch]
              const enabledCount = config.levels.filter(l => l.channels[ch]).length
              const total = config.levels.length
              const on = enabledCount > 0
              return (
                <div key={ch} className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm',
                  on ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-[var(--border)] text-muted'
                )}>
                  <meta.Icon className="w-4 h-4" />
                  <span className="font-medium">{meta.label}</span>
                  <span className="text-xs opacity-60">{enabledCount}/{total}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Escalation Policy ─────────────────────────────────────────────────

function PolicyTab({
  config, onAddLevel, onEditLevel, onDeleteLevel, onToggleChannel,
}: {
  config: EscalationConfig
  onAddLevel: () => void
  onEditLevel: (level: EscalationLevel) => void
  onDeleteLevel: (id: number) => void
  onToggleChannel: (level: EscalationLevel, channel: Channel) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold app-title">Escalation Levels</h3>
          <p className="text-xs text-muted mt-0.5">
            Notifications escalate through levels in order. Final level has no timer.
          </p>
        </div>
        <button onClick={onAddLevel} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />Add Level
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-white/[0.02]">
                {[
                  'Level', 'Escalation Name', 'Timer',
                  ...CHANNELS.map(ch => CHANNEL_META[ch].label),
                  'Status', 'Actions',
                ].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-subtle uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {config.levels.length === 0 ? (
                <tr>
                  <td colSpan={9 + CHANNELS.length} className="px-4 py-10 text-center">
                    <Layers className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">No levels configured</p>
                    <p className="text-subtle text-xs mt-1">Add L1 to start the escalation chain</p>
                  </td>
                </tr>
              ) : config.levels.map((level, idx) => {
                const isLast = idx === config.levels.length - 1
                return (
                  <tr key={level.id} className="hover:bg-white/[0.02] transition-colors group">
                    {/* Level badge */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500/15 text-primary-400 text-xs font-bold">
                        L{level.level_number}
                      </span>
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3.5 font-medium app-title">{level.escalation_name}</td>
                    {/* Timer */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Clock className="w-3.5 h-3.5 text-muted" />
                        {level.timer_minutes === null
                          ? <span className="text-purple-400 font-semibold">Final</span>
                          : <span className="text-muted">{level.timer_minutes} min</span>
                        }
                      </span>
                    </td>
                    {/* Channel toggles */}
                    {CHANNELS.map(ch => {
                      const on = level.channels[ch]
                      const { Icon } = CHANNEL_META[ch]
                      return (
                        <td key={ch} className="px-3 py-3.5">
                          <button
                            onClick={() => onToggleChannel(level, ch)}
                            title={`${CHANNEL_META[ch].label}: ${on ? 'ON (click to disable)' : 'OFF (click to enable)'}`}
                            className={clsx(
                              'w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors',
                              on
                                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                : 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20'
                            )}
                          >
                            {on ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      )
                    })}
                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={clsx(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        level.is_active ? 'text-green-400 bg-green-500/10' : 'text-slate-500 bg-slate-500/10'
                      )}>
                        {level.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEditLevel(level)}
                          className="p-1.5 text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors"
                          title="Edit level"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteLevel(level.id)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete level"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      {config.levels.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-subtle px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-500/15 inline-flex items-center justify-center">
              <Check className="w-2 h-2 text-green-400" />
            </span>
            Channel enabled — notifies at this level
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-500/10 inline-flex items-center justify-center">
              <X className="w-2 h-2 text-slate-500" />
            </span>
            Channel disabled
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Timer = minutes before advancing to next level. Final = last level, escalation stops.
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Attached Monitors ─────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  up: 'bg-green-400', down: 'bg-red-400', paused: 'bg-slate-400', pending: 'bg-amber-400',
}

function AttachedMonitorsTab({
  configId, attached, allMonitors, isLoading, onAttach, onDetach,
}: {
  configId: number
  attached: MonitorBrief[]
  allMonitors: Monitor[]
  isLoading: boolean
  onAttach: (id: number) => void
  onDetach: (id: number) => void
}) {
  const [search, setSearch] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [showAddPanel, setShowAddPanel] = useState(false)

  const attachedIds = new Set(attached.map(m => m.id))

  const filtered = attached.filter(m =>
    !search || m.monitor_name.toLowerCase().includes(search.toLowerCase()) ||
    m.target_url.toLowerCase().includes(search.toLowerCase())
  )

  const unattached = allMonitors.filter(m => !attachedIds.has(m.id))
  const addFiltered = unattached.filter(m =>
    !addSearch || m.monitor_name.toLowerCase().includes(addSearch.toLowerCase()) ||
    m.target_url.toLowerCase().includes(addSearch.toLowerCase())
  )

  if (isLoading) return <div className="glass-card p-12 text-center text-muted">Loading monitors…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold app-title">Attached Monitors</h3>
          <p className="text-xs text-muted mt-0.5">
            When any attached monitor goes DOWN, this escalation policy triggers automatically.
          </p>
        </div>
        <button
          onClick={() => setShowAddPanel(v => !v)}
          className={clsx('btn-primary text-sm flex items-center gap-1.5', showAddPanel && 'opacity-80')}
        >
          <Link2 className="w-3.5 h-3.5" />
          Attach Monitor
        </button>
      </div>

      {/* Add monitor panel */}
      {showAddPanel && (
        <div className="glass-card border border-primary-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2 bg-primary-500/5">
            <Search className="w-4 h-4 text-muted" />
            <input
              className="bg-transparent text-sm flex-1 outline-none placeholder:text-subtle"
              placeholder="Search monitors to attach…"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              autoFocus
            />
            <button onClick={() => setShowAddPanel(false)} className="text-muted hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border)]">
            {addFiltered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted">
                {unattached.length === 0 ? 'All monitors already attached' : 'No monitors match your search'}
              </div>
            ) : addFiltered.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <MonitorIcon className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium app-title truncate">{m.monitor_name}</p>
                  <p className="text-xs text-muted truncate">
                    {m.monitor_type.toUpperCase()} · {m.target_url}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('w-2 h-2 rounded-full', STATUS_DOT[m.current_status] ?? 'bg-slate-400')} />
                  <button
                    onClick={() => { onAttach(m.id); setShowAddPanel(false) }}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    Attach
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attached monitors table */}
      <div className="glass-card overflow-hidden">
        {attached.length > 0 && (
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2 bg-white/[0.01]">
            <Search className="w-4 h-4 text-muted" />
            <input
              className="bg-transparent text-sm flex-1 outline-none placeholder:text-subtle"
              placeholder="Filter attached monitors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-white/[0.02]">
                {['Monitor Name', 'Type', 'URL', 'Status', 'Last Check', 'Actions'].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-subtle uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <MonitorIcon className="w-10 h-10 text-muted mx-auto mb-3" />
                    <p className="text-muted text-sm">
                      {attached.length === 0 ? 'No monitors attached yet' : 'No monitors match filter'}
                    </p>
                    <p className="text-subtle text-xs mt-1">
                      {attached.length === 0
                        ? 'Attach monitors to trigger this policy when they go DOWN'
                        : 'Try clearing the search'}
                    </p>
                  </td>
                </tr>
              ) : filtered.map(m => (
                <tr key={m.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <MonitorIcon className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <p className="font-medium app-title text-sm">{m.monitor_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-mono text-muted uppercase">{m.monitor_type}</span>
                  </td>
                  <td className="px-4 py-3.5 max-w-[200px]">
                    <p className="text-xs text-muted truncate">{m.target_url}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                      m.current_status === 'up'     ? 'text-green-400 bg-green-500/10' :
                      m.current_status === 'down'   ? 'text-red-400   bg-red-500/10'   :
                      m.current_status === 'paused' ? 'text-slate-400 bg-slate-500/10' :
                                                      'text-amber-400 bg-amber-500/10'
                    )}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOT[m.current_status] ?? 'bg-slate-400')} />
                      {m.current_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-xs text-muted">
                      {m.last_checked_at
                        ? new Date(m.last_checked_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => onDetach(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg"
                      title="Remove from policy"
                    >
                      <Unlink2 className="w-3.5 h-3.5" />Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {attached.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border)] bg-white/[0.01]">
            <p className="text-xs text-muted">{attached.length} monitor{attached.length !== 1 ? 's' : ''} attached</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 4: Escalation History ────────────────────────────────────────────────

function HistoryTab({ rows, isLoading }: { rows: EscalationHistoryRow[]; isLoading: boolean }) {
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')

  let filtered = rows
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(r =>
      String(r.incident_id).includes(q) ||
      (r.monitor_name ?? '').toLowerCase().includes(q) ||
      (r.channel ?? '').toLowerCase().includes(q) ||
      (r.target ?? '').toLowerCase().includes(q) ||
      (r.event_type ?? '').toLowerCase().includes(q)
    )
  }
  if (severityFilter !== 'all') {
    filtered = filtered.filter(r => (r.severity ?? '').toLowerCase() === severityFilter)
  }

  if (isLoading) return (
    <div className="glass-card p-12 text-center text-muted">Loading history…</div>
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            className="input-field pl-9 w-full text-sm"
            placeholder="Search incidents, monitors, channels…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-xl p-1 border border-[var(--border)]">
          {['all', 'critical', 'high', 'medium', 'low'].map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                severityFilter === s
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              {s === 'all' ? 'All Severities' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-white/[0.02]">
                {[
                  'Incident ID', 'Monitor Name', 'Monitor Type',
                  'Severity', 'Esc. Level', 'Trigger Time',
                  'Channel', 'User Notified', 'Status', 'Resolution Time',
                ].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-subtle uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <Activity className="w-10 h-10 text-muted mx-auto mb-3" />
                    <p className="text-muted text-sm">No escalation events yet</p>
                    <p className="text-subtle text-xs mt-1">Events appear when monitors go DOWN and trigger this policy</p>
                  </td>
                </tr>
              ) : filtered.map(row => <HistoryRow key={row.id} row={row} />)}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border)] bg-white/[0.01]">
            <p className="text-xs text-muted">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryRow({ row }: { row: EscalationHistoryRow }) {
  const em = EVENT_META[row.event_type] ?? { label: row.event_type, Icon: Activity, cls: 'text-muted bg-slate-500/10' }
  const sevm = SEVERITY_META[(row.severity ?? '').toLowerCase()] ?? { cls: 'text-muted' }
  const statusCls = STATUS_ROW_CLS[row.status ?? 'info'] ?? STATUS_ROW_CLS.info

  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      {/* Incident ID */}
      <td className="px-4 py-3.5">
        <span className="font-mono text-xs font-semibold text-primary-400">
          INC-{String(row.incident_id).padStart(3, '0')}
        </span>
      </td>
      {/* Monitor Name */}
      <td className="px-4 py-3.5">
        <p className="text-sm font-medium app-title max-w-[140px] truncate">
          {row.monitor_name ?? `Monitor #${row.monitor_id}`}
        </p>
      </td>
      {/* Monitor Type */}
      <td className="px-4 py-3.5">
        <span className="text-xs text-muted capitalize">{row.monitor_type ?? '—'}</span>
      </td>
      {/* Severity */}
      <td className="px-4 py-3.5">
        {row.severity ? (
          <span className={clsx('text-xs font-semibold uppercase px-2 py-0.5 rounded-md', sevm.cls)}>
            {row.severity}
          </span>
        ) : <span className="text-subtle text-xs">—</span>}
      </td>
      {/* Escalation Level */}
      <td className="px-4 py-3.5">
        {row.level_number != null ? (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 text-xs font-bold">
            L{row.level_number}
          </span>
        ) : <span className="text-subtle text-xs">—</span>}
      </td>
      {/* Trigger Time */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-xs text-muted">
          {new Date(row.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      </td>
      {/* Channel */}
      <td className="px-4 py-3.5">
        {row.channel ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-400">
            {row.channel in CHANNEL_META
              ? (() => { const { Icon } = CHANNEL_META[row.channel as Channel]; return <Icon className="w-3 h-3" /> })()
              : null}
            {row.channel}
          </span>
        ) : <span className="text-subtle text-xs">—</span>}
      </td>
      {/* User Notified */}
      <td className="px-4 py-3.5">
        <span className="text-xs text-muted max-w-[120px] truncate block">{row.target || '—'}</span>
      </td>
      {/* Status */}
      <td className="px-4 py-3.5">
        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full capitalize', statusCls)}>
          {row.status || 'info'}
        </span>
      </td>
      {/* Resolution Time */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-xs text-muted">
          {row.recovery_time
            ? new Date(row.recovery_time).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
            : <span className="text-subtle">—</span>}
        </span>
      </td>
    </tr>
  )
}

// ─── Level Modal ──────────────────────────────────────────────────────────────

const ALL_CHANNEL_META: Record<Channel, { label: string; Icon: any }> = CHANNEL_META

function LevelModal({
  configId, level, nextNumber, onClose, onSaved,
}: {
  configId: number
  level?: EscalationLevel
  nextNumber: number
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = !!level

  const [name, setName] = useState(level?.escalation_name ?? '')
  const [isFinal, setIsFinal] = useState(level ? level.timer_minutes === null : false)
  const [timer, setTimer] = useState<number>(level?.timer_minutes ?? 5)
  const [target, setTarget] = useState(level?.notify_target ?? '')
  const [isActive, setIsActive] = useState(level?.is_active ?? true)
  const [channels, setChannels] = useState<Record<Channel, boolean>>(
    level?.channels ?? { web: true, whatsapp: false, sms: false, call: false, email: false, webhook: false }
  )

  const save = useMutation({
    mutationFn: async () => {
      const payload: LevelInput = {
        level_number: nextNumber,
        escalation_name: name,
        timer_minutes: isFinal ? null : Number(timer),
        notify_target: target || null,
        is_active: isActive,
        channels,
      }
      if (isEdit) {
        await escalationApi.updateLevel(level!.id, payload)
        await escalationApi.setChannels(level!.id, channels)
      } else {
        await escalationApi.addLevel(configId, payload)
      }
    },
    onSuccess: () => {
      toast(isEdit ? 'Level updated' : 'Level added', 'success')
      onSaved()
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? 'Save failed', 'error'),
  })

  const LABEL = 'text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="glass-card w-full max-w-lg p-6 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold app-title flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-400" />
            {isEdit ? `Edit Level L${level!.level_number}` : `Add Level L${nextNumber}`}
          </h3>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className={LABEL}>Escalation Name</label>
          <input
            className="input-field w-full"
            placeholder="e.g. L1 On-call Engineer"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className={LABEL}>Notify Target (role / user / email)</label>
          <input
            className="input-field w-full"
            placeholder="e.g. oncall@team.com or Team Lead"
            value={target}
            onChange={e => setTarget(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Timer (minutes)</label>
            <input
              type="number" min={1}
              className="input-field w-full disabled:opacity-40"
              disabled={isFinal}
              value={timer}
              onChange={e => setTimer(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-col justify-end gap-2.5">
            <label className="flex items-center gap-2 text-sm app-title cursor-pointer select-none">
              <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} className="rounded" />
              Final level (no timer)
            </label>
            <label className="flex items-center gap-2 text-sm app-title cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
              Active
            </label>
          </div>
        </div>

        <div>
          <label className={LABEL}>Notification Channels</label>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map(ch => {
              const { Icon, label } = ALL_CHANNEL_META[ch]
              const on = channels[ch]
              return (
                <button
                  key={ch}
                  onClick={() => setChannels(c => ({ ...c, [ch]: !c[ch] }))}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    on
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : 'border-[var(--border)] text-muted hover:text-white hover:border-[var(--border-strong)]'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            className="btn-primary text-sm flex-1"
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Level'}
          </button>
        </div>
      </div>
    </div>
  )
}
