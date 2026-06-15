import client from './client'

export interface OrgCreate { name: string; slug: string; logo_url?: string }
export interface OrgOut { id: number; name: string; slug: string; owner_id: number; logo_url?: string; plan: string; created_at: string }
export interface MemberOut { id: number; user_id: number; org_id: number; role: string; joined_at: string; user_name?: string; user_email?: string }

export const orgsApi = {
  list: () => client.get<OrgOut[]>('/organizations'),
  create: (data: OrgCreate) => client.post<OrgOut>('/organizations', data),
  get: (id: number) => client.get<OrgOut>(`/organizations/${id}`),
  update: (id: number, data: Partial<OrgCreate>) => client.put<OrgOut>(`/organizations/${id}`, data),
  delete: (id: number) => client.delete(`/organizations/${id}`),
  listMembers: (id: number) => client.get<MemberOut[]>(`/organizations/${id}/members`),
  inviteMember: (id: number, email: string, role: string) => client.post(`/organizations/${id}/members`, { email, role }),
  updateMemberRole: (orgId: number, memberId: number, role: string) => client.put(`/organizations/${orgId}/members/${memberId}`, { role }),
  removeMember: (orgId: number, memberId: number) => client.delete(`/organizations/${orgId}/members/${memberId}`),
}
