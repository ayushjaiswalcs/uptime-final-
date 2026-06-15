import client from './client'

export interface Notification {
  id: number
  user_id: number
  notification_type: string
  destination: string
  enabled: boolean
  created_at: string
}

export const notificationsApi = {
  list: () => client.get<Notification[]>('/notifications'),
  create: (data: { notification_type: string; destination: string; enabled: boolean }) =>
    client.post<Notification>('/notifications', data),
  update: (id: number, data: { destination?: string; enabled?: boolean }) =>
    client.put<Notification>(`/notifications/${id}`, data),
  delete: (id: number) => client.delete(`/notifications/${id}`),
}
