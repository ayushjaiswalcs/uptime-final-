import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Webhook, Plus, Trash2, ToggleLeft, ToggleRight, CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import { webhooksApi, WEBHOOK_EVENTS, type WebhookCreate, type WebhookOut } from '../api/webhooks'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

export default function Webhooks() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<WebhookOut | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<WebhookCreate>({ name: '', url: '', events: [...WEBHOOK_EVENTS] })

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => webhooksApi.list().then(r => r.data),
  })

  const { data: deliveries = [] } = useQuery({
    queryKey: ['webhook-deliveries', selected?.id],
    queryFn: () => selected ? webhooksApi.deliveries(selected.id).then(r => r.data) : [],
    enabled: !!selected,
  })

  const createWh = useMutation({
    mutationFn: () => webhooksApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setCreateOpen(false); setForm({ name: '', url: '', events: [...WEBHOOK_EVENTS] }) },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create'),
  })

  const deleteWh = useMutation({
    mutationFn: (id: number) => webhooksApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setSelected(null) },
  })

  const toggleWh = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => webhooksApi.update(id, { is_active: !active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events?.includes(event) ? f.events.filter(e => e !== event) : [...(f.events || []), event],
    }))
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="Webhooks" action={{ label: 'Add Webhook', onClick: () => { setError(''); setCreateOpen(true) } }} />

      <p className="text-sm text-slate-400 -mt-2">Receive HTTP POST notifications when monitor status changes or incidents occur.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-4 text-sm">Endpoints ({webhooks.length})</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-10">
              <Webhook className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No webhooks configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map(wh => (
                <button
                  key={wh.id}
                  onClick={() => setSelected(wh)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === wh.id ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700 hover:border-slate-600'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${wh.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                    <p className="text-sm font-medium text-white truncate flex-1">{wh.name}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate ml-4">{wh.url}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail + deliveries */}
        <div className="lg:col-span-2 glass-card p-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Webhook className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Select a webhook to see delivery history</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-semibold text-white">{selected.name}</h2>
                  <a href={selected.url} target="_blank" rel="noreferrer" className="text-xs text-primary-400 flex items-center gap-1 mt-0.5 hover:underline">
                    {selected.url.slice(0, 60)}{selected.url.length > 60 ? '...' : ''}<ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleWh.mutate({ id: selected.id, active: selected.is_active })} className="text-slate-400 hover:text-white">
                    {selected.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => deleteWh.mutate(selected.id)} className="text-slate-400 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Deliveries</h3>
              {deliveries.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No deliveries yet</p>
              ) : (
                <div className="space-y-2">
                  {deliveries.map(d => (
                    <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 text-sm">
                      {d.success
                        ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      }
                      <span className="font-mono text-xs text-slate-300">{d.event}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${d.response_status && d.response_status < 300 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {d.response_status ?? 'error'}
                      </span>
                      <span className="text-xs text-slate-500 ml-auto">{new Date(d.delivered_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Webhook Endpoint">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
            <input className="input-field" placeholder="e.g. PagerDuty" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Endpoint URL</label>
            <input type="url" className="input-field" placeholder="https://hooks.example.com/..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Signing Secret (optional)</label>
            <input className="input-field font-mono text-sm" placeholder="Used to sign payloads via HMAC-SHA256" value={form.secret || ''} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map(event => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.events?.includes(event)} onChange={() => toggleEvent(event)} className="w-3.5 h-3.5 accent-primary-500" />
                  <span className="text-xs font-mono text-slate-300">{event}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createWh.mutate()} disabled={createWh.isPending || !form.name || !form.url} className="btn-primary flex-1">
              {createWh.isPending ? 'Adding...' : 'Add Webhook'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
