import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Building2, Crown, Shield, Code2, Eye, Briefcase, Search } from 'lucide-react'
import { orgsApi, type OrgOut, type MemberOut } from '../api/organizations'
import { teamsApi } from '../api/teams'
import Header from '../components/layout/Header'
import { Skeleton } from '../components/ui/Skeleton'

const ROLE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  owner:     { label: 'Owner',     icon: Crown,     color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  admin:     { label: 'Admin',     icon: Shield,    color: 'text-red-400',    bg: 'bg-red-500/10'    },
  manager:   { label: 'Manager',   icon: Briefcase, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  developer: { label: 'Developer', icon: Code2,     color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  viewer:    { label: 'Viewer',    icon: Eye,       color: 'text-slate-400',  bg: 'bg-slate-500/10'  },
  lead:      { label: 'Lead',      icon: Crown,     color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? ROLE_META.viewer
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} ${meta.bg}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  )
}

function MemberRow({ member, teamNames }: { member: MemberOut; teamNames?: string[] }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/40 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
        {(member.user_name || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{member.user_name || 'Unknown'}</p>
        <p className="text-xs text-slate-500 truncate">{member.user_email}</p>
      </div>
      <div className="flex items-center gap-2">
        <RoleBadge role={member.role} />
      </div>
      {teamNames && teamNames.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap max-w-xs">
          {teamNames.map(name => (
            <span key={name} className="text-xs bg-primary-500/10 text-primary-300 px-2 py-0.5 rounded-full">{name}</span>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-600 flex-shrink-0">Joined {new Date(member.joined_at).toLocaleDateString()}</p>
    </div>
  )
}

export default function Members() {
  const [selectedOrgId, setSelectedOrgId] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')

  const { data: orgs = [], isLoading: orgsLoading } = useQuery<OrgOut[]>({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  useEffect(() => {
    if (orgs.length > 0 && !selectedOrgId) setSelectedOrgId(orgs[0].id)
  }, [orgs, selectedOrgId])

  const selectedOrg = orgs.find(o => o.id === selectedOrgId)

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', selectedOrgId],
    queryFn: () => selectedOrgId ? orgsApi.listMembers(Number(selectedOrgId)).then(r => r.data) : [],
    enabled: !!selectedOrgId,
  })

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', selectedOrgId],
    queryFn: () => selectedOrgId ? teamsApi.list(Number(selectedOrgId)).then(r => r.data) : [],
    enabled: !!selectedOrgId,
  })

  // Build member → teams mapping from team memberships (we only have counts, so label per org)
  const filteredMembers = (members as MemberOut[]).filter(m => {
    if (filterRole && m.role !== filterRole) return false
    if (search) {
      const q = search.toLowerCase()
      if (!m.user_name?.toLowerCase().includes(q) && !m.user_email?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const roleCounts = (members as MemberOut[]).reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-6 space-y-6">
      <Header title="Members" />

      {/* Org + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          {orgsLoading ? <Skeleton className="h-9 w-44" /> : (
            <select className="input-field py-2 w-48" value={selectedOrgId} onChange={e => setSelectedOrgId(Number(e.target.value) || '')}>
              <option value="">— Select Organization —</option>
              {(orgs as OrgOut[]).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
        {selectedOrgId && (
          <>
            <select className="input-field py-2 w-36" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="">All Roles</option>
              {['owner', 'admin', 'manager', 'developer', 'viewer'].map(r => (
                <option key={r} value={r}>{ROLE_META[r].label} ({roleCounts[r] || 0})</option>
              ))}
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
            <div className="ml-auto text-xs text-slate-500">
              {filteredMembers.length} of {(members as MemberOut[]).length} members
            </div>
          </>
        )}
      </div>

      {/* Summary cards */}
      {selectedOrgId && !membersLoading && (members as MemberOut[]).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { role: 'owner',     count: roleCounts.owner     || 0 },
            { role: 'admin',     count: roleCounts.admin     || 0 },
            { role: 'developer', count: roleCounts.developer || 0 },
            { role: 'viewer',    count: roleCounts.viewer    || 0 },
          ].map(({ role, count }) => {
            const meta = ROLE_META[role]
            const Icon = meta.icon
            return (
              <button
                key={role}
                onClick={() => setFilterRole(filterRole === role ? '' : role)}
                className={`glass-card p-4 text-left rounded-xl border transition-all ${filterRole === role ? 'border-primary-500 bg-primary-500/5' : 'border-slate-700/40 hover:border-slate-600'}`}
              >
                <Icon className={`w-4 h-4 mb-1.5 ${meta.color}`} />
                <p className="text-xl font-bold text-white">{count}</p>
                <p className={`text-xs font-medium ${meta.color}`}>{meta.label}{count !== 1 ? 's' : ''}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Members list */}
      {!selectedOrgId ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-slate-500">
          <Users className="w-14 h-14 opacity-20 mb-3" />
          <p className="font-medium">Select an organization to view members</p>
        </div>
      ) : membersLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filteredMembers.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-slate-500">
          <Users className="w-12 h-12 opacity-20 mb-3" />
          <p>{(members as MemberOut[]).length === 0 ? 'No members in this organization' : 'No matches'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMembers.map(m => (
            <MemberRow key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  )
}
