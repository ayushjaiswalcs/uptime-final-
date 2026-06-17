import client from './client'
import type { Incident } from './incidents'

export interface DashboardStats {
  total_monitors: number
  up_monitors: number
  down_monitors: number
  paused_monitors: number
  warning_monitors: number
  avg_response_time: number
  overall_uptime: string
  total_incidents: number
  incidents_today: number
}

export interface ChartPoint {
  date: string
  uptime?: number
  response_time?: number
}

export const dashboardApi = {
  getStats: () => client.get<DashboardStats>('/dashboard/stats'),
  getUptimeChart: (days = 7) => client.get<ChartPoint[]>('/dashboard/uptime-chart', { params: { days } }),
  getResponseTimeChart: (days = 7) => client.get<ChartPoint[]>('/dashboard/response-time-chart', { params: { days } }),
  getRecentIncidents: () => client.get<Incident[]>('/dashboard/recent-incidents'),
}
