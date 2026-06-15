import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Trash2, Building2, Crown, Shield, Code2, Eye, UserPlus } from 'lucide-react'
import { orgsApi, type OrgOut, type OrgCreate, type MemberOut } from '../api/organizations'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

const ROLE_META: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner:     { label: 'Owner',     icon: Crown,  color: 'text-yellow-400' },
  admin:     { label: 'Admin',     icon: Shield, color: 'text-red-400'    },
  developer: { label: 'Developer', icon: Code2,  color: 'text-blue-400'  },
  viewer:    { label: 'Viewer',    icon: Eye,    color: 'text-slate-400'  },
}

export default function Teams() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<OrgOut | null>(null)
  const [orgForm, setOrgForm] = useState<OrgCreate>({ name: '', slug: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [error, setError] = useState('')

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  const { data: members = [] } = useQuery({
    queryKey: ['org-members', selectedOrg?.id],
    queryFn: () => selectedOrg ? orgsApi.listMembers(selectedOrg.id).then(r => r.data) : [],
    enabled: !!selectedOrg,
  })

  const createOrg = useMutation({
    mutationFn: () => orgsApi.create(orgForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); setCreateOpen(false); setOrgForm({ name: '', slug: '' }) },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create'),
  })

  const inviteMember = useMutation({
    mutationFn: () => orgsApi.inviteMember(selectedOrg!.id, inviteEmail, inviteRole),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-members', selectedOrg?.id] }); setInviteOpen(false); setInviteEmail('') },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to invite'),
  })

  const removeMember = useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: number; memberId: number }) => orgsApi.removeMember(orgId, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', selectedOrg?.id] }),
  })

  const deleteOrg = useMutation({
    mutationFn: (id: number) => orgsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); setSelectedOrg(null) },
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Teams & Organizations" action={{ label: 'New Organization', onClick: () => { setError(''); setCreateOpen(true) } }} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Org list */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary-400" />Organizations</h2>
          {isLoading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : orgs.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No organizations yet</p>
              <button onClick={() => setCreateOpen(true)} className="mt-3 btn-primary text-xs py-1.5 px-4">Create One</button>
            </div>
          ) : (
            <div className="space-y-2">
              {orgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selectedOrg?.id === org.id ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700 hover:border-slate-600'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400">
                      {org.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{org.name}</p>
                      <p className="text-xs text-slate-500">/{org.slug}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Members panel */}
        <div className="lg:col-span-2 glass-card p-5">
          {!selectedOrg ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Users className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Select an organization to manage members</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-semibold text-white">{selectedOrg.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setError(''); setInviteOpen(true) }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />Invite
                  </button>
                  <button onClick={() => deleteOrg.mutate(selectedOrg.id)} className="btn-secondary text-xs py-1.5 px-3 text-red-400 hover:bg-red-500/10 border-red-500/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {members.map(m => {
                  const meta = ROLE_META[m.role] || ROLE_META.viewer
                  const Icon = meta.icon
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30">
                      <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold text-white">
                        {(m.user_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{m.user_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500 truncate">{m.user_email}</p>
                      </div>
                      <div className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />{meta.label}
                      </div>
                      {m.role !== 'owner' && (
                        <button onClick={() => removeMember.mutate({ orgId: selectedOrg.id, memberId: m.id })} className="text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Org Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Organization">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization Name</label>
            <input className="input-field" placeholder="Acme Inc." value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug</label>
            <input className="input-field" placeholder="acme-inc" value={orgForm.slug} onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} />
            <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createOrg.mutate()} disabled={createOrg.isPending} className="btn-primary flex-1">
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Invite Modal */}
      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title={`Invite to ${selectedOrg?.name}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
            <input type="email" className="input-field" placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
            <select className="input-field" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {Object.entries(ROLE_META).filter(([r]) => r !== 'owner').map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => inviteMember.mutate()} disabled={inviteMember.isPending} className="btn-primary flex-1">
              {inviteMember.isPending ? 'Inviting...' : 'Send Invite'}
            </button>
            <button onClick={() => setInviteOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
