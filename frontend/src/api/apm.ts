import client from './client'

export interface APMOverview {
  total_transactions: number
  error_count: number
  error_rate: number
  avg_duration_ms: number
  p95_duration_ms: number
  active_errors: number
  slow_transactions: {
    id: number
    name: string
    duration_ms: number
    status_code?: number
    is_error: boolean
    created_at: string
  }[]
  window_hours: number
}

export interface APMTransaction {
  id: number
  monitor_id: number
  name: string
  duration_ms: number
  status_code?: number
  is_error: boolean
  error_message?: string
  trace_id?: string
  created_at: string
}

export interface APMError {
  id: number
  monitor_id: number
  error_type: string
  error_message?: string
  count: number
  first_seen: string
  last_seen: string
  is_resolved: boolean
}

export interface WebVitalsSummary {
  count: number
  avg_lcp?: number
  avg_fid?: number
  avg_cls?: number
  avg_ttfb?: number
  avg_fcp?: number
  by_device: Record<string, number>
  by_browser: Record<string, number>
  by_country: Record<string, number>
}

export const apmApi = {
  overview: (windowHours = 24) => client.get<APMOverview>('/apm/overview', { params: { window_hours: windowHours } }),
  listTransactions: (params?: { monitor_id?: number; window_hours?: number; limit?: number }) =>
    client.get<APMTransaction[]>('/apm/transactions', { params }),
  listErrors: () => client.get<APMError[]>('/apm/errors'),
  resolveError: (id: number) => client.post(`/apm/errors/${id}/resolve`),
  webVitals: (params?: { monitor_id?: number; window_hours?: number }) =>
    client.get<WebVitalsSummary>('/apm/web-vitals', { params }),
  trends: (windowDays = 7) => client.get('/apm/performance-trends', { params: { window_days: windowDays } }),
}
