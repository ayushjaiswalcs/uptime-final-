import client from './client'

export interface CostSummary {
  total_cost: number
  prev_period_cost: number
  change_pct: number
  by_provider: Record<string, number>
  by_service: Record<string, number>
  top_resources: { name: string; cost: number }[]
  window_days: number
}

export interface CostEntry {
  id: number
  provider: string
  service: string
  resource_id?: string
  resource_name?: string
  region?: string
  amount: number
  currency: string
  period_start: string
  period_end: string
}

export interface BudgetAlert {
  id: number
  name: string
  provider?: string
  service?: string
  budget_amount: number
  alert_threshold: number
  period: string
  is_active: boolean
  current_spend: number
  pct_used: number
  status: 'ok' | 'warning' | 'exceeded'
  last_triggered?: string
}

export interface ResourceInventory {
  id: number
  provider: string
  resource_type: string
  resource_id: string
  resource_name?: string
  region?: string
  status: string
  owner?: string
  monthly_cost?: number
  tags: Record<string, string>
  last_seen: string
}

export const costsApi = {
  summary: (windowDays = 30) => client.get<CostSummary>('/costs/summary', { params: { window_days: windowDays } }),
  entries: (params?: { provider?: string; window_days?: number }) => client.get<CostEntry[]>('/costs/entries', { params }),
  createEntry: (data: Partial<CostEntry>) => client.post('/costs/entries', data),
  trends: (windowDays = 90) => client.get('/costs/trends', { params: { window_days: windowDays } }),
  budgetAlerts: () => client.get<BudgetAlert[]>('/costs/budget-alerts'),
  createBudgetAlert: (data: Partial<BudgetAlert>) => client.post('/costs/budget-alerts', data),
  deleteBudgetAlert: (id: number) => client.delete(`/costs/budget-alerts/${id}`),
  inventory: (params?: { provider?: string; resource_type?: string }) => client.get<ResourceInventory[]>('/costs/inventory', { params }),
  addResource: (data: Partial<ResourceInventory>) => client.post('/costs/inventory', data),
  deleteResource: (id: number) => client.delete(`/costs/inventory/${id}`),
}
