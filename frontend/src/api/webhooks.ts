import client from './client'

export interface WebhookCreate { name: string; url: string; secret?: string; events?: string[] }
export interface WebhookOut {
  id: number; user_id: number; name: string; url: string
  events?: string; is_active: boolean; last_triggered_at?: string; created_at: string
}
export interface DeliveryOut {
  id: number; endpoint_id: number; event: string
  response_status?: number; success: boolean; delivered_at: string
}

export const WEBHOOK_EVENTS = [
  'monitor.down', 'monitor.up', 'incident.created', 'incident.resolved',
  'monitor.created', 'monitor.deleted',
]

export const webhooksApi = {
  list: () => client.get<WebhookOut[]>('/webhooks'),
  create: (data: WebhookCreate) => client.post<WebhookOut>('/webhooks', data),
  get: (id: number) => client.get<WebhookOut>(`/webhooks/${id}`),
  update: (id: number, data: Partial<WebhookCreate> & { is_active?: boolean }) => client.put<WebhookOut>(`/webhooks/${id}`, data),
  delete: (id: number) => client.delete(`/webhooks/${id}`),
  deliveries: (id: number) => client.get<DeliveryOut[]>(`/webhooks/${id}/deliveries`),
}
