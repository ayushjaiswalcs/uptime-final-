import client from './client'

export interface OnCallSchedule {
  id: number
  name: string
  description?: string
  timezone: string
  rotation_type: string
  is_active: boolean
  created_at: string
}

export interface OnCallRotation {
  id: number
  schedule_id: number
  user_id: number
  order_index: number
  user_name?: string
  user_email?: string
}

export interface OnCallOverride {
  id: number
  schedule_id: number
  user_id: number
  start_time: string
  end_time: string
  reason?: string
  user_name?: string
}

export interface EscalationPolicy {
  id: number
  name: string
  description?: string
  repeat_count: number
  is_active: boolean
  created_at: string
}

export interface EscalationStep {
  id: number
  policy_id: number
  step_order: number
  delay_minutes: number
  notify_type: string
  notify_target_id?: number
  notify_via: string[]
}

export const oncallApi = {
  listSchedules: () => client.get<OnCallSchedule[]>('/oncall/schedules'),
  createSchedule: (data: Partial<OnCallSchedule>) => client.post<OnCallSchedule>('/oncall/schedules', data),
  deleteSchedule: (id: number) => client.delete(`/oncall/schedules/${id}`),

  listRotations: (scheduleId: number) => client.get<OnCallRotation[]>(`/oncall/schedules/${scheduleId}/rotations`),
  addRotation: (scheduleId: number, data: Partial<OnCallRotation>) => client.post(`/oncall/schedules/${scheduleId}/rotations`, data),
  deleteRotation: (rotationId: number) => client.delete(`/oncall/rotations/${rotationId}`),

  listOverrides: (scheduleId: number) => client.get<OnCallOverride[]>(`/oncall/schedules/${scheduleId}/overrides`),
  addOverride: (scheduleId: number, data: Partial<OnCallOverride>) => client.post(`/oncall/schedules/${scheduleId}/overrides`, data),

  listEscalations: () => client.get<EscalationPolicy[]>('/oncall/escalations'),
  createEscalation: (data: Partial<EscalationPolicy>) => client.post<EscalationPolicy>('/oncall/escalations', data),
  deleteEscalation: (id: number) => client.delete(`/oncall/escalations/${id}`),

  listSteps: (policyId: number) => client.get<EscalationStep[]>(`/oncall/escalations/${policyId}/steps`),
  addStep: (policyId: number, data: Partial<EscalationStep>) => client.post(`/oncall/escalations/${policyId}/steps`, data),
}
