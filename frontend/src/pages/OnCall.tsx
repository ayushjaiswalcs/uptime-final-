import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Phone, Plus, Trash2, UserCheck, Calendar, ChevronRight,
  Clock, Bell, Users, ArrowRight, AlertOctagon
} from 'lucide-react'
import { oncallApi, type OnCallSchedule, type EscalationPolicy } from '../api/oncall'
import Header from '../components/layout/Header'
import clsx from 'clsx'

type Tab = 'schedules' | 'escalations'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function WeekView({ rotations }: { rotations: any[] }) {
  const colors = ['bg-primary-500/20 text-primary-400', 'bg-purple-500/20 text-purple-400', 'bg-cyan-500/20 text-cyan-400', 'bg-emerald-500/20 text-emerald-400']
  return (
    <div className="grid grid-cols-7 gap-1 mt-4">
      {DAYS.map((day, i) => {
        const rotation = rotations[i % Math.max(rotations.length, 1)]
        const colorCls = rotation ? colors[rotation.order_index % colors.length] : 'bg-slate-700/30 text-slate-500'
        return (
          <div key={day} className={clsx('rounded-lg p-2.5 text-center', colorCls)}>
            <p className="text-xs font-medium">{day}</p>
            <p className="text-xs mt-1 truncate">{rotation?.user_name?.split(' ')[0] || '—'}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function OnCall() {
  const [tab, setTab] = useState<Tab>('schedules')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [showEscForm, setShowEscForm] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<OnCallSchedule | null>(null)
  const [scheduleForm, setScheduleForm] = useState({ name: '', description: '', timezone: 'UTC', rotation_type: 'weekly' })
  const [escForm, setEscForm] = useState({ name: '', description: '', repeat_count: 3 })
  const [stepForms, setStepForms] = useState<Record<number, { delay_minutes: number; notify_via: string[] }>>({})
  const qc = useQueryClient()

  const { data: schedules = [] } = useQuery({
    queryKey: ['oncall-schedules'],
    queryFn: () => oncallApi.listSchedules().then(r => r.data),
  })
  const { data: escalations = [] } = useQuery({
    queryKey: ['escalations'],
    queryFn: () => oncallApi.listEscalations().then(r => r.data),
  })
  const { data: selectedRotations = [] } = useQuery({
    queryKey: ['rotations', selectedSchedule?.id],
    queryFn: () => oncallApi.listRotations(selectedSchedule!.id).then(r => r.data),
    enabled: !!selectedSchedule,
  })

  const createSchedule = useMutation({
    mutationFn: () => oncallApi.createSchedule(scheduleForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oncall-schedules'] }); setShowScheduleForm(false) },
  })
  const deleteSchedule = useMutation({
    mutationFn: (id: number) => oncallApi.deleteSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oncall-schedules'] }),
  })
  const createEscalation = useMutation({
    mutationFn: () => oncallApi.createEscalation(escForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalations'] }); setShowEscForm(false) },
  })
  const deleteEscalation = useMutation({
    mutationFn: (id: number) => oncallApi.deleteEscalation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['escalations'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="On-Call Management" />

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {([
          { id: 'schedules', label: 'Schedules', icon: Calendar },
          { id: 'escalations', label: 'Escalation Policies', icon: AlertOctagon },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            )}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Schedules */}
      {tab === 'schedules' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold app-title">On-Call Schedules</h3>
              <button onClick={() => setShowScheduleForm(true)} className="btn-primary text-sm flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />New
              </button>
            </div>

            {showScheduleForm && (
              <div className="glass-card p-4 space-y-3">
                <input className="input-field w-full" placeholder="Schedule name" value={scheduleForm.name}
                  onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))} />
                <select className="input-field w-full" value={scheduleForm.rotation_type}
                  onChange={e => setScheduleForm(f => ({ ...f, rotation_type: e.target.value }))}>
                  <option value="daily">Daily rotation</option>
                  <option value="weekly">Weekly rotation</option>
                  <option value="custom">Custom</option>
                </select>
                <select className="input-field w-full" value={scheduleForm.timezone}
                  onChange={e => setScheduleForm(f => ({ ...f, timezone: e.target.value }))}>
                  {['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata'].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowScheduleForm(false)} className="btn-secondary text-sm flex-1">Cancel</button>
                  <button onClick={() => createSchedule.mutate()} disabled={!scheduleForm.name} className="btn-primary text-sm flex-1">
                    Create
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {schedules.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedSchedule(s)}
                  className={clsx(
                    'glass-card p-4 cursor-pointer transition-all hover:border-primary-500/50',
                    selectedSchedule?.id === s.id ? 'border-primary-500/50' : ''
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-primary-400" />
                      </div>
                      <div>
                        <p className="font-medium app-title text-sm">{s.name}</p>
                        <p className="text-xs text-muted">{s.rotation_type} · {s.timezone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ChevronRight className="w-4 h-4 text-muted" />
                      <button
                        onClick={e => { e.stopPropagation(); deleteSchedule.mutate(s.id) }}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {schedules.length === 0 && (
                <div className="glass-card p-8 text-center text-muted text-sm">No schedules yet</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedSchedule ? (
              <div className="glass-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold app-title">{selectedSchedule.name}</h3>
                  <span className="text-xs text-muted">{selectedSchedule.timezone}</span>
                </div>
                <WeekView rotations={selectedRotations} />
                <div className="border-t border-[var(--border)] pt-4">
                  <h4 className="text-sm font-semibold app-title mb-3">Current Rotation</h4>
                  {selectedRotations.length === 0 ? (
                    <p className="text-sm text-muted">No engineers assigned yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRotations.map((r: any, i: number) => (
                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                          <span className="text-xs font-bold text-muted w-4">{i + 1}</span>
                          <div className="w-7 h-7 rounded-full bg-primary-600/20 flex items-center justify-center text-xs font-bold text-primary-400">
                            {r.user_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium app-title">{r.user_name}</p>
                            <p className="text-xs text-muted">{r.user_email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <Calendar className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-muted">Select a schedule to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Escalations */}
      {tab === 'escalations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowEscForm(true)} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />New Policy
            </button>
          </div>
          {showEscForm && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold app-title">New Escalation Policy</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Policy Name</label>
                  <input className="input-field w-full" value={escForm.name} placeholder="Critical Escalation"
                    onChange={e => setEscForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider block mb-1.5">Repeat Count</label>
                  <input type="number" className="input-field w-full" value={escForm.repeat_count}
                    onChange={e => setEscForm(f => ({ ...f, repeat_count: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEscForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={() => createEscalation.mutate()} disabled={!escForm.name} className="btn-primary text-sm">
                  Create Policy
                </button>
              </div>
            </div>
          )}

          {escalations.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <AlertOctagon className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No escalation policies defined</p>
              <p className="text-sm text-subtle mt-1">Create policies to route alerts to the right people</p>
            </div>
          ) : (
            <div className="space-y-4">
              {escalations.map(policy => (
                <EscalationPolicyCard key={policy.id} policy={policy} onDelete={() => deleteEscalation.mutate(policy.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EscalationPolicyCard({ policy, onDelete }: { policy: EscalationPolicy; onDelete: () => void }) {
  const { data: steps = [] } = useQuery({
    queryKey: ['escalation-steps', policy.id],
    queryFn: () => oncallApi.listSteps(policy.id).then(r => r.data),
  })

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold app-title">{policy.name}</p>
          <p className="text-sm text-muted mt-0.5">Repeats {policy.repeat_count}x · {steps.length} steps</p>
        </div>
        <button onClick={onDelete} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {steps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {steps.map((step: any, i: number) => (
            <div key={step.id} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white/[0.03] border border-[var(--border)] rounded-lg px-3 py-2">
                <Bell className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-xs font-medium app-title">Step {step.step_order}</span>
                <span className="text-xs text-muted">+{step.delay_minutes}m</span>
              </div>
              {i < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
