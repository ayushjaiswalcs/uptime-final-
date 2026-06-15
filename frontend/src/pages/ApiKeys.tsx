import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Trash2, Copy, CheckCircle, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'
import { apiKeysApi, type ApiKeyCreate, type ApiKeyOut, type ApiKeyCreated } from '../api/apiKeys'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

const ALL_PERMS = ['monitors:read', 'monitors:write', 'incidents:read', 'notifications:read', 'status-pages:read']

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-slate-400 hover:text-white transition-colors">
      {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

export default function ApiKeys() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const [form, setForm] = useState<ApiKeyCreate>({ name: '', permissions: ALL_PERMS, expires_days: undefined })
  const [error, setError] = useState('')

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list().then(r => r.data),
  })

  const createKey = useMutation({
    mutationFn: () => apiKeysApi.create(form),
    onSuccess: ({ data }) => {
      setCreatedKey(data)
      setCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create key'),
  })

  const revokeKey = useMutation({
    mutationFn: (id: number) => apiKeysApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const toggleKey = useMutation({
    mutationFn: (id: number) => apiKeysApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const togglePerm = (perm: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions?.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...(f.permissions || []), perm],
    }))
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="API Keys" action={{ label: 'Generate Key', onClick: () => { setError(''); setCreateOpen(true) } }} />

      <div className="glass-card p-5">
        <p className="text-sm text-slate-400 mb-5">
          API keys let you authenticate against the REST API programmatically. Keep them secret — they have the same permissions as your account.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm mb-4">No API keys yet</p>
            <button onClick={() => setCreateOpen(true)} className="btn-primary">Generate your first key</button>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map(k => (
              <div key={k.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${k.is_active ? 'border-slate-700 bg-slate-800/50' : 'border-slate-700/50 bg-slate-800/20 opacity-60'}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${k.is_active ? 'bg-primary-600/20' : 'bg-slate-700'}`}>
                  <Key className={`w-4 h-4 ${k.is_active ? 'text-primary-400' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{k.name}</p>
                    {!k.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Disabled</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs text-slate-400 font-mono">{k.key_prefix}••••••••</code>
                    {k.expires_at && <span className="text-xs text-slate-500">Expires {new Date(k.expires_at).toLocaleDateString()}</span>}
                    {k.last_used_at && <span className="text-xs text-slate-500">Last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">{new Date(k.created_at).toLocaleDateString()}</p>
                <button onClick={() => toggleKey.mutate(k.id)} className="text-slate-400 hover:text-white transition-colors">
                  {k.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => revokeKey.mutate(k.id)} className="text-slate-400 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Docs callout */}
      <div className="glass-card p-5 border-primary-500/20">
        <h3 className="font-semibold text-white mb-2">Using the API</h3>
        <p className="text-sm text-slate-400 mb-3">Pass your API key in the <code className="text-primary-400">Authorization</code> header:</p>
        <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-between gap-4">
          <code className="text-xs text-green-400 font-mono break-all">curl -H "Authorization: Bearer upk_YOUR_KEY" https://api.uptime.io/monitors</code>
          <CopyButton text='curl -H "Authorization: Bearer upk_YOUR_KEY" https://api.uptime.io/monitors' />
        </div>
      </div>

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Generate API Key">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Key Name</label>
            <input className="input-field" placeholder="e.g. CI/CD Pipeline" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Permissions</label>
            <div className="space-y-2">
              {ALL_PERMS.map(perm => (
                <label key={perm} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.permissions?.includes(perm)} onChange={() => togglePerm(perm)} className="w-4 h-4 rounded accent-primary-500" />
                  <span className="text-sm text-slate-300 font-mono">{perm}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Expiry (optional)</label>
            <select className="input-field" value={form.expires_days ?? ''} onChange={e => setForm(f => ({ ...f, expires_days: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">Never expires</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createKey.mutate()} disabled={createKey.isPending || !form.name} className="btn-primary flex-1">
              {createKey.isPending ? 'Generating...' : 'Generate Key'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Reveal Modal */}
      {createdKey && (
        <Modal isOpen={!!createdKey} onClose={() => setCreatedKey(null)} title="API Key Created">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-300">Copy this key now. You won't be able to see it again after closing this dialog.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Your API Key</label>
              <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-3">
                <code className="flex-1 text-sm text-green-400 font-mono break-all">{createdKey.raw_key}</code>
                <CopyButton text={createdKey.raw_key} />
              </div>
            </div>
            <button onClick={() => setCreatedKey(null)} className="btn-primary w-full">Done</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
