import client from './client'

export interface Incident {
  id: number
  monitor_id: number
  monitor_name?: string
  outage_start_time: string
  recovery_time: string | null
  error_message: string | null
  incident_status: string
  severity?: string
  title?: string
  assigned_user_id?: number
  assigned_team_id?: number
  root_cause?: string
}

export interface IncidentMetrics {
  total: number
  ongoing: number
  resolved: number
  mttr_minutes: number
  mtbf_hours: number
  by_severity: Record<string, number>
  window_days: number
}

export const incidentsApi = {
  list: (status?: string, severity?: string) =>
    client.get<Incident[]>('/incidents', { params: { ...(status ? { status } : {}), ...(severity ? { severity } : {}) } }),
  get: (id: number) => client.get<Incident>(`/incidents/${id}`),
  update: (id: number, data: Partial<Incident>) => client.patch<Incident>(`/incidents/${id}`, data),
  resolve: (id: number) => client.post<Incident>(`/incidents/${id}/resolve`),
  acknowledge: (id: number) => client.post(`/incidents/${id}/acknowledge`),
  timeline: (id: number) => client.get(`/incidents/${id}/timeline`),
  postmortem: (id: number, data: Record<string, string>) => client.post(`/incidents/${id}/postmortem`, data),
  metrics: () => client.get<IncidentMetrics>('/incidents/metrics'),
}
