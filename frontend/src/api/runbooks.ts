import client from './client'

export interface RunbookStep {
  id: number
  runbook_id: number
  step_order: number
  title: string
  description?: string
  command?: string
  expected_output?: string
  step_type: string
}

export interface Runbook {
  id: number
  title: string
  category: string
  content: string
  tags: string[]
  severity_level?: string
  monitor_id?: number
  is_published: boolean
  view_count: number
  created_at: string
  updated_at?: string
  steps: RunbookStep[]
}

export interface RunbookStats {
  total: number
  published: number
  total_views: number
  by_category: Record<string, number>
}

export const runbooksApi = {
  list: (params?: { category?: string; search?: string }) =>
    client.get<Runbook[]>('/runbooks', { params }),
  create: (data: Partial<Runbook>) => client.post<Runbook>('/runbooks', data),
  get: (id: number) => client.get<Runbook>(`/runbooks/${id}`),
  update: (id: number, data: Partial<Runbook>) => client.put<Runbook>(`/runbooks/${id}`, data),
  delete: (id: number) => client.delete(`/runbooks/${id}`),
  stats: () => client.get<RunbookStats>('/runbooks/stats/summary'),
}
