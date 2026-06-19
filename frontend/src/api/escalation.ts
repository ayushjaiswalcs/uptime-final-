import client from './client'

export type Severity = 'NORMAL' | 'WARNING' | 'CRITICAL'
export type EscalationStatus = 'active' | 'inactive' | 'draft'
export const CHANNELS = ['web', 'whatsapp', 'sms', 'call', 'email', 'webhook'] as const
export type Channel = typeof CHANNELS[number]

export interface EscalationLevel {
  id: number
  config_id: number
  level_number: number
  escalation_name: string
  timer_minutes: number | null
  notify_target?: string | null
  is_active: boolean
  channels: Record<Channel, boolean>
}

export interface EscalationConfig {
  id: number
  name: string
  status: EscalationStatus
  severity: Severity
  description?: string | null
  monitor_id?: number | null
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at?: string | null
  created_by?: string
  total_levels?: number
  total_notifications?: number
  total_monitors?: number
  levels: EscalationLevel[]
}

export interface EscalationHistoryRow {
  id: number
  incident_id: number
  monitor_id: number
  monitor_name?: string | null
  monitor_type?: string | null
  event_type: string
  severity?: string | null
  level_number?: number | null
  channel?: string | null
  target?: string | null
  status?: string | null
  message?: string | null
  created_at: string
  recovery_time?: string | null
  config_id?: number | null
}

export interface ActiveEscalation {
  incident_id: number
  monitor_id: number
  monitor_name?: string
  severity?: string
  escalation_level: number
  next_escalation_at?: string | null
  outage_start_time: string
  error_message?: string | null
}

export interface EscalationStats {
  total_monitors: number
  active_monitors: number
  down_monitors: number
  open_incidents: number
  critical_incidents: number
  active_escalations: number
  resolved_incidents: number
}

export interface LevelInput {
  level_number: number
  escalation_name: string
  timer_minutes: number | null
  notify_target?: string | null
  is_active?: boolean
  channels?: Partial<Record<Channel, boolean>>
}

export const escalationApi = {
  // Configs
  listConfigs: (params?: { severity?: Severity; status?: EscalationStatus }) =>
    client.get<EscalationConfig[]>('/escalation/configs', { params }),
  getConfig: (id: number) =>
    client.get<EscalationConfig>(`/escalation/configs/${id}`),
  createConfig: (data: Partial<EscalationConfig>) =>
    client.post<EscalationConfig>('/escalation/configs', data),
  updateConfig: (id: number, data: Partial<EscalationConfig>) =>
    client.patch<EscalationConfig>(`/escalation/configs/${id}`, data),
  toggleConfig: (id: number) =>
    client.post(`/escalation/configs/${id}/toggle`),
  cloneConfig: (id: number) =>
    client.post<EscalationConfig>(`/escalation/configs/${id}/clone`),
  deleteConfig: (id: number) =>
    client.delete(`/escalation/configs/${id}`),

  // Levels
  addLevel: (configId: number, data: LevelInput) =>
    client.post<EscalationLevel>(`/escalation/configs/${configId}/levels`, data),
  updateLevel: (levelId: number, data: Partial<LevelInput>) =>
    client.patch<EscalationLevel>(`/escalation/levels/${levelId}`, data),
  deleteLevel: (levelId: number) =>
    client.delete(`/escalation/levels/${levelId}`),
  setChannels: (levelId: number, channels: Partial<Record<Channel, boolean>>) =>
    client.put<EscalationLevel>(`/escalation/levels/${levelId}/channels`, channels),

  // History / logs
  listHistory: (params?: { incident_id?: number; config_id?: number; event_type?: string; limit?: number }) =>
    client.get<EscalationHistoryRow[]>('/escalation/history', { params }),
  notificationLogs: (limit = 200) =>
    client.get<EscalationHistoryRow[]>('/escalation/notifications', { params: { limit } }),
  incidentTimeline: (incidentId: number) =>
    client.get<EscalationHistoryRow[]>(`/escalation/incidents/${incidentId}/timeline`),

  // Monitor attachment
  listConfigMonitors: (configId: number) =>
    client.get<import('./monitors').MonitorBrief[]>(`/escalation/configs/${configId}/monitors`),
  attachMonitor: (configId: number, monitorId: number) =>
    client.post(`/escalation/configs/${configId}/monitors/${monitorId}`),
  detachMonitor: (configId: number, monitorId: number) =>
    client.delete(`/escalation/configs/${configId}/monitors/${monitorId}`),

  // Active + stats
  active: () => client.get<ActiveEscalation[]>('/escalation/active'),
  stats: () => client.get<EscalationStats>('/escalation/stats'),
}
