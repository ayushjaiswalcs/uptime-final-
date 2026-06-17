import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FolderOpen, Plus, Trash2, Edit2, Save, X, Users, Activity,
  AlertTriangle, TrendingUp, Calendar, Filter, ChevronRight,
  Zap, Clock, CheckCircle2, Circle, PauseCircle, Archive, Flag,
  BarChart2, Search, Building2,
} from 'lucide-react'
import { orgsApi, type OrgOut } from '../api/organizations'
import { teamsApi, type TeamOut } from '../api/teams'
import { projectsApi, type ProjectOut, type ProjectCreate, type ProjectStats } from '../api/projects'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'
import { useToast } from '../context/ToastContext'
import { Skeleton } from '../components/ui/Skeleton'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  active:    { label: 'Active',    color: 'text-green-400',  bg: 'bg-green-500/10',  icon: CheckCircle2 },
  paused:    { label: 'Paused',    color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: PauseCircle  },
  completed: { label: 'Completed', color: 'text-blue-400',   bg: 'bg-blue-500/10',   icon: CheckCircle2 },
  archived:  { label: 'Archived',  color: 'text-slate-400',  bg: 'bg-slate-500/10',  icon: Archive      },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-slate-400',  bg: 'bg-slate-700/40'   },
  medium:   { label: 'Medium',   color: 'text-blue-400',   bg: 'bg-blue-500/10'    },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-500/10'  },
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-500/10'     },
}

const EMPTY_FORM: ProjectCreate = {
  name: '', org_id: 0, team_id: undefined, description: '', status: 'active', priority: 'medium',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.active
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} ${meta.bg}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} ${meta.bg}`}>
      <Flag className="w-2.5 h-2.5" />{meta.label}
    </span>
  )
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{score}</span>
    </div>
  )
}

// ─── Project Stats Panel ──────────────────────────────────────────────────────

function ProjectStatsPanel({ project }: { project: ProjectOut }) {
  const { data: stats, isLoading } = useQuery<ProjectStats>({
    queryKey: ['project-stats', project.id],
    queryFn: () => projectsApi.getStats(project.id).then(r => r.data),
    staleTime: 30_000,
  })

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
  if (!stats) return null

  const statCards = [
    { label: 'Monitors',    value: stats.total_monitors,                    icon: Activity,      color: 'text-blue-400',   bg: 'bg-blue-500/10'    },
    { label: 'Down',        value: stats.down_monitors,                     icon: AlertTriangle, color: stats.down_monitors > 0 ? 'text-red-400' : 'text-slate-500', bg: stats.down_monitors > 0 ? 'bg-red-500/10' : 'bg-slate-700/30' },
    { label: 'Avg Uptime',  value: `${stats.avg_uptime.toFixed(1)}%`,       icon: TrendingUp,    color: 'text-green-400',  bg: 'bg-green-500/10'   },
    { label: 'Incidents',   value: stats.incident_count,                    icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10'  },
    { label: 'Resp. Time',  value: `${stats.avg_response_time}ms`,          icon: Clock,         color: 'text-purple-400', bg: 'bg-purple-500/10'  },
    { label: 'Members',     value: stats.member_count,                      icon: Users,         color: 'text-slate-300',  bg: 'bg-slate-700/30'   },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-300">Health Score</h4>
        <span className={`text-lg font-bold ${stats.health_score >= 90 ? 'text-green-400' : stats.health_score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
          {stats.health_score}
        </span>
      </div>
      <HealthBar score={stats.health_score} />

      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${stats.sla_compliance ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-slate-400">SLA {stats.sla_compliance ? 'Compliant (≥ 99.9%)' : 'Non-Compliant'}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-xl p-3 ${bg} border border-slate-700/30`}>
            <Icon className={`w-4 h-4 mb-1 ${color}`} />
            <p className="text-white font-bold text-base">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, selected, onClick }: { project: ProjectOut; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-primary-500 bg-primary-500/8'
          : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          project.status === 'active' ? 'bg-green-500/15' :
          project.status === 'completed' ? 'bg-blue-500/15' : 'bg-slate-700/40'
        }`}>
          <FolderOpen className={`w-5 h-5 ${
            project.status === 'active' ? 'text-green-400' :
            project.status === 'completed' ? 'text-blue-400' : 'text-slate-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-white truncate">{project.name}</p>
          </div>
          <p className="text-xs text-slate-500 truncate mb-2">{project.description || 'No description'}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{project.monitor_count} monitors</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{project.member_count} members</span>
            {project.team_name && <span className="text-primary-400">#{project.team_name}</span>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" />
      </div>
    </button>
  )
}

// ─── Edit Project Panel ───────────────────────────────────────────────────────

function EditProjectPanel({
  project,
  teams,
  onSaved,
  onDeleted,
}: {
  project: ProjectOut
  teams: TeamOut[]
  onSaved: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    name: project.name,
    description: project.description || '',
    status: project.status,
    priority: project.priority,
    team_id: project.team_id?.toString() || '',
    start_date: project.start_date || '',
    end_date: project.end_date || '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = useMutation({
    mutationFn: () => projectsApi.update(project.id, {
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      priority: form.priority,
      team_id: form.team_id ? Number(form.team_id) : undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Project updated', 'success')
      onSaved()
    },
    onError: () => toast('Failed to update project', 'error'),
  })

  const remove = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Project deleted', 'success')
      onDeleted()
    },
    onError: () => toast('Failed to delete project', 'error'),
  })

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1">Project Name</label>
        <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1">Description</label>
        <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this project?" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">Status</label>
          <select className="input-field text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">Priority</label>
          <select className="input-field text-sm" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1">Owning Team</label>
        <select className="input-field text-sm" value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}>
          <option value="">— Unassigned —</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">Start Date</label>
          <input type="date" className="input-field text-sm" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">End Date</label>
          <input type="date" className="input-field text-sm" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>
      <button onClick={() => update.mutate()} disabled={update.isPending || !form.name.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
        <Save className="w-4 h-4" />{update.isPending ? 'Saving...' : 'Save Changes'}
      </button>

      <div className="border-t border-red-500/20 pt-4">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />Delete Project
          </button>
        ) : (
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
            <p className="text-xs text-red-400">Delete <strong>{project.name}</strong>? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => remove.mutate()} disabled={remove.isPending} className="text-xs btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 py-1 px-3">
                {remove.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs btn-ghost py-1 px-3">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

type DetailTab = 'stats' | 'edit'

export default function Projects() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [selectedOrg, setSelectedOrg] = useState<OrgOut | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectOut | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('stats')
  const [createOpen, setCreateOpen] = useState(false)
  const [filterTeam, setFilterTeam] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [createForm, setCreateForm] = useState<ProjectCreate>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', selectedOrg?.id],
    queryFn: () => selectedOrg ? teamsApi.list(selectedOrg.id).then(r => r.data) : [],
    enabled: !!selectedOrg,
  })

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', selectedOrg?.id, filterTeam || undefined],
    queryFn: () => selectedOrg ? projectsApi.list(selectedOrg.id, filterTeam ? Number(filterTeam) : undefined).then(r => r.data) : [],
    enabled: !!selectedOrg,
  })

  const createProject = useMutation({
    mutationFn: () => projectsApi.create({ ...createForm, org_id: selectedOrg!.id }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setCreateOpen(false)
      setCreateForm(EMPTY_FORM)
      setSelectedProject(res.data)
      setDetailTab('stats')
      toast('Project created!', 'success')
    },
    onError: (e: any) => setFormError(e.response?.data?.detail || 'Failed to create project'),
  })

  const filteredProjects = projects.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusCounts = {
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    paused: projects.filter(p => p.status === 'paused').length,
  }

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      <Header
        title="Projects"
        action={selectedOrg ? { label: 'New Project', onClick: () => { setFormError(''); setCreateForm({ ...EMPTY_FORM, org_id: selectedOrg.id }); setCreateOpen(true) } } : undefined}
      />

      {/* Org selector + summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          {orgsLoading ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <select
              className="input-field py-2 w-48"
              value={selectedOrg?.id || ''}
              onChange={e => {
                const org = orgs.find(o => o.id === Number(e.target.value)) || null
                setSelectedOrg(org)
                setSelectedProject(null)
                setFilterTeam('')
              }}
            >
              <option value="">— Select Organization —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        {selectedOrg && (
          <>
            <select className="input-field py-2 w-40" value={filterTeam} onChange={e => setFilterTeam(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="input-field py-2 w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="flex items-center gap-2 border border-slate-700/50 rounded-xl px-3 py-2 bg-slate-800/40">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                className="bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none w-32"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              <span className="text-green-400 font-medium">{statusCounts.active} active</span>
              <span>·</span>
              <span className="text-blue-400 font-medium">{statusCounts.completed} completed</span>
              <span>·</span>
              <span className="text-yellow-400 font-medium">{statusCounts.paused} paused</span>
            </div>
          </>
        )}
      </div>

      {!selectedOrg ? (
        <div className="glass-card flex flex-col items-center justify-center py-24 text-slate-500">
          <FolderOpen className="w-16 h-16 opacity-20 mb-4" />
          <p className="font-medium">Select an organization to manage projects</p>
          {orgs.length === 0 && (
            <p className="text-sm mt-2 text-slate-600">No organizations found. Create one in the Teams page.</p>
          )}
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 480 }}>
          {/* Projects list */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {projectsLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
            ) : filteredProjects.length === 0 ? (
              <div className="glass-card flex flex-col items-center justify-center py-20 text-slate-500">
                <FolderOpen className="w-14 h-14 opacity-20 mb-3" />
                <p className="font-medium">{projects.length === 0 ? 'No projects yet' : 'No matches'}</p>
                {projects.length === 0 && (
                  <button onClick={() => setCreateOpen(true)} className="mt-3 btn-primary">Create First Project</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProjects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selected={selectedProject?.id === project.id}
                    onClick={() => { setSelectedProject(project); setDetailTab('stats') }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Project detail */}
          <div className="w-80 flex-shrink-0 glass-card p-5 flex flex-col overflow-y-auto">
            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center flex-1 text-slate-500">
                <FolderOpen className="w-12 h-12 opacity-20 mb-3" />
                <p className="text-sm">Select a project to view details</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Project header */}
                <div className="flex items-start gap-3 pb-3 border-b border-slate-700/40">
                  <div className="w-10 h-10 rounded-xl bg-primary-600/15 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-5 h-5 text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{selectedProject.name}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{selectedProject.description || 'No description'}</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <StatusBadge status={selectedProject.status} />
                      <PriorityBadge priority={selectedProject.priority} />
                    </div>
                  </div>
                </div>

                {selectedProject.team_name && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />Team: <span className="text-primary-400">{selectedProject.team_name}</span>
                  </p>
                )}

                {(selectedProject.start_date || selectedProject.end_date) && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {selectedProject.start_date && <span>{selectedProject.start_date}</span>}
                    {selectedProject.start_date && selectedProject.end_date && <span>→</span>}
                    {selectedProject.end_date && <span>{selectedProject.end_date}</span>}
                  </div>
                )}

                {/* Detail tabs */}
                <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                  {([['stats', BarChart2, 'Stats'], ['edit', Edit2, 'Edit']] as [DetailTab, React.ElementType, string][]).map(([id, Icon, label]) => (
                    <button key={id} onClick={() => setDetailTab(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-all ${
                        detailTab === id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}>
                      <Icon className="w-3 h-3" />{label}
                    </button>
                  ))}
                </div>

                {detailTab === 'stats' && <ProjectStatsPanel project={selectedProject} />}
                {detailTab === 'edit' && (
                  <EditProjectPanel
                    project={selectedProject}
                    teams={teams}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ['projects'] })
                      setDetailTab('stats')
                    }}
                    onDeleted={() => setSelectedProject(null)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Project">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Project Name *</label>
            <input className="input-field" placeholder="e.g. FarmSuraksha360" value={createForm.name}
              onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Description</label>
            <textarea className="input-field" rows={2} placeholder="What is this project?" value={createForm.description}
              onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Team <span className="text-slate-500 font-normal">(optional)</span></label>
            <select className="input-field" value={createForm.team_id || ''} onChange={e => setCreateForm(f => ({ ...f, team_id: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">— Unassigned —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Status</label>
              <select className="input-field" value={createForm.status} onChange={e => setCreateForm(f => ({ ...f, status: e.target.value }))}>
                {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Priority</label>
              <select className="input-field" value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Start Date</label>
              <input type="date" className="input-field" value={createForm.start_date || ''} onChange={e => setCreateForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">End Date</label>
              <input type="date" className="input-field" value={createForm.end_date || ''} onChange={e => setCreateForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => createProject.mutate()} disabled={createProject.isPending || !createForm.name.trim()} className="btn-primary flex-1">
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
