import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertOctagon, Plus, Trash2, Copy, Power, Pencil, Globe, MessageCircle,
  Smartphone, PhoneCall, Mail, Webhook, Check, X, Clock, Shield,
} from 'lucide-react'
import {
  escalationApi, type EscalationConfig, type EscalationLevel, type Severity,
  type Channel, type LevelInput, CHANNELS,
} from '../api/escalation'
import Header from '../components/layout/Header'
import { useToast } from '../context/ToastContext'
import clsx from 'clsx'

const SEVERITY_META: Record<Severity, { label: string; cls: string; dot: string }> = {
  NORMAL:   { label: 'NORMAL',   cls: 'text-blue-400 border-blue-500/30 bg-blue-500/10',     dot: 'bg-blue-400' },
  WARNING:  { label: 'WARNING',  cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10',  dot: 'bg-amber-400' },
  CRITICAL: { label: 'CRITICAL', cls: 'text-red-400 border-red-500/30 bg-red-500/10',        dot: 'bg-red-400' },
}

// Columns shown inline in the matrix table (spec: Web/WhatsApp/SMS/Call).
const TABLE_CHANNELS: { key: Channel; label: string; icon: any }[] = [
  { key: 'web',      label: 'Web',      icon: Globe },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'sms',      label: 'SMS',      icon: Smartphone },
  { key: 'call',     label: 'Call',     icon: PhoneCall },
]

const ALL_CHANNEL_META: Record<Channel, { label: string; icon: any }> = {
  web:      { label: 'Web',      icon: Globe },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  sms:      { label: 'SMS',      icon: Smartphone },
  call:     { label: 'Call',     icon: PhoneCall },
  email:    { label: 'Email',    icon: Mail },
  webhook:  { label: 'Webhook',  icon: Webhook },
}

function fmtTimer(min: number | null) {
  if (min === null || min === undefined) return 'Final'
  return `${min} min`
}

export default function EscalationMatrix() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [filter, setFilter] = useState<Severity | 'ALL'>('ALL')
  const [editingLevel, setEditingLevel] = useState<{ configId: number; level?: EscalationLevel; nextNumber: number } | null>(null)
  const [showNewPolicy, setShowNewPolicy] = useState(false)

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['escalation-configs'],
    queryFn: () => escalationApi.listConfigs().then(r => r.data),
  })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['escalation-configs'] })
    qc.invalidateQueries({ queryKey: ['escalation-stats'] })
  }

  const toggleConfig = useMutation({
    mutationFn: (id: number) => escalationApi.toggleConfig(id),
    onSuccess: () => { invalidate(); toast('Policy status updated', 'success') },
  })
  const cloneConfig = useMutation({
    mutationFn: (id: number) => escalationApi.cloneConfig(id),
    onSuccess: () => { invalidate(); toast('Policy cloned (starts disabled)', 'success') },
  })
  const deleteConfig = useMutation({
    mutationFn: (id: number) => escalationApi.deleteConfig(id),
    onSuccess: () => { invalidate(); toast('Policy deleted', 'success') },
  })
  const deleteLevel = useMutation({
    mutationFn: (id: number) => escalationApi.deleteLevel(id),
    onSuccess: () => { invalidate(); toast('Level removed', 'success') },
  })
  const toggleChannel = useMutation({
    mutationFn: ({ level, channel }: { level: EscalationLevel; channel: Channel }) =>
      escalationApi.setChannels(level.id, { [channel]: !level.channels[channel] }),
    onSuccess: () => invalidate(),
  })

  const shown = filter === 'ALL' ? configs : configs.filter(c => c.severity === filter)

  return (
    <div className="p-6 space-y-6">
      <Header title="Escalation Matrix" action={{ label: 'New Policy', onClick: () => setShowNewPolicy(true) }} />

      {/* Severity filter */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(['ALL', 'NORMAL', 'WARNING', 'CRITICAL'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              filter === s ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            )}
          >
            {s === 'ALL' ? 'All Severities' : SEVERITY_META[s].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted">Loading matrix…</div>
      ) : shown.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <AlertOctagon className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-muted">No escalation policies yet</p>
          <p className="text-sm text-subtle mt-1">Defaults seed automatically — or create a custom policy.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {shown.map(config => (
            <PolicyCard
              key={config.id}
              config={config}
              onToggle={() => toggleConfig.mutate(config.id)}
              onClone={() => cloneConfig.mutate(config.id)}
              onDelete={() => { if (confirm(`Delete policy "${config.name}"?`)) deleteConfig.mutate(config.id) }}
              onAddLevel={() => setEditingLevel({
                configId: config.id,
                nextNumber: Math.max(0, ...config.levels.map(l => l.level_number)) + 1,
              })}
              onEditLevel={(level) => setEditingLevel({ configId: config.id, level, nextNumber: level.level_number })}
              onDeleteLevel={(id) => deleteLevel.mutate(id)}
              onToggleChannel={(level, channel) => toggleChannel.mutate({ level, channel })}
            />
          ))}
        </div>
      )}

      {editingLevel && (
        <LevelModal
          configId={editingLevel.configId}
          level={editingLevel.level}
          nextNumber={editingLevel.nextNumber}
          onClose={() => setEditingLevel(null)}
          onSaved={() => { setEditingLevel(null); invalidate() }}
        />
      )}
      {showNewPolicy && (
        <PolicyModal onClose={() => setShowNewPolicy(false)} onSaved={() => { setShowNewPolicy(false); invalidate() }} />
      )}
    </div>
  )
}

function PolicyCard({ config, onToggle, onClone, onDelete, onAddLevel, onEditLevel, onDeleteLevel, onToggleChannel }: {
  config: EscalationConfig
  onToggle: () => void
  onClone: () => void
  onDelete: () => void
  onAddLevel: () => void
  onEditLevel: (level: EscalationLevel) => void
  onDeleteLevel: (id: number) => void
  onToggleChannel: (level: EscalationLevel, channel: Channel) => void
}) {
  const meta = SEVERITY_META[config.severity]
  return (
    <div className="glass-card overflow-hidden">
      {/* Policy header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border', meta.cls)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
          </span>
          <div>
            <p className="font-semibold app-title flex items-center gap-2">
              {config.name}
              {config.is_default && <span className="text-[10px] uppercase tracking-wider text-subtle border border-[var(--border)] rounded px-1.5 py-0.5">Default</span>}
            </p>
            <p className="text-xs text-muted">
              {config.monitor_id ? `Monitor #${config.monitor_id}` : 'All monitors'} · {config.levels.length} levels
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onToggle} title={config.is_active ? 'Disable' : 'Enable'}
            className={clsx('p-2 rounded-lg transition-colors', config.is_active ? 'text-green-400 hover:bg-green-500/10' : 'text-slate-500 hover:bg-slate-500/10')}>
            <Power className="w-4 h-4" />
          </button>
          <button onClick={onClone} title="Clone policy" className="p-2 text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onAddLevel} className="btn-secondary text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />Add Level
          </button>
          <button onClick={onDelete} title="Delete policy" className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-subtle uppercase tracking-wider border-b border-[var(--border)]">
              <th className="px-4 py-2.5">Severity</th>
              <th className="px-4 py-2.5">Level</th>
              <th className="px-4 py-2.5">Escalation Name</th>
              <th className="px-4 py-2.5">Timer</th>
              {TABLE_CHANNELS.map(c => <th key={c.key} className="px-3 py-2.5 text-center">{c.label}</th>)}
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.levels.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-muted">No levels — add L1 to start escalating.</td></tr>
            )}
            {config.levels.map(level => (
              <tr key={level.id} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <span className={clsx('text-xs font-medium', SEVERITY_META[config.severity].cls.split(' ')[0])}>{config.severity}</span>
                </td>
                <td className="px-4 py-3 font-bold app-title">L{level.level_number}</td>
                <td className="px-4 py-3 app-title">{level.escalation_name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Clock className="w-3.5 h-3.5" />
                    {level.timer_minutes === null
                      ? <span className="text-purple-400 font-medium">Final</span>
                      : fmtTimer(level.timer_minutes)}
                  </span>
                </td>
                {TABLE_CHANNELS.map(c => (
                  <td key={c.key} className="px-3 py-3 text-center">
                    <button
                      onClick={() => onToggleChannel(level, c.key)}
                      className={clsx(
                        'w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors',
                        level.channels[c.key]
                          ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                          : 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20'
                      )}
                      title={`${c.label}: ${level.channels[c.key] ? 'ON' : 'OFF'}`}
                    >
                      {level.channels[c.key] ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                ))}
                <td className="px-4 py-3">
                  <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                    level.is_active ? 'text-green-400 bg-green-500/10' : 'text-slate-500 bg-slate-500/10')}>
                    {level.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onEditLevel(level)} className="p-1.5 text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors" title="Edit level">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDeleteLevel(level.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete level">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LevelModal({ configId, level, nextNumber, onClose, onSaved }: {
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
    onSuccess: () => { toast(isEdit ? 'Level updated' : 'Level added', 'success'); onSaved() },
    onError: (e: any) => toast(e?.response?.data?.detail ?? 'Save failed', 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-card w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold app-title flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-400" />
            {isEdit ? `Edit Level L${level!.level_number}` : `Add Level L${nextNumber}`}
          </h3>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Escalation Name</label>
          <input className="input-field w-full" placeholder="L1 On-call Engineer" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Notify Target (role / user / email)</label>
          <input className="input-field w-full" placeholder="on-call@team.com" value={target} onChange={e => setTarget(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Timer (minutes)</label>
            <input type="number" min={1} className="input-field w-full disabled:opacity-40" disabled={isFinal}
              value={timer} onChange={e => setTimer(parseInt(e.target.value) || 0)} />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm app-title cursor-pointer">
              <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} />
              Final level (no timer)
            </label>
            <label className="flex items-center gap-2 text-sm app-title cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-2">Channels</label>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map(ch => {
              const Icon = ALL_CHANNEL_META[ch].icon
              const on = channels[ch]
              return (
                <button key={ch} onClick={() => setChannels(c => ({ ...c, [ch]: !c[ch] }))}
                  className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    on ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-[var(--border)] text-muted hover:text-white')}>
                  <Icon className="w-4 h-4" />{ALL_CHANNEL_META[ch].label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!name || save.isPending} className="btn-primary text-sm flex-1">
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Level'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PolicyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [severity, setSeverity] = useState<Severity>('CRITICAL')
  const [description, setDescription] = useState('')

  const save = useMutation({
    mutationFn: () => escalationApi.createConfig({ name, severity, description }),
    onSuccess: () => { toast('Policy created — add levels next', 'success'); onSaved() },
    onError: (e: any) => toast(e?.response?.data?.detail ?? 'Create failed', 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold app-title">New Escalation Policy</h3>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Policy Name</label>
          <input className="input-field w-full" placeholder="Production CRITICAL" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Severity</label>
          <select className="input-field w-full" value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
            <option value="NORMAL">NORMAL</option>
            <option value="WARNING">WARNING</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Description</label>
          <textarea className="input-field w-full" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!name || save.isPending} className="btn-primary text-sm flex-1">
            {save.isPending ? 'Creating…' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}
