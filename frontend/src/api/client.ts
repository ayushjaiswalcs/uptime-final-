import axios from 'axios'
import { tokens } from './tokens'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = tokens.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Don't try to refresh on the auth endpoints themselves (a failed login must
// surface its own error, not trigger a redirect loop).
const isAuthEndpoint = (url?: string) => !!url && /\/auth\/(login|register|forgot-password|reset-password|refresh)/.test(url)

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original?._retried && !isAuthEndpoint(original?.url)) {
      const refresh = tokens.refresh
      if (refresh) {
        try {
          original._retried = true
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, null, { params: { token: refresh } })
          tokens.setAccess(data.access_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return client(original)
        } catch {
          tokens.clear()
          window.location.href = '/login'
        }
      } else {
        tokens.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
