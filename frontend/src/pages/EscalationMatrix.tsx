import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertOctagon, Plus, Trash2, Copy, Pencil, Search, Eye,
  Shield, X, Layers, Clock, Monitor, ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Square, ChevronDown,
} from 'lucide-react'
import {
  escalationApi,
  type EscalationConfig,
  type EscalationStatus,
  type Severity,
} from '../api/escalation'
import { monitorsApi, type Monitor as MonitorType } from '../api/monitors'
import Header from '../components/layout/Header'
import { useToast } from '../context/ToastContext'
import clsx from 'clsx'

const STATUS_META: Record<EscalationStatus, { label: string; dot: string; cls: string }> = {
  active:   { label: 'Active',   dot: 'bg-green-400',  cls: 'text-green-400  bg-green-500/10  border-green-500/30'  },
  inactive: { label: 'Inactive', dot: 'bg-slate-400',  cls: 'text-slate-400  bg-slate-500/10  border-slate-500/30'  },
  draft:    { label: 'Draft',    dot: 'bg-amber-400',  cls: 'text-amber-400  bg-amber-500/10  border-amber-500/30'  },
}

const SEVERITY_META: Record<Severity, { cls: string }> = {
  NORMAL:   { cls: 'text-blue-400  bg-blue-500/10'   },
  WARNING:  { cls: 'text-amber-400 bg-amber-500/10'  },
  CRITICAL: { cls: 'text-red-400   bg-red-500/10'    },
}

const STATUS_DOT: Record<string, string> = {
  up:      'bg-green-400',
  down:    'bg-red-400',
  paused:  'bg-slate-400',
  pending: 'bg-amber-400',
}

type SortKey = 'name' | 'status' | 'severity' | 'created_at' | 'total_monitors' | 'total_levels'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 10

export default function EscalationMatrix() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EscalationStatus | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editConfig, setEditConfig] = useState<EscalationConfig | null>(null)

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['escalation-configs'],
    queryFn: () => escalationApi.listConfigs().then(r => r.data),
    refetchInterval: 30_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['escalation-configs'] })

  const deleteMut = useMutation({
    mutationFn: (id: number) => escalationApi.deleteConfig(id),
    onSuccess: () => { invalidate(); toast('Policy deleted', 'success') },
    onError: () => toast('Delete failed', 'error'),
  })
  const cloneMut = useMutation({
    mutationFn: (id: number) => escalationApi.cloneConfig(id),
    onSuccess: () => { invalidate(); toast('Policy cloned as draft', 'success') },
  })

  // Sort helper
  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...configs]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter)
    if (severityFilter !== 'ALL') list = list.filter(c => c.severity === severityFilter)

    list.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'name':           av = a.name; bv = b.name; break
        case 'status':         av = a.status; bv = b.status; break
        case 'severity':       av = a.severity; bv = b.severity; break
        case 'created_at':     av = a.created_at; bv = b.created_at; break
        case 'total_monitors': av = a.total_monitors ?? 0; bv = b.total_monitors ?? 0; break
        case 'total_levels':   av = a.total_levels ?? 0; bv = b.total_levels ?? 0; break
        default:               av = a.created_at; bv = b.created_at
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [configs, search, statusFilter, severityFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey !== col
      ? <ArrowUpDown className="w-3 h-3 opacity-40" />
      : sortDir === 'asc'
        ? <ArrowUp className="w-3 h-3 text-primary-400" />
        : <ArrowDown className="w-3 h-3 text-primary-400" />

  return (
    <div className="p-6 space-y-5">
      <Header
        title="Escalation Matrix"
        action={{ label: 'New Policy', onClick: () => setShowNewModal(true) }}
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {(['active', 'inactive', 'draft'] as EscalationStatus[]).map(s => {
          const count = configs.filter(c => c.status === s).length
          const m = STATUS_META[s]
          return (
            <button
              key={s}
              onClick={() => { setStatusFilter(statusFilter === s ? 'all' : s); setPage(1) }}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                statusFilter === s ? m.cls : 'border-[var(--border)] text-muted hover:border-[var(--border-strong)]'
              )}
            >
              <span className={clsx('w-2 h-2 rounded-full', m.dot)} />
              {m.label}: <span className="font-bold">{count}</span>
            </button>
          )
        })}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-muted">
          <Shield className="w-3.5 h-3.5" />Total: <span className="font-bold text-[var(--text)]">{configs.length}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-muted">
          <Monitor className="w-3.5 h-3.5" />
          Monitors attached: <span className="font-bold text-[var(--text)]">
            {configs.reduce((s, c) => s + (c.total_monitors ?? 0), 0)}
          </span>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            className="input-field pl-9 w-full text-sm"
            placeholder="Search by title or description…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-xl p-1 border border-[var(--border)]">
          {(['all', 'active', 'inactive', 'draft'] as const).map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                statusFilter === s ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              {s === 'all' ? 'All Status' : s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-xl p-1 border border-[var(--border)]">
          {(['ALL', 'NORMAL', 'WARNING', 'CRITICAL'] as const).map(s => (
            <button key={s} onClick={() => { setSeverityFilter(s); setPage(1) }}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                severityFilter === s ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-white/[0.02]">
                {[
                  { label: 'Title',           key: 'name'           as SortKey },
                  { label: 'Description',     key: null },
                  { label: 'Status',          key: 'status'         as SortKey },
                  { label: 'Severity',        key: 'severity'       as SortKey },
                  { label: 'Levels',          key: 'total_levels'   as SortKey },
                  { label: 'Monitors',        key: 'total_monitors' as SortKey },
                  { label: 'Created By',      key: null },
                  { label: 'Created Date',    key: 'created_at'     as SortKey },
                  { label: 'Actions',         key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={key ? () => cycleSort(key) : undefined}
                    className={clsx(
                      'px-4 py-3 text-left text-xs font-semibold text-subtle uppercase tracking-wider whitespace-nowrap',
                      key && 'cursor-pointer hover:text-[var(--text)] select-none'
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {key && <SortIcon col={key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading policies…</span>
                  </div>
                </td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-14 text-center">
                  <AlertOctagon className="w-10 h-10 text-muted mx-auto mb-3" />
                  <p className="text-muted text-sm font-medium">No policies found</p>
                  <p className="text-subtle text-xs mt-1">
                    {search || statusFilter !== 'all' || severityFilter !== 'ALL'
                      ? 'Try adjusting your filters' : 'Click "New Policy" to get started'}
                  </p>
                </td></tr>
              ) : paged.map(config => (
                <PolicyRow
                  key={config.id}
                  config={config}
                  onView={() => navigate(`/escalation/${config.id}`)}
                  onEdit={() => setEditConfig(config)}
                  onClone={() => cloneMut.mutate(config.id)}
                  onDelete={() => {
                    if (confirm(`Delete "${config.name}"? This cannot be undone.`)) deleteMut.mutate(config.id)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-white/[0.01]">
            <p className="text-xs text-muted">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors">
                Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={clsx('w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                    page === p ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showNewModal && (
        <PolicyModal onClose={() => setShowNewModal(false)} onSaved={() => { setShowNewModal(false); invalidate() }} />
      )}
      {editConfig && (
        <PolicyModal existing={editConfig} onClose={() => setEditConfig(null)} onSaved={() => { setEditConfig(null); invalidate() }} />
      )}
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function PolicyRow({ config, onView, onEdit, onClone, onDelete }: {
  config: EscalationConfig
  onView: () => void; onEdit: () => void; onClone: () => void; onDelete: () => void
}) {
  const status = config.status ?? (config.is_active ? 'active' : 'inactive')
  const sm = STATUS_META[status as EscalationStatus] ?? STATUS_META.inactive
  const sevm = SEVERITY_META[config.severity] ?? SEVERITY_META.NORMAL

  return (
    <tr className="hover:bg-white/[0.025] transition-colors group">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-primary-400" />
          </div>
          <div>
            <p className="font-semibold app-title text-sm">{config.name}</p>
            {config.is_default && <span className="text-[10px] text-subtle font-medium uppercase">Default</span>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 max-w-[180px]">
        <p className="text-xs text-muted truncate">{config.description || '—'}</p>
      </td>
      <td className="px-4 py-3.5">
        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', sm.cls)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', sm.dot)} />{sm.label}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-md', sevm.cls)}>{config.severity}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-400">
          <Layers className="w-3 h-3" />{config.total_levels ?? config.levels.length}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400">
          <Monitor className="w-3 h-3" />{config.total_monitors ?? 0}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-xs text-muted">{config.created_by || '—'}</span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-xs text-muted">
          {new Date(config.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {[
            { Icon: Eye,    cls: 'text-primary-400 hover:bg-primary-500/10', title: 'View Details', fn: onView },
            { Icon: Pencil, cls: 'text-slate-400 hover:bg-slate-500/10',   title: 'Edit',         fn: onEdit },
            { Icon: Copy,   cls: 'text-slate-400 hover:bg-slate-500/10',   title: 'Clone',        fn: onClone },
            { Icon: Trash2, cls: 'text-red-400 hover:bg-red-500/10',       title: 'Delete',       fn: onDelete },
          ].map(({ Icon, cls, title, fn }) => (
            <button key={title} onClick={fn} title={title} className={clsx('p-1.5 rounded-lg transition-colors', cls)}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function PolicyModal({ existing, onClose, onSaved }: {
  existing?: EscalationConfig | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const isEdit = !!existing

  const [name, setName] = useState(existing?.name ?? '')
  const [severity, setSeverity] = useState<Severity>(existing?.severity ?? 'CRITICAL')
  const [status, setStatus] = useState<EscalationStatus>(existing?.status ?? 'active')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [originalIds, setOriginalIds] = useState<Set<number>>(new Set())
  const [monitorSearch, setMonitorSearch] = useState('')
  const [monitorDropOpen, setMonitorDropOpen] = useState(false)

  // Load all user monitors
  const { data: allMonitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => monitorsApi.list().then(r => r.data),
  })

  // Load currently attached monitors (edit mode)
  const { data: attachedMonitors = [] } = useQuery({
    queryKey: ['escalation-config-monitors', existing?.id],
    queryFn: () => escalationApi.listConfigMonitors(existing!.id).then(r => r.data),
    enabled: isEdit && !!existing?.id,
    onSuccess: (data) => {
      const ids = new Set(data.map((m: any) => m.id))
      setSelectedIds(ids)
      setOriginalIds(ids)
    },
  } as any)

  const visibleMonitors = allMonitors.filter(m =>
    !monitorSearch || m.monitor_name.toLowerCase().includes(monitorSearch.toLowerCase()) ||
    m.target_url.toLowerCase().includes(monitorSearch.toLowerCase())
  )

  const toggleMonitor = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const save = useMutation({
    mutationFn: async () => {
      let configId: number
      if (isEdit) {
        await escalationApi.updateConfig(existing!.id, { name, severity, status, description })
        configId = existing!.id
      } else {
        const res = await escalationApi.createConfig({ name, severity, status, description })
        configId = res.data.id
      }

      // Diff: attach new, detach removed
      const toAttach = [...selectedIds].filter(id => !originalIds.has(id))
      const toDetach = [...originalIds].filter(id => !selectedIds.has(id))
      await Promise.all([
        ...toAttach.map(id => escalationApi.attachMonitor(configId, id)),
        ...toDetach.map(id => escalationApi.detachMonitor(configId, id)),
      ])
    },
    onSuccess: () => {
      toast(isEdit ? 'Policy updated' : 'Policy created', 'success')
      qc.invalidateQueries({ queryKey: ['monitors'] })
      onSaved()
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? 'Save failed', 'error'),
  })

  const LABEL = 'text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass-card w-full max-w-xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-400" />
            <h3 className="font-semibold app-title">{isEdit ? 'Edit Policy' : 'New Escalation Policy'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className={LABEL}>Title</label>
          <input className="input-field w-full" placeholder="e.g. Production CRITICAL Policy" value={name}
            onChange={e => setName(e.target.value)} autoFocus />
        </div>

        {/* Severity + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Severity</label>
            <select className="input-field w-full" value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="NORMAL">NORMAL</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select className="input-field w-full" value={status} onChange={e => setStatus(e.target.value as EscalationStatus)}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={LABEL}>Description</label>
          <textarea className="input-field w-full resize-none" rows={2}
            placeholder="When does this policy apply?" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {/* Assigned Monitors */}
        <div>
          <label className={LABEL}>
            Assigned Monitors
            {selectedIds.size > 0 && (
              <span className="ml-2 text-primary-400 normal-case font-normal">{selectedIds.size} selected</span>
            )}
          </label>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-white/[0.02]">
              <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <input
                className="bg-transparent text-sm flex-1 outline-none placeholder:text-subtle"
                placeholder="Search monitors…"
                value={monitorSearch}
                onChange={e => setMonitorSearch(e.target.value)}
              />
            </div>
            {/* Monitor list */}
            <div className="max-h-48 overflow-y-auto">
              {allMonitors.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted">No monitors available</div>
              ) : visibleMonitors.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-muted">No monitors match search</div>
              ) : visibleMonitors.map(m => {
                const checked = selectedIds.has(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMonitor(m.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[var(--border)] last:border-0',
                      checked ? 'bg-primary-500/8' : 'hover:bg-white/[0.03]'
                    )}
                  >
                    {checked
                      ? <CheckSquare className="w-4 h-4 text-primary-400 flex-shrink-0" />
                      : <Square className="w-4 h-4 text-muted flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium app-title truncate">{m.monitor_name}</p>
                      <p className="text-xs text-muted truncate">{m.monitor_type.toUpperCase()} · {m.target_url}</p>
                    </div>
                    <span className={clsx(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      m.current_status === 'up' ? 'bg-green-400' :
                      m.current_status === 'down' ? 'bg-red-400' : 'bg-slate-400'
                    )} />
                  </button>
                )
              })}
            </div>
            {selectedIds.size > 0 && (
              <div className="px-4 py-2 border-t border-[var(--border)] bg-white/[0.02]">
                <div className="flex flex-wrap gap-1.5">
                  {[...selectedIds].map(id => {
                    const mon = allMonitors.find(m => m.id === id)
                    return mon ? (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full">
                        {mon.monitor_name}
                        <button onClick={() => toggleMonitor(id)} className="hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="btn-primary text-sm flex-1">
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}
