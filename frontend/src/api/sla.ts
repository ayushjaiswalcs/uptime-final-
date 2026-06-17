import client from './client'

export interface SLAPolicy {
  id: number
  name: string
  description?: string
  availability_target: number
  response_time_target: number
  error_rate_target: number
  window_days: number
  created_at: string
}

export interface SLODefinition {
  id: number
  name: string
  monitor_id?: number
  metric_type: string
  target_value: number
  window_days: number
  error_budget_minutes?: number
  is_active: boolean
  created_at: string
}

export interface SLAComplianceReport {
  monitors: {
    monitor_id: number
    monitor_name: string
    url: string
    availability_30d: number
    availability_7d: number
    avg_latency_ms: number
    meets_99_9: boolean
    meets_99_5: boolean
    meets_99_0: boolean
    downtime_minutes_30d: number
  }[]
  summary: {
    total_monitors: number
    compliant_99_9: number
    compliance_rate: number
    avg_availability: number
  }
}

export interface ErrorBudget {
  slo_id: number
  slo_name: string
  monitor_id: number
  target: number
  current: number
  budget_minutes_total: number
  budget_minutes_remaining: number
  budget_consumed_pct: number
  status: 'ok' | 'warning' | 'exhausted'
}

export const slaApi = {
  listPolicies: () => client.get<SLAPolicy[]>('/sla/policies'),
  createPolicy: (data: Partial<SLAPolicy>) => client.post<SLAPolicy>('/sla/policies', data),
  deletePolicy: (id: number) => client.delete(`/sla/policies/${id}`),

  listSLOs: () => client.get<SLODefinition[]>('/sla/slos'),
  createSLO: (data: Partial<SLODefinition>) => client.post<SLODefinition>('/sla/slos', data),
  deleteSLO: (id: number) => client.delete(`/sla/slos/${id}`),

  complianceReport: () => client.get<SLAComplianceReport>('/sla/compliance-report'),
  errorBudgets: () => client.get<ErrorBudget[]>('/sla/error-budgets'),
}
