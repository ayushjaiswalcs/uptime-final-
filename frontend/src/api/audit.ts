import client from './client'

export interface AuditLogOut {
  id: number; user_id?: number; action: string; resource_type?: string
  resource_id?: number; details?: string; ip_address?: string
  user_agent?: string; created_at: string
}

export const auditApi = {
  list: (params?: { limit?: number; offset?: number; action?: string }) =>
    client.get<AuditLogOut[]>('/audit', { params }),
}
