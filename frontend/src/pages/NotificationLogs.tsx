import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, MessageCircle, Smartphone, PhoneCall, Mail, Webhook, Bell } from 'lucide-react'
import { escalationApi, type EscalationHistoryRow, type Channel } from '../api/escalation'
import Header from '../components/layout/Header'
import clsx from 'clsx'

const CHANNEL_META: Record<string, { label: string; icon: any; cls: string }> = {
  web:      { label: 'Web / In-App', icon: Globe,         cls: 'text-blue-400 bg-blue-500/10' },
  whatsapp: { label: 'WhatsApp',     icon: MessageCircle, cls: 'text-green-400 bg-green-500/10' },
  sms:      { label: 'SMS',          icon: Smartphone,    cls: 'text-cyan-400 bg-cyan-500/10' },
  call:     { label: 'Voice Call',   icon: PhoneCall,     cls: 'text-purple-400 bg-purple-500/10' },
  email:    { label: 'Email',        icon: Mail,          cls: 'text-amber-400 bg-amber-500/10' },
  webhook:  { label: 'Webhook',      icon: Webhook,       cls: 'text-pink-400 bg-pink-500/10' },
}

const STATUS_CLS: Record<string, string> = {
  sent: 'bg-green-500/10 text-green-400',
  failed: 'bg-red-500/10 text-red-400',
  skipped: 'bg-slate-500/10 text-slate-400',
  acknowledged: 'bg-primary-500/10 text-primary-400',
}

function fmt(ts: string) { return new Date(ts).toLocaleString() }

export default function NotificationLogs() {
  const [channelFilter, setChannelFilter] = useState<Channel | 'ALL'>('ALL')
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['notification-logs'],
    queryFn: () => escalationApi.notificationLogs(300).then(r => r.data),
    refetchInterval: 10000,
  })

  const shown = channelFilter === 'ALL' ? logs : logs.filter(l => l.channel === channelFilter)
  const counts = logs.reduce((acc, l) => {
    if (l.channel) acc[l.channel] = (acc[l.channel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-6 space-y-6">
      <Header title="Notification Logs" />

      {/* Channel summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.keys(CHANNEL_META) as Channel[]).map(ch => {
          const Icon = CHANNEL_META[ch].icon
          return (
            <button key={ch} onClick={() => setChannelFilter(c => c === ch ? 'ALL' : ch)}
              className={clsx('glass-card p-3 flex items-center gap-3 transition-all',
                channelFilter === ch && 'ring-1 ring-primary-500/50')}>
              <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', CHANNEL_META[ch].cls)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold app-title leading-none">{counts[ch] ?? 0}</p>
                <p className="text-xs text-muted">{CHANNEL_META[ch].label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {channelFilter !== 'ALL' && (
        <button onClick={() => setChannelFilter('ALL')} className="text-xs text-primary-400 hover:underline">
          ← Show all channels
        </button>
      )}

      {/* Log table */}
      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-muted">No notifications sent yet</p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-subtle uppercase tracking-wider border-b border-[var(--border)]">
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row: EscalationHistoryRow) => {
                const cm = row.channel ? CHANNEL_META[row.channel] : null
                const Icon = cm?.icon ?? Bell
                return (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', cm?.cls ?? 'bg-slate-500/10 text-slate-400')}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="app-title">{cm?.label ?? row.channel}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{row.severity ?? '—'}</td>
                    <td className="px-4 py-3">{row.level_number != null ? `L${row.level_number}` : '—'}</td>
                    <td className="px-4 py-3 text-muted truncate max-w-[160px]">{row.target ?? '—'}</td>
                    <td className="px-4 py-3 text-muted truncate max-w-[280px]">{row.message ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full', STATUS_CLS[row.status ?? ''] ?? 'bg-slate-500/10 text-slate-400')}>
                        {row.status ?? 'info'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-subtle text-xs whitespace-nowrap">{fmt(row.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
