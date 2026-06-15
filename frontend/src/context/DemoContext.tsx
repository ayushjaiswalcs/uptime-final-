import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import client from '../api/client'
import type { User } from '../api/auth'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlertEvent {
  id: number
  message: string
  type: 'down' | 'up' | 'warning'
  timestamp: string
}

export interface DemoMonitor {
  id: number
  user_id: number
  monitor_name: string
  target_url: string
  monitor_type: string
  interval: number
  timeout: number
  http_method: string
  expected_status_code: number
  current_status: 'up' | 'down' | 'paused'
  is_paused: boolean
  uptime_percentage: string
  response_time: number | null
  last_checked_at: string
  created_at: string
  keyword?: string
  dns_record_type?: string
  alert_threshold?: number
}

interface MockStats {
  total_monitors: number
  up_monitors: number
  down_monitors: number
  paused_monitors: number
  avg_response_time: number
  overall_uptime: string
}

interface MockIncident {
  id: number
  monitor_id: number
  monitor_name: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  error_message: string
  status: string
}

interface ChartPoint {
  date: string
  uptime?: number
  response_time?: number
}

interface MockState {
  monitors: DemoMonitor[]
  stats: MockStats
  uptimeChart: ChartPoint[]
  rtChart: ChartPoint[]
  incidents: MockIncident[]
}

interface DemoContextType {
  isDemoMode: boolean
  alertEvents: AlertEvent[]
  startDemo: () => void
  stopDemo: () => void
  tick: () => void
  getStats: () => MockStats
  getMonitors: () => DemoMonitor[]
  dismissAlert: (id: number) => void
}

// ── Demo user ─────────────────────────────────────────────────────────────────

export const DEMO_USER: User = {
  id: 999,
  name: 'Demo User',
  email: 'demo@uptime.io',
  role: 'user',
  subscription_plan: 'pro',
  is_verified: true,
  totp_enabled: false,
  created_at: '2024-01-01T00:00:00Z',
}

// ── Initial mock data builders ────────────────────────────────────────────────

function buildMonitors(): DemoMonitor[] {
  const now = new Date()
  const ts = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString()

  const named: DemoMonitor[] = [
    { id: 1,  user_id: 1, monitor_name: 'Google APIs',              target_url: 'https://apis.google.com',            monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 32,  last_checked_at: ts(15000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 2,  user_id: 1, monitor_name: 'Stripe Payments API',       target_url: 'https://api.stripe.com',             monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.99',  response_time: 85,  last_checked_at: ts(22000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 3,  user_id: 1, monitor_name: 'Company Website',           target_url: 'https://acme.corp',                  monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'down', is_paused: false, uptime_percentage: '99.85',  response_time: null, last_checked_at: ts(12 * 60000),  created_at: '2024-01-01T00:00:00Z' },
    { id: 4,  user_id: 1, monitor_name: 'Database Server',           target_url: 'db-prod.internal:5432',              monitor_type: 'tcp',  interval: 30,   timeout: 5,  http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.97',  response_time: 8,   last_checked_at: ts(8000),         created_at: '2024-01-01T00:00:00Z' },
    { id: 5,  user_id: 1, monitor_name: 'Auth Service',              target_url: 'https://auth.acme.corp',             monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.99',  response_time: 45,  last_checked_at: ts(18000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 6,  user_id: 1, monitor_name: 'CDN Edge US-West',          target_url: 'https://cdn-usw.acme.corp',          monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 12,  last_checked_at: ts(5000),         created_at: '2024-01-01T00:00:00Z' },
    { id: 7,  user_id: 1, monitor_name: 'Email Service (SendGrid)',   target_url: 'https://api.sendgrid.com',           monitor_type: 'http', interval: 300,  timeout: 15, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.95',  response_time: 112, last_checked_at: ts(45000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 8,  user_id: 1, monitor_name: 'Redis Cache',               target_url: 'redis.internal:6379',                monitor_type: 'tcp',  interval: 30,   timeout: 5,  http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 2,   last_checked_at: ts(3000),         created_at: '2024-01-01T00:00:00Z' },
    { id: 9,  user_id: 1, monitor_name: 'Payment Webhook',           target_url: 'https://webhooks.acme.corp/stripe',  monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.99',  response_time: 67,  last_checked_at: ts(25000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 10, user_id: 1, monitor_name: 'Search API (Elastic)',       target_url: 'https://search.acme.corp',           monitor_type: 'http', interval: 60,   timeout: 15, http_method: 'GET',  expected_status_code: 200, current_status: 'down', is_paused: false, uptime_percentage: '99.70',  response_time: null, last_checked_at: ts(45 * 60000),  created_at: '2024-01-01T00:00:00Z' },
    { id: 11, user_id: 1, monitor_name: 'S3 Storage Bucket',         target_url: 'https://s3.amazonaws.com',           monitor_type: 'http', interval: 300,  timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 55,  last_checked_at: ts(120000),       created_at: '2024-01-01T00:00:00Z' },
    { id: 12, user_id: 1, monitor_name: 'GraphQL API Gateway',       target_url: 'https://graphql.acme.corp',          monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'POST', expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.98',  response_time: 78,  last_checked_at: ts(35000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 13, user_id: 1, monitor_name: 'SSL — acme.corp',           target_url: 'acme.corp',                          monitor_type: 'ssl',  interval: 3600, timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 95,  last_checked_at: ts(3600000),      created_at: '2024-01-01T00:00:00Z' },
    { id: 14, user_id: 1, monitor_name: 'DNS — acme.corp (A)',       target_url: 'acme.corp',                          monitor_type: 'dns',  interval: 300,  timeout: 5,  http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 5,   last_checked_at: ts(180000),       created_at: '2024-01-01T00:00:00Z', dns_record_type: 'A' },
    { id: 15, user_id: 1, monitor_name: 'Mobile App Backend',        target_url: 'https://mobile-api.acme.corp',       monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'down', is_paused: false, uptime_percentage: '99.50',  response_time: null, last_checked_at: ts(135 * 60000), created_at: '2024-01-01T00:00:00Z' },
    { id: 16, user_id: 1, monitor_name: 'Admin Dashboard',           target_url: 'https://admin.acme.corp',            monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.99',  response_time: 123, last_checked_at: ts(42000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 17, user_id: 1, monitor_name: 'Background Job Worker',     target_url: 'https://jobs.acme.corp/health',      monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.90',  response_time: 34,  last_checked_at: ts(28000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 18, user_id: 1, monitor_name: 'Analytics Service',         target_url: 'https://analytics.acme.corp',        monitor_type: 'http', interval: 300,  timeout: 15, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.95',  response_time: 156, last_checked_at: ts(200000),       created_at: '2024-01-01T00:00:00Z' },
    { id: 19, user_id: 1, monitor_name: 'Notification Hub',          target_url: 'https://notify.acme.corp',           monitor_type: 'http', interval: 60,   timeout: 10, http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '99.99',  response_time: 43,  last_checked_at: ts(20000),        created_at: '2024-01-01T00:00:00Z' },
    { id: 20, user_id: 1, monitor_name: 'Kubernetes Health Check',   target_url: 'https://k8s.internal/healthz',       monitor_type: 'http', interval: 30,   timeout: 5,  http_method: 'GET',  expected_status_code: 200, current_status: 'up',   is_paused: false, uptime_percentage: '100.00', response_time: 6,   last_checked_at: ts(5000),         created_at: '2024-01-01T00:00:00Z' },
  ]

  const serviceNames = ['REST API', 'gRPC Service', 'WebSocket', 'Message Queue', 'Cache', 'Auth Proxy', 'CDN Node', 'Worker', 'File Store', 'DB Replica', 'Load Balancer', 'API Gateway', 'Task Runner', 'Log Shipper', 'Config Service']
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'sa-east-1', 'ca-central-1', 'eu-central-1', 'ap-northeast-1']
  const monTypes = ['http', 'http', 'http', 'http', 'tcp', 'ssl']

  const auto: DemoMonitor[] = Array.from({ length: 130 }, (_, i) => {
    const id = i + 21
    const svc = serviceNames[(id * 7 + 3) % serviceNames.length]
    const reg = regions[(id * 3 + 1) % regions.length]
    const mtype = monTypes[(id * 11) % monTypes.length]
    const rt = 15 + (id * 13 + 7) % 285
    return {
      id, user_id: 1,
      monitor_name: `${reg} ${svc}`,
      target_url: mtype === 'tcp' ? `${reg}.internal:${5000 + (id % 500)}` : `https://${reg}.svc.io/${svc.toLowerCase().replace(/ /g, '-')}`,
      monitor_type: mtype,
      interval: [30, 60, 60, 120, 300][(id * 7) % 5],
      timeout: 10, http_method: 'GET', expected_status_code: 200,
      current_status: 'up', is_paused: false,
      uptime_percentage: (99.70 + ((id * 17) % 30) * 0.01).toFixed(2),
      response_time: rt,
      last_checked_at: ts(((id * 7) % 120) * 1000),
      created_at: new Date(2024, 0, 1 + (id % 180)).toISOString(),
    }
  })

  return [...named, ...auto]
}

function buildUptimeChart(): ChartPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return { date: d.toISOString().slice(0, 10), uptime: parseFloat((99.93 + (i * 0.01)).toFixed(2)) }
  })
}

function buildRtChart(): ChartPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return { date: d.toISOString().slice(0, 10), response_time: 130 + i * 3 }
  })
}

function buildIncidents(): MockIncident[] {
  const now = new Date()
  const ts = (ms: number) => new Date(now.getTime() - ms).toISOString()
  return [
    { id: 1,  monitor_id: 3,  monitor_name: 'Company Website',       started_at: ts(12 * 60000),       ended_at: null,               duration_seconds: null,  error_message: 'Connection timeout after 10s',          status: 'ongoing' },
    { id: 2,  monitor_id: 10, monitor_name: 'Search API (Elastic)',   started_at: ts(45 * 60000),       ended_at: null,               duration_seconds: null,  error_message: 'HTTP 503 Service Unavailable',           status: 'ongoing' },
    { id: 3,  monitor_id: 15, monitor_name: 'Mobile App Backend',     started_at: ts(135 * 60000),      ended_at: null,               duration_seconds: null,  error_message: 'Connection refused',                    status: 'ongoing' },
    { id: 4,  monitor_id: 5,  monitor_name: 'Auth Service',           started_at: ts(24 * 3600000),     ended_at: ts(23.8 * 3600000), duration_seconds: 720,   error_message: 'HTTP 500 Internal Server Error',         status: 'resolved' },
    { id: 5,  monitor_id: 4,  monitor_name: 'Database Server',        started_at: ts(48 * 3600000),     ended_at: ts(47.9 * 3600000), duration_seconds: 360,   error_message: 'Response time exceeded threshold',       status: 'resolved' },
    { id: 6,  monitor_id: 7,  monitor_name: 'Email Service (SendGrid)',started_at: ts(72 * 3600000),    ended_at: ts(71.7 * 3600000), duration_seconds: 1080,  error_message: 'HTTP 429 Too Many Requests',             status: 'resolved' },
  ]
}

function buildInitialState(): MockState {
  return {
    monitors: buildMonitors(),
    stats: { total_monitors: 150, up_monitors: 147, down_monitors: 3, paused_monitors: 0, avg_response_time: 145, overall_uptime: '99.98' },
    uptimeChart: buildUptimeChart(),
    rtChart: buildRtChart(),
    incidents: buildIncidents(),
  }
}

// Base response times per monitor id (for realistic bounded random walk)
const BASE_RT: Record<number, number> = { 1: 32, 2: 85, 4: 8, 5: 45, 6: 12, 7: 112, 8: 2, 9: 67, 11: 55, 12: 78, 13: 95, 14: 5, 16: 123, 17: 34, 18: 156, 19: 43, 20: 6 }
for (let i = 21; i <= 150; i++) BASE_RT[i] = 15 + (i * 13 + 7) % 285

// Alert notifications scripted to fire at set intervals after startDemo()
const ALERT_SCRIPT: Array<{ delay: number; message: string; type: 'down' | 'up' | 'warning' }> = [
  { delay: 4000,   message: 'Company Website is DOWN — Connection timeout (13 min)',      type: 'down' },
  { delay: 12000,  message: 'Search API — Response time 2,847ms (threshold: 500ms)',      type: 'warning' },
  { delay: 24000,  message: 'Mobile App Backend — Connection refused (2h 15m)',           type: 'down' },
  { delay: 38000,  message: 'Google APIs — Response time spike: 32ms → 287ms',            type: 'warning' },
  { delay: 56000,  message: 'Company Website — Recovery attempt failed',                  type: 'down' },
  { delay: 72000,  message: 'Search API (Elastic) recovered',                             type: 'up' },
  { delay: 90000,  message: 'Mobile App Backend recovered',                               type: 'up' },
  { delay: 112000, message: 'Redis Cache — Latency spike: 2ms → 47ms',                   type: 'warning' },
  { delay: 130000, message: 'Company Website recovered',                                  type: 'up' },
  { delay: 150000, message: 'Company Website is DOWN again — DNS resolution failed',      type: 'down' },
]

// ── Mock response dispatcher ──────────────────────────────────────────────────

function generateLogs(monitorId: number, state: MockState): object[] {
  const monitor = state.monitors.find(m => m.id === monitorId)
  const now = Date.now()
  return Array.from({ length: 20 }, (_, i) => ({
    id: monitorId * 1000 + i,
    monitor_id: monitorId,
    response_time: monitor?.response_time != null ? monitor.response_time + Math.floor(Math.random() * 20 - 10) : null,
    http_status: (monitor?.current_status === 'down' && i < 3) ? 503 : 200,
    is_up: !(monitor?.current_status === 'down' && i < 3),
    error_message: (monitor?.current_status === 'down' && i < 3) ? 'Connection timeout' : null,
    checked_at: new Date(now - i * 60000).toISOString(),
  }))
}

function getMockResponse(path: string, method: string, state: MockState): unknown {
  if (method === 'get') {
    if (path === '/auth/me') return DEMO_USER
    if (path === '/dashboard/stats') return state.stats
    if (path.startsWith('/dashboard/uptime-chart')) return state.uptimeChart
    if (path.startsWith('/dashboard/response-time-chart')) return state.rtChart
    if (path === '/dashboard/recent-incidents') return state.incidents.slice(0, 5)

    const logsMatch = path.match(/^\/monitors\/(\d+)\/logs/)
    if (logsMatch) return generateLogs(parseInt(logsMatch[1]), state)

    const monitorMatch = path.match(/^\/monitors\/(\d+)$/)
    if (monitorMatch) return state.monitors.find(m => m.id === parseInt(monitorMatch[1])) ?? null

    if (path.startsWith('/monitors')) return state.monitors
    if (path.startsWith('/incidents')) return state.incidents
    if (path.startsWith('/notifications')) return []
    if (path.startsWith('/status-pages')) return []
    if (path.startsWith('/organizations')) return []
    if (path.startsWith('/api-keys')) return []
    if (path.startsWith('/webhooks')) return []
    if (path.startsWith('/maintenance')) return []
    if (path.startsWith('/audit')) return []
    if (path.startsWith('/admin')) return { total_users: 1, total_monitors: 150 }
    return null
  }
  return { detail: 'Demo mode: changes are not permanently saved.', demo: true }
}

// ── Context ───────────────────────────────────────────────────────────────────

const DemoContext = createContext<DemoContextType>({} as DemoContextType)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([])
  const mockStateRef = useRef<MockState>(buildInitialState())
  const interceptorRef = useRef<number | null>(null)
  const alertTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const alertCounterRef = useRef(0)

  const tick = useCallback(() => {
    const state = mockStateRef.current
    const monitors = state.monitors.map(m => {
      if (m.current_status !== 'up' || m.response_time == null) return m
      const base = BASE_RT[m.id] ?? 50
      const delta = Math.floor(Math.random() * 30) - 15
      const next = Math.round(Math.max(base * 0.5, Math.min(base * 2.5, m.response_time + delta)))
      return { ...m, response_time: next, last_checked_at: new Date().toISOString() }
    })

    const upMs = monitors.filter(m => m.current_status === 'up' && m.response_time != null)
    const avgRt = upMs.length > 0
      ? Math.round(upMs.reduce((s, m) => s + (m.response_time ?? 0), 0) / upMs.length)
      : state.stats.avg_response_time

    const now = new Date()
    const rtChart = [
      ...state.rtChart.slice(-29),
      { date: now.toISOString().slice(0, 16), response_time: avgRt },
    ]

    mockStateRef.current = { ...state, monitors, stats: { ...state.stats, avg_response_time: avgRt }, rtChart }
  }, [])

  const startDemo = useCallback(() => {
    mockStateRef.current = buildInitialState()
    alertCounterRef.current = 0
    setAlertEvents([])
    setIsDemoMode(true)

    const intId = client.interceptors.request.use((config) => {
      const snap = mockStateRef.current
      config.adapter = async (adapterConfig) => {
        const raw = adapterConfig.url ?? ''
        const path = raw.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '').split('?')[0]
        const method = (adapterConfig.method ?? 'get').toLowerCase()
        return Promise.resolve({
          data: getMockResponse(path, method, snap),
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config: adapterConfig,
          request: {},
        }) as any
      }
      return config
    })
    interceptorRef.current = intId

    const timers = ALERT_SCRIPT.map(({ delay, message, type }) =>
      setTimeout(() => {
        const eid = ++alertCounterRef.current
        setAlertEvents(prev => [{ id: eid, message, type, timestamp: new Date().toLocaleTimeString() }, ...prev.slice(0, 3)])
        setTimeout(() => setAlertEvents(prev => prev.filter(e => e.id !== eid)), 8000)
      }, delay)
    )
    alertTimersRef.current = timers
  }, [])

  const stopDemo = useCallback(() => {
    setIsDemoMode(false)
    setAlertEvents([])
    if (interceptorRef.current !== null) {
      client.interceptors.request.eject(interceptorRef.current)
      interceptorRef.current = null
    }
    alertTimersRef.current.forEach(clearTimeout)
    alertTimersRef.current = []
  }, [])

  const dismissAlert = useCallback((id: number) => {
    setAlertEvents(prev => prev.filter(e => e.id !== id))
  }, [])

  const getStats = useCallback(() => mockStateRef.current.stats, [])
  const getMonitors = useCallback(() => mockStateRef.current.monitors, [])

  return (
    <DemoContext.Provider value={{ isDemoMode, alertEvents, startDemo, stopDemo, tick, getStats, getMonitors, dismissAlert }}>
      {children}
    </DemoContext.Provider>
  )
}

export const useDemo = () => useContext(DemoContext)
