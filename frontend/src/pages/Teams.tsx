import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Trash2, Building2, Crown, Shield, Code2, Eye,
  UserPlus, Briefcase, Check, Minus, Settings, Lock, Save, X,
  FolderOpen, Activity, AlertTriangle, TrendingUp, Zap, ChevronRight,
  MoreVertical, Edit2, Circle,
} from 'lucide-react'
import { orgsApi, type OrgOut, type OrgCreate, type MemberOut } from '../api/organizations'
import { teamsApi, type TeamOut, type TeamCreate, type TeamMembershipOut } from '../api/teams'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'
import { useToast } from '../context/ToastContext'
import { Skeleton } from '../components/ui/Skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgRole = 'owner' | 'admin' | 'manager' | 'developer' | 'viewer'
type TeamRole = 'lead' | 'developer' | 'viewer'
type RightPanel = 'overview' | 'members' | 'permissions' | 'settings'

interface RoleMeta { label: string; icon: React.ElementType; color: string; bg: string; border: string }

const ORG_ROLE_META: Record<OrgRole, RoleMeta> = {
  owner:     { label: 'Owner',     icon: Crown,     color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  admin:     { label: 'Admin',     icon: Shield,    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30'    },
  manager:   { label: 'Manager',   icon: Briefcase, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  developer: { label: 'Developer', icon: Code2,     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
  viewer:    { label: 'Viewer',    icon: Eye,       color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/30'  },
}

const TEAM_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#F97316',
]

const PERMISSIONS: { key: string; label: string }[] = [
  { key: 'create_monitor',  label: 'Create Monitor'  },
  { key: 'edit_monitor',    label: 'Edit Monitor'    },
  { key: 'delete_monitor',  label: 'Delete Monitor'  },
  { key: 'create_project',  label: 'Create Project'  },
  { key: 'manage_team',     label: 'Manage Team'     },
  { key: 'view_reports',    label: 'View Reports'    },
  { key: 'export_reports',  label: 'Export Reports'  },
  { key: 'manage_org',      label: 'Manage Organization' },
]

const ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  owner:     ['create_monitor', 'edit_monitor', 'delete_monitor', 'create_project', 'manage_team', 'view_reports', 'export_reports', 'manage_org'],
  admin:     ['create_monitor', 'edit_monitor', 'delete_monitor', 'create_project', 'manage_team', 'view_reports', 'export_reports'],
  manager:   ['create_monitor', 'edit_monitor', 'create_project', 'view_reports', 'export_reports'],
  developer: ['create_monitor', 'edit_monitor'],
  viewer:    ['view_reports'],
}

const ORDERED_ORG_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'developer', 'viewer']

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role, small }: { role: string; small?: boolean }) {
  const meta = ORG_ROLE_META[role as OrgRole] ?? ORG_ROLE_META.viewer
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${meta.color} ${meta.bg} ${meta.border} ${small ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  )
}

function Avatar({ name, size = 'md', color }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; color?: string }) {
  const sizes = { xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }
  return (
    <div
      className={`${sizes[size]} rounded-xl flex items-center justify-center font-bold flex-shrink-0 text-white`}
      style={{ backgroundColor: color || '#4F46E5', opacity: 0.9 }}
    >
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ─── Team Stats Card ──────────────────────────────────────────────────────────

function TeamStatsRow({ teamId }: { teamId: number }) {
  const { data: stats } = useQuery({
    queryKey: ['team-stats', teamId],
    queryFn: () => teamsApi.getStats(teamId).then(r => r.data),
    staleTime: 30_000,
  })
  if (!stats) return null
  return (
    <div className="grid grid-cols-4 gap-3 mt-4">
      {[
        { label: 'Monitors', value: stats.total_monitors, icon: Activity, color: 'text-blue-400' },
        { label: 'Down', value: stats.down_monitors, icon: AlertTriangle, color: stats.down_monitors > 0 ? 'text-red-400' : 'text-slate-500' },
        { label: 'Uptime', value: `${stats.avg_uptime.toFixed(1)}%`, icon: TrendingUp, color: 'text-green-400' },
        { label: 'Score', value: `${stats.performance_score}`, icon: Zap, color: 'text-yellow-400' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-3 text-center">
          <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
          <p className="text-white font-bold text-base leading-none">{value}</p>
          <p className="text-xs text-slate-500 mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Teams List (middle column) ───────────────────────────────────────────────

function TeamsList({
  org,
  selectedTeamId,
  onSelectTeam,
  onCreateTeam,
}: {
  org: OrgOut
  selectedTeamId: number | null
  onSelectTeam: (t: TeamOut) => void
  onCreateTeam: () => void
}) {
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams', org.id],
    queryFn: () => teamsApi.list(org.id).then(r => r.data),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-400" />Teams
          <span className="text-xs text-slate-500 font-normal">({teams.length})</span>
        </h3>
        <button onClick={onCreateTeam} className="icon-button w-7 h-7 rounded-lg" title="New team">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-10 text-slate-500">
          <Users className="w-10 h-10 mb-2 opacity-25" />
          <p className="text-xs text-center">No teams yet.<br />Create your first team.</p>
          <button onClick={onCreateTeam} className="mt-3 btn-primary text-xs py-1.5 px-3">New Team</button>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1">
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => onSelectTeam(team)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedTeamId === team.id
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: team.color || '#4F46E5' }}
                >
                  {team.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-white truncate">{team.name}</p>
                    {team.status === 'archived' && (
                      <span className="text-xs text-slate-500 bg-slate-700/40 px-1.5 rounded">archived</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>{team.member_count} members</span>
                    <span>·</span>
                    <span>{team.project_count} projects</span>
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Team Detail Panel ────────────────────────────────────────────────────────

function TeamDetailPanel({
  org,
  team,
  onDelete,
}: {
  org: OrgOut
  team: TeamOut
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState<RightPanel>('overview')
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: team.name, description: team.description || '', color: team.color || '#4F46E5' })
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('developer')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', team.id],
    queryFn: () => teamsApi.listMembers(team.id).then(r => r.data),
  })
  const { data: orgMembers = [] } = useQuery({
    queryKey: ['org-members', org.id],
    queryFn: () => orgsApi.listMembers(org.id).then(r => r.data),
  })

  const updateTeam = useMutation({
    mutationFn: () => teamsApi.update(team.id, { name: editForm.name, description: editForm.description, color: editForm.color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', org.id] })
      setEditOpen(false)
      toast('Team updated', 'success')
    },
    onError: () => toast('Failed to update team', 'error'),
  })

  const deleteTeam = useMutation({
    mutationFn: () => teamsApi.delete(team.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', org.id] })
      toast('Team deleted', 'success')
      onDelete()
    },
    onError: () => toast('Failed to delete team', 'error'),
  })

  const removeMember = useMutation({
    mutationFn: (membershipId: number) => teamsApi.removeMember(team.id, membershipId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', team.id] })
      qc.invalidateQueries({ queryKey: ['teams', org.id] })
      toast('Member removed', 'success')
    },
    onError: () => toast('Failed to remove member', 'error'),
  })

  const addMember = useMutation({
    mutationFn: () => teamsApi.addMember(team.id, Number(addUserId), addRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', team.id] })
      qc.invalidateQueries({ queryKey: ['teams', org.id] })
      setAddMemberOpen(false)
      setAddUserId('')
      toast('Member added', 'success')
    },
    onError: (e: any) => {
      setFormError(e.response?.data?.detail || 'Failed to add member')
    },
  })

  const tabs: { id: RightPanel; label: string; icon: React.ElementType }[] = [
    { id: 'overview',    label: 'Overview',    icon: Activity },
    { id: 'members',     label: 'Members',     icon: Users    },
    { id: 'permissions', label: 'Permissions', icon: Lock     },
    { id: 'settings',    label: 'Settings',    icon: Settings },
  ]

  const availableToAdd = orgMembers.filter(m => !members.some(tm => tm.user_id === m.user_id))

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Team header */}
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: team.color || '#4F46E5' }}
        >
          {team.name[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-white text-lg truncate">{team.name}</h2>
          <p className="text-xs text-slate-500">
            {team.description || 'No description'}
            {team.lead_name && <span className="ml-2 text-slate-400">· Lead: {team.lead_name}</span>}
          </p>
        </div>
        <button onClick={() => { setEditForm({ name: team.name, description: team.description || '', color: team.color || '#4F46E5' }); setEditOpen(true) }} className="icon-button rounded-lg">
          <Edit2 className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg w-fit border border-slate-700/50">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {tab === 'overview' && (
          <div className="space-y-4">
            <TeamStatsRow teamId={team.id} />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent Activity</h4>
              <ActivityFeed teamId={team.id} />
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              <button onClick={() => { setFormError(''); setAddMemberOpen(true) }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />Add Member
              </button>
            </div>
            {membersLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <Users className="w-8 h-8 mb-2 opacity-25" />
                <p className="text-sm">No members yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {(m.user_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{m.user_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500 truncate">{m.user_email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.role === 'lead' ? 'bg-yellow-500/15 text-yellow-400' :
                      m.role === 'developer' ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-700 text-slate-400'
                    }`}>{m.role}</span>
                    <button
                      onClick={() => removeMember.mutate(m.id)}
                      disabled={removeMember.isPending}
                      className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'permissions' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 flex items-center gap-2"><Lock className="w-3.5 h-3.5" />Role permission matrix</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="py-2 pr-4 text-left text-slate-400 font-medium">Permission</th>
                    {ORDERED_ORG_ROLES.map(role => {
                      const meta = ORG_ROLE_META[role]
                      const Icon = meta.icon
                      return (
                        <th key={role} className="py-2 px-3 text-center">
                          <Icon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${meta.color}`} />
                          <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map(({ key, label }) => (
                    <tr key={key} className="border-b border-slate-700/20">
                      <td className="py-2 pr-4 text-slate-300 font-medium">{label}</td>
                      {ORDERED_ORG_ROLES.map(role => (
                        <td key={role} className="py-2 px-3 text-center">
                          {ROLE_PERMISSIONS[role].includes(key)
                            ? <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />
                            : <Minus className="w-3.5 h-3.5 text-slate-600 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-300">Team Details</h3>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Team Name</label>
                <input className="input-field" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Description</label>
                <input className="input-field" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-2">Team Color</label>
                <div className="flex gap-2 flex-wrap">
                  {TEAM_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setEditForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${editForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <button onClick={() => updateTeam.mutate()} disabled={updateTeam.isPending} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />{updateTeam.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className="border-t border-red-500/20 pt-5">
              <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />Delete Team
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/30 space-y-3">
                  <p className="text-sm text-red-400">Delete <strong>{team.name}</strong>? This will unassign all monitors and projects.</p>
                  <div className="flex gap-3">
                    <button onClick={() => deleteTeam.mutate()} disabled={deleteTeam.isPending} className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10">
                      {deleteTeam.isPending ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-ghost flex items-center gap-1"><X className="w-3.5 h-3.5" />Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Edit Team Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Team">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Team Name</label>
            <input className="input-field" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Description</label>
            <input className="input-field" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this team do?" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {TEAM_COLORS.map(c => (
                <button key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-lg transition-all ${editForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => updateTeam.mutate()} disabled={updateTeam.isPending || !editForm.name.trim()} className="btn-primary flex-1">
              {updateTeam.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)} title={`Add Member to ${team.name}`}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Select Member</label>
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-slate-500">All organization members are already in this team.</p>
            ) : (
              <select className="input-field" value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                <option value="">— Choose a member —</option>
                {availableToAdd.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.user_name} ({m.user_email})</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Role</label>
            <select className="input-field" value={addRole} onChange={e => setAddRole(e.target.value)}>
              <option value="lead">Lead</option>
              <option value="developer">Developer</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => addMember.mutate()} disabled={addMember.isPending || !addUserId} className="btn-primary flex-1">
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </button>
            <button onClick={() => setAddMemberOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ teamId }: { teamId: number }) {
  const { data: activity = [] } = useQuery({
    queryKey: ['team-activity', teamId],
    queryFn: () => teamsApi.getActivity(teamId, 10).then(r => r.data),
    staleTime: 30_000,
  })
  if (activity.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">No recent activity</p>
  }
  return (
    <div className="space-y-2">
      {activity.map((item: any) => (
        <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-slate-700/30 last:border-0">
          <div className="w-6 h-6 rounded-full bg-primary-600/20 flex items-center justify-center text-xs text-primary-400 font-bold flex-shrink-0 mt-0.5">
            {item.user_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300">
              <span className="font-medium">{item.user_name}</span>
              {' '}<span className="text-slate-500">{item.action?.replace(/\./g, ' ')}</span>
            </p>
            <p className="text-xs text-slate-600 mt-0.5">{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Org Settings Panel ───────────────────────────────────────────────────────

function OrgSettingsPanel({ org, onDeleted }: { org: OrgOut; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(org.name)
  const [logoUrl, setLogoUrl] = useState(org.logo_url || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateOrg = useMutation({
    mutationFn: () => orgsApi.update(org.id, { name, logo_url: logoUrl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); toast('Organization updated', 'success') },
    onError: () => toast('Failed to update organization', 'error'),
  })
  const deleteOrg = useMutation({
    mutationFn: () => orgsApi.delete(org.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); toast('Organization deleted', 'success'); onDeleted() },
    onError: () => toast('Failed to delete organization', 'error'),
  })

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Organization Details</h3>
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1.5">Name</label>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1.5">Logo URL</label>
          <input className="input-field" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" />
        </div>
        <button onClick={() => updateOrg.mutate()} disabled={updateOrg.isPending} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />{updateOrg.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <div className="border-t border-red-500/20 pt-6">
        <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />Delete Organization
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/30 space-y-3">
            <p className="text-sm text-red-400">Permanently delete <strong>{org.name}</strong> and all its data?</p>
            <div className="flex gap-3">
              <button onClick={() => deleteOrg.mutate()} disabled={deleteOrg.isPending} className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10">
                {deleteOrg.isPending ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost flex items-center gap-1"><X className="w-3.5 h-3.5" />Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Org Members Panel ─────────────────────────────────────────────────────────

function OrgMembersPanel({ org }: { org: OrgOut }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [formError, setFormError] = useState('')

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-members', org.id],
    queryFn: () => orgsApi.listMembers(org.id).then(r => r.data),
  })

  const removeMember = useMutation({
    mutationFn: (memberId: number) => orgsApi.removeMember(org.id, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-members', org.id] }); toast('Member removed', 'success') },
    onError: () => toast('Failed to remove', 'error'),
  })
  const updateRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: string }) => orgsApi.updateMemberRole(org.id, memberId, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-members', org.id] }); toast('Role updated', 'success') },
    onError: () => toast('Failed to update role', 'error'),
  })
  const inviteMember = useMutation({
    mutationFn: () => orgsApi.inviteMember(org.id, inviteEmail, inviteRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', org.id] })
      setInviteOpen(false); setInviteEmail('')
      toast('Member invited!', 'success')
    },
    onError: (e: any) => setFormError(e.response?.data?.detail || 'Failed to invite'),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setFormError(''); setInviteOpen(true) }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />Invite Member
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {(m.user_name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{m.user_name || 'Unknown'}</p>
                <p className="text-xs text-slate-500 truncate">{m.user_email}</p>
              </div>
              {m.role === 'owner' ? (
                <RoleBadge role="owner" small />
              ) : (
                <select className="input-field text-xs py-1 pl-2 pr-7 w-32" value={m.role}
                  onChange={e => updateRole.mutate({ memberId: m.id, role: e.target.value })}>
                  {ORDERED_ORG_ROLES.filter(r => r !== 'owner').map(r => (
                    <option key={r} value={r}>{ORG_ROLE_META[r].label}</option>
                  ))}
                </select>
              )}
              {m.role !== 'owner' && (
                <button onClick={() => removeMember.mutate(m.id)} disabled={removeMember.isPending} className="text-slate-500 hover:text-red-400 transition-colors ml-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title={`Invite to ${org.name}`}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Email</label>
            <input type="email" className="input-field" placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Role</label>
            <select className="input-field" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {ORDERED_ORG_ROLES.filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ORG_ROLE_META[r].label}</option>)}
            </select>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => inviteMember.mutate()} disabled={inviteMember.isPending || !inviteEmail.trim()} className="btn-primary flex-1">
              {inviteMember.isPending ? 'Inviting…' : 'Send Invite'}
            </button>
            <button onClick={() => setInviteOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

type OrgView = 'teams' | 'members' | 'settings'

export default function Teams() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [selectedOrg, setSelectedOrg] = useState<OrgOut | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamOut | null>(null)
  const [orgView, setOrgView] = useState<OrgView>('teams')
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [orgForm, setOrgForm] = useState<OrgCreate>({ name: '', slug: '' })
  const [teamForm, setTeamForm] = useState<TeamCreate>({ name: '', description: '', color: '#4F46E5' })
  const [formError, setFormError] = useState('')

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  const createOrg = useMutation({
    mutationFn: () => orgsApi.create(orgForm),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      setCreateOrgOpen(false)
      setOrgForm({ name: '', slug: '' })
      setSelectedOrg(res.data)
      setOrgView('teams')
      toast('Organization created!', 'success')
    },
    onError: (e: any) => setFormError(e.response?.data?.detail || 'Failed to create'),
  })

  const createTeam = useMutation({
    mutationFn: () => teamsApi.create(selectedOrg!.id, teamForm),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['teams', selectedOrg?.id] })
      setCreateTeamOpen(false)
      setTeamForm({ name: '', description: '', color: '#4F46E5' })
      setSelectedTeam(res.data)
      toast('Team created!', 'success')
    },
    onError: (e: any) => setFormError(e.response?.data?.detail || 'Failed to create team'),
  })

  function handleSelectOrg(org: OrgOut) {
    setSelectedOrg(org)
    setSelectedTeam(null)
    setOrgView('teams')
  }

  const orgViewTabs: { id: OrgView; label: string; icon: React.ElementType }[] = [
    { id: 'teams',    label: 'Teams',   icon: Users    },
    { id: 'members',  label: 'Members', icon: UserPlus },
    { id: 'settings', label: 'Settings',icon: Settings },
  ]

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      <Header
        title="Organizations & Teams"
        action={{ label: 'New Organization', onClick: () => { setFormError(''); setCreateOrgOpen(true) } }}
      />

      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 560 }}>

        {/* Col 1: Organizations */}
        <aside className="w-56 flex-shrink-0 glass-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />Organizations
            </h2>
            <button onClick={() => { setFormError(''); setCreateOrgOpen(true) }} className="icon-button w-6 h-6 rounded-md" title="New org">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {orgsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : orgs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-25" />
                <p className="text-xs">No organizations yet</p>
                <button onClick={() => setCreateOrgOpen(true)} className="mt-2 btn-primary text-xs py-1 px-2">Create one</button>
              </div>
            ) : (
              orgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    selectedOrg?.id === org.id
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary-600/20 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                      {org.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{org.name}</p>
                      <p className="text-xs text-slate-500 truncate">/{org.slug}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Col 2: Org content (teams/members/settings) */}
        <div className="w-72 flex-shrink-0 glass-card p-4 flex flex-col gap-3">
          {!selectedOrg ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-500">
              <Building2 className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm font-medium">Select an organization</p>
            </div>
          ) : (
            <>
              {/* Org header */}
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700/40">
                <div className="w-9 h-9 rounded-xl bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400 flex-shrink-0">
                  {selectedOrg.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{selectedOrg.name}</p>
                  <span className="text-xs text-primary-300 bg-primary-500/10 px-1.5 py-0.5 rounded capitalize">{selectedOrg.plan}</span>
                </div>
              </div>

              {/* Org view tabs */}
              <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                {orgViewTabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setOrgView(id)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs font-medium transition-all ${
                      orgView === id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}>
                    <Icon className="w-3 h-3" />{label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {orgView === 'teams' && (
                  <TeamsList
                    org={selectedOrg}
                    selectedTeamId={selectedTeam?.id ?? null}
                    onSelectTeam={setSelectedTeam}
                    onCreateTeam={() => { setFormError(''); setCreateTeamOpen(true) }}
                  />
                )}
                {orgView === 'members' && <OrgMembersPanel org={selectedOrg} />}
                {orgView === 'settings' && (
                  <OrgSettingsPanel org={selectedOrg} onDeleted={() => { setSelectedOrg(null); setSelectedTeam(null) }} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Col 3: Team detail */}
        <div className="flex-1 glass-card p-5 flex flex-col">
          {!selectedTeam ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-500">
              <Users className="w-14 h-14 opacity-20 mb-3" />
              <p className="font-medium">No team selected</p>
              <p className="text-sm mt-1">{selectedOrg ? 'Select a team from the middle column' : 'First select an organization'}</p>
            </div>
          ) : (
            <TeamDetailPanel
              org={selectedOrg!}
              team={selectedTeam}
              onDelete={() => setSelectedTeam(null)}
            />
          )}
        </div>
      </div>

      {/* Create Org Modal */}
      <Modal isOpen={createOrgOpen} onClose={() => setCreateOrgOpen(false)} title="New Organization">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Organization Name</label>
            <input className="input-field" placeholder="Acme Inc." value={orgForm.name}
              onChange={e => setOrgForm(f => ({
                ...f, name: e.target.value,
                slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
              }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Slug</label>
            <input className="input-field" placeholder="acme-inc" value={orgForm.slug}
              onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} />
            <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createOrg.mutate()} disabled={createOrg.isPending || !orgForm.name.trim()} className="btn-primary flex-1">
              {createOrg.isPending ? 'Creating…' : 'Create Organization'}
            </button>
            <button onClick={() => setCreateOrgOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Create Team Modal */}
      <Modal isOpen={createTeamOpen} onClose={() => setCreateTeamOpen(false)} title={`New Team in ${selectedOrg?.name}`}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Team Name</label>
            <input className="input-field" placeholder="e.g. DevOps Team" value={teamForm.name}
              onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Description <span className="text-slate-500 font-normal">(optional)</span></label>
            <input className="input-field" placeholder="What does this team handle?" value={teamForm.description}
              onChange={e => setTeamForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-2">Team Color</label>
            <div className="flex gap-2 flex-wrap">
              {TEAM_COLORS.map(c => (
                <button key={c} onClick={() => setTeamForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-lg transition-all ${teamForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createTeam.mutate()} disabled={createTeam.isPending || !teamForm.name.trim()} className="btn-primary flex-1">
              {createTeam.isPending ? 'Creating…' : 'Create Team'}
            </button>
            <button onClick={() => setCreateTeamOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
