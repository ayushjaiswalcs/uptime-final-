import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, MessageCircle, Hash, Music, Phone, Plus, Trash2 } from 'lucide-react'
import { notificationsApi, type Notification } from '../api/notifications'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'

const CHANNEL_ICONS = {
  email: Mail,
  telegram: MessageCircle,
  slack: Hash,
  discord: Music,
  sms: Phone,
}

const CHANNEL_LABELS = {
  email: 'Email',
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
  sms: 'SMS',
}

const CHANNEL_PLACEHOLDERS = {
  email: 'you@example.com',
  telegram: 'Chat ID (e.g. 123456789)',
  slack: 'Webhook URL',
  discord: 'Webhook URL',
  sms: '+1 9876543210',
}

function NotifCard({ notif }: { notif: Notification }) {
  const qc = useQueryClient()
  const Icon = CHANNEL_ICONS[notif.notification_type as keyof typeof CHANNEL_ICONS] || Mail

  const toggleMutation = useMutation({
    mutationFn: () => notificationsApi.update(notif.id, { enabled: !notif.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => notificationsApi.delete(notif.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="glass-card p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-300" />
        </div>
        <div>
          <p className="font-medium text-white text-sm">{CHANNEL_LABELS[notif.notification_type as keyof typeof CHANNEL_LABELS]}</p>
          <p className="text-xs text-slate-500">{notif.destination}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggleMutation.mutate()}
          className={`relative w-12 h-6 rounded-full transition-colors ${notif.enabled ? 'bg-primary-600' : 'bg-slate-600'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${notif.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
        <button onClick={() => deleteMutation.mutate()} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function Notifications() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ notification_type: 'email', destination: '' })
  const [error, setError] = useState('')

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => notificationsApi.create({ ...form, enabled: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); setAddOpen(false); setForm({ notification_type: 'email', destination: '' }) },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to add notification'),
  })

  const grouped = Object.entries(CHANNEL_LABELS).map(([type, label]) => ({
    type, label,
    items: notifications.filter(n => n.notification_type === type),
  }))

  return (
    <div className="p-6 space-y-6">
      <Header title="Notification Settings" action={{ label: 'Add Channel', onClick: () => setAddOpen(true) }} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grouped.map(({ type, label, items }) => {
          const Icon = CHANNEL_ICONS[type as keyof typeof CHANNEL_ICONS] || Mail
          return (
            <div key={type} className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-5 h-5 text-primary-400" />
                <h3 className="font-semibold text-white">{label}</h3>
                <span className="ml-auto text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-slate-500 py-3 text-center">No {label} channels configured</p>
              ) : (
                <div className="space-y-2">
                  {items.map(n => <NotifCard key={n.id} notif={n} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Notification Channel">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Channel Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CHANNEL_LABELS).map(([type, label]) => {
                const Icon = CHANNEL_ICONS[type as keyof typeof CHANNEL_ICONS]
                return (
                  <button
                    key={type}
                    onClick={() => setForm(f => ({ ...f, notification_type: type }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                      form.notification_type === type ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Destination</label>
            <input
              className="input-field"
              placeholder={CHANNEL_PLACEHOLDERS[form.notification_type as keyof typeof CHANNEL_PLACEHOLDERS]}
              value={form.destination}
              onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-400 bg-red-500/10 px-4 py-2.5 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => createMutation.mutate()} className="btn-primary flex-1">Add Channel</button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary px-6">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
