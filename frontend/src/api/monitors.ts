import client from './client'

export interface Monitor {
  id: number
  user_id: number
  monitor_name: string
  target_url: string
  monitor_type: string
  interval: number
  timeout: number
  http_method: string
  expected_status_code: number
  current_status: string
  is_paused: boolean
  uptime_percentage: string
  keyword: string | null
  dns_record_type: string | null
  alert_threshold: number
  failure_count: number
  created_at: string
  last_checked_at: string | null
  owner_name: string | null
}

export interface MonitorLog {
  id: number
  monitor_id: number
  response_time: number | null
  http_status: number | null
  is_up: boolean
  error_message: string | null
  checked_at: string
}

export interface MonitorCreate {
  monitor_name: string
  target_url: string
  monitor_type: string
  interval: number
  timeout: number
  http_method: string
  expected_status_code: number
  custom_headers?: string
  request_body?: string
  keyword?: string
  dns_record_type?: string
  alert_threshold?: number
}

export interface MetricBucket {
  timestamp: string
  label: string
  uptime: number
  response_time: number
  up_count: number
  total_count: number
}

export interface IncidentEntry {
  id: number
  started_at: string
  resolved_at: string | null
  status: string
  error: string | null
  duration_mins: number
}

export interface MonitorMetrics {
  range: string
  total_checks: number
  up_checks: number
  down_checks: number
  avg_response_time: number
  incident_count: number
  buckets: MetricBucket[]
  incidents: IncidentEntry[]
}

export const monitorsApi = {
  list: (all = false) => client.get<Monitor[]>('/monitors', { params: all ? { all: true } : {} }),
  get: (id: number) => client.get<Monitor>(`/monitors/${id}`),
  create: (data: MonitorCreate) => client.post<Monitor>('/monitors', data),
  update: (id: number, data: Partial<MonitorCreate> & { is_paused?: boolean }) =>
    client.put<Monitor>(`/monitors/${id}`, data),
  delete: (id: number) => client.delete(`/monitors/${id}`),
  pause: (id: number) => client.post(`/monitors/${id}/pause`),
  getLogs: (id: number, hours = 24) =>
    client.get<MonitorLog[]>(`/monitors/${id}/logs`, { params: { hours } }),
  getMetrics: (id: number, range: '1d' | '7d' | '30d' = '1d') =>
    client.get<MonitorMetrics>(`/monitors/${id}/metrics`, { params: { range } }),
}
