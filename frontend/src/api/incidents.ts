import client from './client'

export interface Incident {
  id: number
  monitor_id: number
  monitor_name?: string
  outage_start_time: string
  recovery_time: string | null
  error_message: string | null
  incident_status: string
}

export const incidentsApi = {
  list: (status?: string) => client.get<Incident[]>('/incidents', { params: status ? { status } : {} }),
  resolve: (id: number) => client.post<Incident>(`/incidents/${id}/resolve`),
}
