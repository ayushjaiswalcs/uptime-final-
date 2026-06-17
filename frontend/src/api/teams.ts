import client from './client'

export interface TeamCreate {
  name: string
  description?: string
  lead_id?: number
  color?: string
}

export interface TeamUpdate {
  name?: string
  description?: string
  lead_id?: number
  color?: string
  status?: string
}

export interface TeamMembershipOut {
  id: number
  team_id: number
  user_id: number
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
}

export interface TeamOut {
  id: number
  org_id: number
  name: string
  description?: string
  lead_id?: number
  color?: string
  status: string
  created_at: string
  member_count: number
  project_count: number
  lead_name?: string
}

export interface TeamStats {
  total_projects: number
  total_monitors: number
  active_monitors: number
  down_monitors: number
  total_members: number
  monthly_incidents: number
  avg_uptime: number
  avg_response_time: number
  performance_score: number
}

export const teamsApi = {
  list: (orgId: number) => client.get<TeamOut[]>(`/teams?org_id=${orgId}`),
  create: (orgId: number, data: TeamCreate) => client.post<TeamOut>(`/teams?org_id=${orgId}`, data),
  get: (teamId: number) => client.get<TeamOut>(`/teams/${teamId}`),
  update: (teamId: number, data: TeamUpdate) => client.put<TeamOut>(`/teams/${teamId}`, data),
  delete: (teamId: number) => client.delete(`/teams/${teamId}`),
  listMembers: (teamId: number) => client.get<TeamMembershipOut[]>(`/teams/${teamId}/members`),
  addMember: (teamId: number, userId: number, role: string) => client.post(`/teams/${teamId}/members`, { user_id: userId, role }),
  removeMember: (teamId: number, membershipId: number) => client.delete(`/teams/${teamId}/members/${membershipId}`),
  getStats: (teamId: number) => client.get<TeamStats>(`/teams/${teamId}/stats`),
  getActivity: (teamId: number, limit?: number) => client.get<any[]>(`/teams/${teamId}/activity${limit ? `?limit=${limit}` : ''}`),
}
