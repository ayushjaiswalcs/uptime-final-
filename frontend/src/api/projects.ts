import client from './client'

export interface ProjectCreate {
  name: string
  org_id: number
  team_id?: number
  description?: string
  status?: string
  priority?: string
  start_date?: string
  end_date?: string
}

export interface ProjectUpdate {
  name?: string
  team_id?: number
  description?: string
  status?: string
  priority?: string
  start_date?: string
  end_date?: string
}

export interface ProjectMemberOut {
  id: number
  project_id: number
  user_id: number
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
}

export interface ProjectOut {
  id: number
  org_id: number
  team_id?: number
  name: string
  description?: string
  status: string
  priority: string
  start_date?: string
  end_date?: string
  created_at: string
  team_name?: string
  monitor_count: number
  member_count: number
}

export interface ProjectStats {
  total_monitors: number
  active_monitors: number
  down_monitors: number
  incident_count: number
  open_incidents: number
  member_count: number
  avg_uptime: number
  avg_response_time: number
  health_score: number
  sla_compliance: boolean
}

export const projectsApi = {
  list: (orgId: number, teamId?: number) =>
    client.get<ProjectOut[]>(`/projects?org_id=${orgId}${teamId ? `&team_id=${teamId}` : ''}`),
  create: (data: ProjectCreate) => client.post<ProjectOut>('/projects', data),
  get: (projectId: number) => client.get<ProjectOut>(`/projects/${projectId}`),
  update: (projectId: number, data: ProjectUpdate) => client.put<ProjectOut>(`/projects/${projectId}`, data),
  delete: (projectId: number) => client.delete(`/projects/${projectId}`),
  listMembers: (projectId: number) => client.get<ProjectMemberOut[]>(`/projects/${projectId}/members`),
  addMember: (projectId: number, userId: number, role: string) => client.post(`/projects/${projectId}/members`, { user_id: userId, role }),
  removeMember: (projectId: number, memberId: number) => client.delete(`/projects/${projectId}/members/${memberId}`),
  getStats: (projectId: number) => client.get<ProjectStats>(`/projects/${projectId}/stats`),
}
