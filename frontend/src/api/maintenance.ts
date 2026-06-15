import client from './client'

export interface MaintenanceCreate {
  name: string; description?: string; starts_at: string; ends_at: string
  is_recurring?: boolean; recurrence_cron?: string; monitor_ids?: number[]
}
export interface MaintenanceOut {
  id: number; user_id: number; name: string; description?: string
  starts_at: string; ends_at: string; is_recurring: boolean
  recurrence_cron?: string; affected_monitors?: string; created_at: string
}

export const maintenanceApi = {
  list: () => client.get<MaintenanceOut[]>('/maintenance'),
  create: (data: MaintenanceCreate) => client.post<MaintenanceOut>('/maintenance', data),
  get: (id: number) => client.get<MaintenanceOut>(`/maintenance/${id}`),
  update: (id: number, data: Partial<MaintenanceCreate>) => client.put<MaintenanceOut>(`/maintenance/${id}`, data),
  delete: (id: number) => client.delete(`/maintenance/${id}`),
  active: () => client.get<MaintenanceOut[]>('/maintenance/active'),
}
