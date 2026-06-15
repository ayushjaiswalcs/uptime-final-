import client from './client'

export interface ApiKeyCreate { name: string; permissions?: string[]; expires_days?: number }
export interface ApiKeyOut {
  id: number; user_id: number; name: string; key_prefix: string
  permissions?: string; last_used_at?: string; expires_at?: string
  is_active: boolean; created_at: string
}
export interface ApiKeyCreated extends ApiKeyOut { raw_key: string }

export const apiKeysApi = {
  list: () => client.get<ApiKeyOut[]>('/api-keys'),
  create: (data: ApiKeyCreate) => client.post<ApiKeyCreated>('/api-keys', data),
  revoke: (id: number) => client.delete(`/api-keys/${id}`),
  toggle: (id: number) => client.patch(`/api-keys/${id}/toggle`),
}
