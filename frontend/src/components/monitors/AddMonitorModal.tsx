import { useState, useEffect } from 'react'
import { Globe, Wifi, Radio, Shield, Search, Server } from 'lucide-react'
import Modal from '../ui/Modal'
import { monitorsApi, type MonitorCreate, type Monitor } from '../../api/monitors'
import { useQueryClient } from '@tanstack/react-query'

const MONITOR_TYPES = [
  { id: 'http',    label: 'HTTP(s)',  icon: Globe,   desc: 'Websites & REST APIs' },
  { id: 'keyword', label: 'Keyword', icon: Search,  desc: 'Check for text in page' },
  { id: 'tcp',     label: 'TCP Port',icon: Wifi,    desc: 'TCP port connectivity' },
  { id: 'ping',    label: 'Ping',    icon: Radio,   desc: 'Host reachability' },
  { id: 'ssl',     label: 'SSL Cert',icon: Shield,  desc: 'Certificate health' },
  { id: 'dns',     label: 'DNS',     icon: Server,  desc: 'DNS resolution' },
]

const INTERVALS = [
  { value: 30,   label: '30 Seconds' },
  { value: 60,   label: '1 Minute'   },
  { value: 300,  label: '5 Minutes'  },
  { value: 600,  label: '10 Minutes' },
  { value: 1800, label: '30 Minutes' },
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']
const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT']

const EMPTY_FORM: MonitorCreate = {
  monitor_name: '',
  target_url: '',
  monitor_type: 'http',
  interval: 300,
  timeout: 10,
  http_method: 'GET',
  expected_status_code: 200,
  alert_threshold: 1,
  keyword: '',
  dns_record_type: 'A',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** When provided the modal switches to edit mode and pre-fills with this monitor. */
  editMonitor?: Monitor | null
}

export default function AddMonitorModal({ isOpen, onClose, editMonitor }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editMonitor
  const [form, setForm] = useState<MonitorCreate>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sync form whenever the modal opens or the monitor being edited changes.
  useEffect(() => {
    if (!isOpen) return
    setError('')
    if (editMonitor) {
      setForm({
        monitor_name: editMonitor.monitor_name,
        target_url: editMonitor.target_url,
        monitor_type: editMonitor.monitor_type,
        interval: editMonitor.interval,
        timeout: editMonitor.timeout,
        http_method: editMonitor.http_method,
        expected_status_code: editMonitor.expected_status_code,
        alert_threshold: editMonitor.alert_threshold ?? 1,
        keyword: editMonitor.keyword ?? '',
        dns_record_type: editMonitor.dns_record_type ?? 'A',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [isOpen, editMonitor])

  const validate = (): string | null => {
    if (!form.monitor_name.trim()) return 'Monitor name is required'
    if (!form.target_url.trim()) return 'Target URL / address is required'
    if ((form.monitor_type === 'http' || form.monitor_type === 'keyword') &&
        !/^https?:\/\//i.test(form.target_url.trim())) {
      return 'HTTP monitors require a URL starting with http:// or https://'
    }
    if (form.monitor_type === 'keyword' && !form.keyword?.trim()) {
      return 'Enter the keyword to check for'
    }
    if (form.expected_status_code < 100 || form.expected_status_code > 599) {
      return 'Expected status code must be between 100 and 599'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError('')
    setLoading(true)
    try {
      if (editMonitor) {
        // monitor_type is immutable on the backend update schema, so we omit it.
        const { monitor_type, ...updatable } = form
        void monitor_type
        await monitorsApi.update(editMonitor.id, updatable)
      } else {
        await monitorsApi.create(form)
      }
      qc.invalidateQueries({ queryKey: ['monitors'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
      setForm(EMPTY_FORM)
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${isEdit ? 'update' : 'create'} monitor`)
    } finally {
      setLoading(false)
    }
  }

  const isHttp = form.monitor_type === 'http' || form.monitor_type === 'keyword'
  const isDns  = form.monitor_type === 'dns'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Monitor' : 'Add New Monitor'} size="lg">
      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Monitor Type</p>
        <div className="grid grid-cols-3 gap-2">
          {MONITOR_TYPES.map((t) => {
            const selected = form.monitor_type === t.id
            return (
              <button
                key={t.id}
                type="button"
                // Type can't be changed after creation (changes check semantics).
                disabled={isEdit && !selected}
                onClick={() => !isEdit && setForm(f => ({ ...f, monitor_type: t.id }))}
                title={isEdit ? 'Monitor type cannot be changed after creation' : undefined}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-medium ${
                  selected
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-slate-600 hover:border-slate-500 text-slate-400'
                } ${isEdit && !selected ? 'opacity-40 cursor-not-allowed hover:border-slate-600' : ''}`}
              >
                <t.icon className="w-5 h-5" />
                <span>{t.label}</span>
                <span className="text-slate-500 text-[10px] font-normal leading-tight text-center">{t.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Monitor Name</label>
            <input
              className="input-field"
              placeholder="e.g. My Website"
              value={form.monitor_name}
              onChange={e => setForm(f => ({ ...f, monitor_name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              {isDns ? 'Domain / Hostname' : 'URL / Address'}
            </label>
            <input
              className="input-field"
              placeholder={isDns ? 'example.com' : form.monitor_type === 'tcp' ? 'host:port' : 'https://example.com'}
              value={form.target_url}
              onChange={e => setForm(f => ({ ...f, target_url: e.target.value }))}
              required
            />
          </div>
        </div>

        {isHttp && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">HTTP Method</label>
              <select className="input-field" value={form.http_method} onChange={e => setForm(f => ({ ...f, http_method: e.target.value }))}>
                {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Expected Status</label>
              <input type="number" className="input-field" value={form.expected_status_code} onChange={e => setForm(f => ({ ...f, expected_status_code: Number(e.target.value) }))} />
            </div>
          </div>
        )}

        {form.monitor_type === 'keyword' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Keyword to Check</label>
            <input
              className="input-field"
              placeholder="e.g. Welcome to our site"
              value={form.keyword || ''}
              onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">Alert if this text is NOT found in the page response</p>
          </div>
        )}

        {isDns && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">DNS Record Type</label>
            <select className="input-field" value={form.dns_record_type || 'A'} onChange={e => setForm(f => ({ ...f, dns_record_type: e.target.value }))}>
              {DNS_RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Check Interval</label>
            <select className="input-field" value={form.interval} onChange={e => setForm(f => ({ ...f, interval: Number(e.target.value) }))}>
              {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Timeout</label>
            <select className="input-field" value={form.timeout} onChange={e => setForm(f => ({ ...f, timeout: Number(e.target.value) }))}>
              {[5, 10, 15, 30, 60].map(t => <option key={t} value={t}>{t}s</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Alert After</label>
            <select className="input-field" value={form.alert_threshold || 1} onChange={e => setForm(f => ({ ...f, alert_threshold: Number(e.target.value) }))}>
              {[1,2,3,5].map(n => <option key={n} value={n}>{n} failure{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Monitor')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary px-6">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}
