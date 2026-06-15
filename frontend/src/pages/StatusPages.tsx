import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, ExternalLink, Trash2, Plus } from 'lucide-react'
import client from '../api/client'
import type { StatusPageOut, StatusPageCreate } from '../api/statusPages'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

// Status page API
const statusPagesApi = {
  list: () => client.get<StatusPageOut[]>('/status-pages'),
  create: (data: StatusPageCreate) => client.post<StatusPageOut>('/status-pages', data),
  delete: (id: number) => client.delete(`/status-pages/${id}`),
}

export default function StatusPages() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ slug: '', company_name: '', logo_url: '', description: '' })
  const [error, setError] = useState('')

  const { data: pages = [] } = useQuery({
    queryKey: ['status-pages'],
    queryFn: () => statusPagesApi.list().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => statusPagesApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['status-pages'] }); setAddOpen(false); setForm({ slug: '', company_name: '', logo_url: '', description: '' }) },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create status page'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => statusPagesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status-pages'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Status Pages" action={{ label: 'Create Status Page', onClick: () => setAddOpen(true) }} />

      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-card">
          <Globe className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No status pages yet</h3>
          <p className="text-slate-400 mb-6 text-sm">Create a public status page to show your service health to your customers</p>
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Status Page
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map(page => (
            <div key={page.id} className="glass-card p-5 hover:border-slate-600/70 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white">{page.company_name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">/{page.slug}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${page.is_public ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                  {page.is_public ? 'Public' : 'Private'}
                </span>
              </div>
              {page.description && <p className="text-sm text-slate-400 mb-3 truncate">{page.description}</p>}
              <div className="flex items-center gap-2 mt-4">
                <a
                  href={`/status/${page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 rounded-xl transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View Page
                </a>
                <button
                  onClick={() => { if (confirm('Delete this status page?')) deleteMutation.mutate(page.id) }}
                  className="p-2 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Create Status Page">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Name</label>
            <input className="input-field" placeholder="Acme Inc." value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug (URL)</label>
            <div className="flex items-center input-field p-0 overflow-hidden">
              <span className="px-3 text-slate-500 text-sm border-r border-slate-600 py-2.5 bg-slate-700/50">/status/</span>
              <input
                className="flex-1 bg-transparent px-3 py-2.5 outline-none text-white placeholder:text-slate-500"
                placeholder="acme-inc"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description (optional)</label>
            <input className="input-field" placeholder="All systems operational status" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-400 bg-red-500/10 px-4 py-2.5 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.slug || !form.company_name} className="btn-primary flex-1">Create Page</button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary px-6">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
