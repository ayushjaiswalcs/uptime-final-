import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wrench, Plus, Trash2, Clock, Calendar, CheckCircle2 } from 'lucide-react'
import { maintenanceApi, type MaintenanceCreate, type MaintenanceOut } from '../api/maintenance'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

function isActive(w: MaintenanceOut): boolean {
  const now = new Date()
  return new Date(w.starts_at) <= now && new Date(w.ends_at) >= now
}

function isFuture(w: MaintenanceOut): boolean {
  return new Date(w.starts_at) > new Date()
}

export default function Maintenance() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<MaintenanceCreate>({
    name: '',
    starts_at: '',
    ends_at: '',
    is_recurring: false,
  })

  const { data: windows = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => maintenanceApi.list().then(r => r.data),
  })

  const createWindow = useMutation({
    mutationFn: () => maintenanceApi.create({ ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); setCreateOpen(false); setForm({ name: '', starts_at: '', ends_at: '', is_recurring: false }) },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create maintenance window'),
  })

  const deleteWindow = useMutation({
    mutationFn: (id: number) => maintenanceApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  })

  const active = windows.filter(isActive)
  const upcoming = windows.filter(isFuture)
  const past = windows.filter(w => !isActive(w) && !isFuture(w))

  const Section = ({ title, items, emptyMsg }: { title: string; items: MaintenanceOut[]; emptyMsg: string }) => (
    <div className="glass-card p-5">
      <h2 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider text-slate-400">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">{emptyMsg}</p>
      ) : (
        <div className="space-y-3">
          {items.map(w => (
            <div key={w.id} className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive(w) ? 'bg-yellow-500/20' : isFuture(w) ? 'bg-blue-500/20' : 'bg-slate-700'}`}>
                {isActive(w) ? <Wrench className="w-4 h-4 text-yellow-400" /> : isFuture(w) ? <Calendar className="w-4 h-4 text-blue-400" /> : <CheckCircle2 className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{w.name}</p>
                  {isActive(w) && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Active</span>}
                  {w.is_recurring && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Recurring</span>}
                </div>
                {w.description && <p className="text-xs text-slate-400 mt-0.5">{w.description}</p>}
                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(w.starts_at).toLocaleString()} → {new Date(w.ends_at).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => deleteWindow.mutate(w.id)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <Header title="Maintenance Windows" action={{ label: 'Schedule Maintenance', onClick: () => { setError(''); setCreateOpen(true) } }} />

      <p className="text-sm text-slate-400 -mt-2">
        Schedule maintenance windows to suppress alerts and pause monitoring checks during planned downtime.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && <Section title="Currently Active" items={active} emptyMsg="" />}
          <Section title="Upcoming" items={upcoming} emptyMsg="No upcoming maintenance windows" />
          <Section title="Past" items={past} emptyMsg="No past maintenance windows" />
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Schedule Maintenance Window">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
            <input className="input-field" placeholder="e.g. Database migration" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description (optional)</label>
            <textarea className="input-field resize-none" rows={2} placeholder="What's happening during this window?" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Start Time</label>
              <input type="datetime-local" className="input-field" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">End Time</label>
              <input type="datetime-local" className="input-field" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} className="w-4 h-4 rounded accent-primary-500" />
            <span className="text-sm text-slate-300">Recurring window</span>
          </label>
          {form.is_recurring && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Cron Expression</label>
              <input className="input-field font-mono text-sm" placeholder="0 2 * * 0  (every Sunday at 2am)" value={form.recurrence_cron || ''} onChange={e => setForm(f => ({ ...f, recurrence_cron: e.target.value }))} />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createWindow.mutate()} disabled={createWindow.isPending || !form.name || !form.starts_at || !form.ends_at} className="btn-primary flex-1">
              {createWindow.isPending ? 'Scheduling...' : 'Schedule Window'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
