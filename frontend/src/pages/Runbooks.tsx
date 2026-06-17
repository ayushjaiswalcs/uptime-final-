import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Plus, Trash2, Eye, Search, Tag, Edit3, X, Check,
  Terminal, ChevronDown, ChevronRight, FileText, AlertTriangle,
  Zap, Settings
} from 'lucide-react'
import { runbooksApi, type Runbook } from '../api/runbooks'
import Header from '../components/layout/Header'
import clsx from 'clsx'

const CATEGORY_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  incident: { color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
  troubleshooting: { color: 'text-yellow-400 bg-yellow-500/10', icon: Settings },
  deployment: { color: 'text-blue-400 bg-blue-500/10', icon: Zap },
  playbook: { color: 'text-purple-400 bg-purple-500/10', icon: FileText },
  general: { color: 'text-slate-400 bg-slate-500/10', icon: BookOpen },
}

function RunbookForm({ onClose, initial }: { onClose: () => void; initial?: Runbook }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: initial?.title || '',
    category: initial?.category || 'general',
    content: initial?.content || '',
    tags: initial?.tags?.join(', ') || '',
    severity_level: initial?.severity_level || '',
    is_published: initial?.is_published ?? true,
    steps: initial?.steps || [],
  })
  const [newStep, setNewStep] = useState({ title: '', command: '', description: '', step_type: 'manual' })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        steps: form.steps.map((s: any, i: number) => ({ ...s, step_order: i + 1 })),
      }
      return initial ? runbooksApi.update(initial.id, payload) : runbooksApi.create(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runbooks'] }); onClose() },
  })

  const addStep = () => {
    if (!newStep.title) return
    setForm(f => ({ ...f, steps: [...f.steps, { ...newStep, id: Date.now(), runbook_id: 0, step_order: f.steps.length + 1 }] }))
    setNewStep({ title: '', command: '', description: '', step_type: 'manual' })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="glass-card w-full max-w-3xl mt-8 mb-8">
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-bold app-title">{initial ? 'Edit' : 'New'} Runbook</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Title</label>
              <input className="input-field w-full" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Runbook title..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Category</label>
              <select className="input-field w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {Object.keys(CATEGORY_CONFIG).map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Severity</label>
              <select className="input-field w-full" value={form.severity_level} onChange={e => setForm(f => ({ ...f, severity_level: e.target.value }))}>
                <option value="">Any</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Tags (comma-separated)</label>
              <input className="input-field w-full" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="api, production, timeout..." />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Description / Overview</label>
              <textarea rows={4} className="input-field w-full resize-none" value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Describe when to use this runbook, context, and summary..." />
            </div>
          </div>

          {/* Steps */}
          <div>
            <h3 className="text-sm font-semibold app-title mb-3">Steps</h3>
            {form.steps.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-3 mb-2 p-3 rounded-lg bg-white/[0.02] border border-[var(--border)]">
                <span className="w-5 h-5 rounded-full bg-primary-600/30 text-primary-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium app-title">{step.title}</p>
                  {step.command && <p className="text-xs font-mono text-muted mt-1 bg-black/30 px-2 py-1 rounded">{step.command}</p>}
                </div>
                <button onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_: any, j: number) => j !== i) }))}
                  className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <input className="input-field flex-1 text-sm" placeholder="Step title" value={newStep.title}
                onChange={e => setNewStep(s => ({ ...s, title: e.target.value }))} />
              <input className="input-field flex-1 text-sm font-mono" placeholder="Command (optional)" value={newStep.command}
                onChange={e => setNewStep(s => ({ ...s, command: e.target.value }))} />
              <button onClick={addStep} disabled={!newStep.title} className="btn-secondary text-sm px-3">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.title || mutation.isPending} className="btn-primary text-sm">
            {mutation.isPending ? 'Saving...' : initial ? 'Update' : 'Create Runbook'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RunbookDetail({ runbook, onClose, onEdit }: { runbook: Runbook; onClose: () => void; onEdit: () => void }) {
  const [expanded, setExpanded] = useState<number[]>([])
  const cfg = CATEGORY_CONFIG[runbook.category] || CATEGORY_CONFIG.general
  const Icon = cfg.icon

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="glass-card w-full max-w-3xl mt-8 mb-8">
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold app-title">{runbook.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full capitalize', cfg.color)}>{runbook.category}</span>
                  {runbook.severity_level && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 capitalize">{runbook.severity_level}</span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted"><Eye className="w-3 h-3" />{runbook.view_count}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="p-2 hover:bg-white/5 rounded-lg text-muted hover:text-white">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-muted hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {runbook.content && (
            <div>
              <h3 className="text-sm font-semibold app-title mb-2">Overview</h3>
              <p className="text-sm text-muted leading-relaxed">{runbook.content}</p>
            </div>
          )}
          {runbook.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-muted" />
              {runbook.tags.map(tag => (
                <span key={tag} className="text-xs bg-white/5 border border-[var(--border)] px-2 py-0.5 rounded-full text-muted">{tag}</span>
              ))}
            </div>
          )}
          {runbook.steps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold app-title mb-3">Steps ({runbook.steps.length})</h3>
              <div className="space-y-2">
                {runbook.steps.map((step) => {
                  const isExp = expanded.includes(step.id)
                  return (
                    <div key={step.id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                        onClick={() => setExpanded(ex => isExp ? ex.filter(id => id !== step.id) : [...ex, step.id])}
                      >
                        <span className="w-6 h-6 rounded-full bg-primary-600/30 text-primary-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {step.step_order}
                        </span>
                        <span className="flex-1 font-medium app-title text-sm">{step.title}</span>
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded-full',
                          step.step_type === 'automated' ? 'bg-blue-500/10 text-blue-400' :
                          step.step_type === 'verification' ? 'bg-purple-500/10 text-purple-400' :
                          'bg-slate-500/10 text-slate-400'
                        )}>{step.step_type}</span>
                        {isExp ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                      </button>
                      {isExp && (
                        <div className="border-t border-[var(--border)] p-4 space-y-3">
                          {step.description && <p className="text-sm text-muted">{step.description}</p>}
                          {step.command && (
                            <div className="bg-black/40 border border-[var(--border)] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Terminal className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-xs text-green-400 font-medium">Command</span>
                              </div>
                              <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">{step.command}</pre>
                            </div>
                          )}
                          {step.expected_output && (
                            <div>
                              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-1">Expected Output</p>
                              <p className="text-xs text-muted font-mono">{step.expected_output}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Runbooks() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editRunbook, setEditRunbook] = useState<Runbook | null>(null)
  const [viewRunbook, setViewRunbook] = useState<Runbook | null>(null)
  const qc = useQueryClient()

  const { data: runbooks = [], isLoading } = useQuery({
    queryKey: ['runbooks', category, search],
    queryFn: () => runbooksApi.list({ category: category || undefined, search: search || undefined }).then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['runbook-stats'],
    queryFn: () => runbooksApi.stats().then(r => r.data),
  })

  const deleteRunbook = useMutation({
    mutationFn: (id: number) => runbooksApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runbooks'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Knowledge Base" />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Runbooks</p>
            <p className="text-2xl font-bold text-primary-400">{stats.total}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Published</p>
            <p className="text-2xl font-bold text-green-400">{stats.published}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Total Views</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.total_views}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Categories</p>
            <p className="text-2xl font-bold text-purple-400">{Object.keys(stats.by_category).length}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            className="input-field w-full pl-9"
            placeholder="Search runbooks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {Object.keys(CATEGORY_CONFIG).map(c => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm ml-auto">
          <Plus className="w-4 h-4" />New Runbook
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : runbooks.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
          <h3 className="text-xl font-semibold app-title mb-2">No runbooks yet</h3>
          <p className="text-muted text-sm">Create your first runbook to document incident response procedures.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {runbooks.map(rb => {
            const cfg = CATEGORY_CONFIG[rb.category] || CATEGORY_CONFIG.general
            const Icon = cfg.icon
            return (
              <div
                key={rb.id}
                className="glass-card p-5 cursor-pointer hover:border-primary-500/30 transition-all"
                onClick={() => setViewRunbook(rb)}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', cfg.color)}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold app-title text-sm truncate">{rb.title}</p>
                    <span className={clsx('text-xs capitalize', cfg.color.split(' ')[0])}>{rb.category}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteRunbook.mutate(rb.id) }}
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {rb.content && (
                  <p className="text-sm text-muted line-clamp-2 mb-3">{rb.content}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-3">
                    {rb.steps.length > 0 && <span>{rb.steps.length} steps</span>}
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{rb.view_count}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {rb.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="bg-white/5 border border-[var(--border)] px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && <RunbookForm onClose={() => setShowForm(false)} />}
      {editRunbook && <RunbookForm initial={editRunbook} onClose={() => setEditRunbook(null)} />}
      {viewRunbook && (
        <RunbookDetail
          runbook={viewRunbook}
          onClose={() => setViewRunbook(null)}
          onEdit={() => { setEditRunbook(viewRunbook); setViewRunbook(null) }}
        />
      )}
    </div>
  )
}
