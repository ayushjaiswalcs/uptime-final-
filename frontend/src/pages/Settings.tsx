import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { User, Lock, CreditCard, CheckCircle, Smartphone, ShieldCheck, ShieldOff, QrCode } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/auth'
import client from '../api/client'
import Header from '../components/layout/Header'

const PLANS = [
  { id: 'free',       name: 'Free',       price: '$0',  period: 'forever', features: ['10 Monitors', '5 Min Interval', 'Email Alerts', '1 Status Page'] },
  { id: 'pro',        name: 'Pro',        price: '$9',  period: 'month',   popular: true, features: ['100 Monitors', '1 Min Interval', 'All Alert Channels', '5 Status Pages', 'Advanced Reports'] },
  { id: 'enterprise', name: 'Enterprise', price: '$29', period: 'month',   features: ['Unlimited Monitors', '30s Interval', 'All Channels', 'Unlimited Pages', 'Teams', 'Audit Logs'] },
]

export default function Settings() {
  const { user, updateUser } = useAuth()
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [pwForm, setPwForm]   = useState({ current_password: '', new_password: '', confirm: '' })
  const [profileMsg, setProfileMsg] = useState('')
  const [pwMsg, setPwMsg]     = useState('')
  const [pwError, setPwError] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpMsg, setTotpMsg]   = useState('')
  const [totpError, setTotpError] = useState('')
  const [show2faSetup, setShow2faSetup] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // Fetch 2FA setup URI
  const { data: totpSetup, refetch: fetchSetup } = useQuery({
    queryKey: ['2fa-setup'],
    queryFn: () => client.get('/auth/2fa/setup').then(r => r.data),
    enabled: false,
  })

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateMe({ name: profileForm.name, email: profileForm.email }),
    onSuccess: ({ data }) => { updateUser(data); setProfileMsg('Profile updated successfully') },
  })

  const pwMutation = useMutation({
    mutationFn: () => authApi.changePassword(pwForm.current_password, pwForm.new_password),
    onSuccess: () => { setPwMsg('Password changed'); setPwForm({ current_password: '', new_password: '', confirm: '' }) },
    onError: (e: any) => setPwError(e.response?.data?.detail || 'Failed to change password'),
  })

  const enable2fa = useMutation({
    mutationFn: () => client.post(`/auth/2fa/enable?code=${totpCode}`),
    onSuccess: () => { setTotpMsg('2FA enabled successfully'); setShow2faSetup(false); setTotpCode('') },
    onError: (e: any) => setTotpError(e.response?.data?.detail || 'Invalid code'),
  })

  const disable2fa = useMutation({
    mutationFn: () => client.delete(`/auth/2fa/disable?password=${disablePassword}`),
    onSuccess: () => { setTotpMsg('2FA disabled'); setDisablePassword('') },
    onError: (e: any) => setTotpError(e.response?.data?.detail || 'Failed to disable 2FA'),
  })

  const handle2faSetup = async () => {
    setTotpError('')
    setShow2faSetup(true)
    await fetchSetup()
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="Settings" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Profile */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <User className="w-5 h-5 text-primary-400" />
              <h2 className="font-semibold text-white">Profile Information</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                <input className="input-field" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
                <input type="email" className="input-field" value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {profileMsg && <p className="text-sm text-green-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{profileMsg}</p>}
              <button onClick={() => profileMutation.mutate()} className="btn-primary">Save Changes</button>
            </div>
          </div>

          {/* Password */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Lock className="w-5 h-5 text-primary-400" />
              <h2 className="font-semibold text-white">Change Password</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Password</label>
                <input type="password" className="input-field" value={pwForm.current_password} onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New Password</label>
                <input type="password" className="input-field" value={pwForm.new_password} onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm New Password</label>
                <input type="password" className="input-field" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
              </div>
              {pwMsg   && <p className="text-sm text-green-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{pwMsg}</p>}
              {pwError && <p className="text-sm text-red-400">{pwError}</p>}
              <button onClick={() => { setPwError(''); pwForm.new_password !== pwForm.confirm ? setPwError('Passwords do not match') : pwMutation.mutate() }} className="btn-primary">
                Update Password
              </button>
            </div>
          </div>

          {/* 2FA */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Smartphone className="w-5 h-5 text-primary-400" />
              <h2 className="font-semibold text-white">Two-Factor Authentication</h2>
              {user?.totp_enabled
                ? <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Enabled</span>
                : <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-400">Disabled</span>
              }
            </div>

            {totpMsg   && <p className="text-sm text-green-400 mb-4 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{totpMsg}</p>}
            {totpError && <p className="text-sm text-red-400 mb-4">{totpError}</p>}

            {!user?.totp_enabled ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Add an extra layer of security to your account using an authenticator app (Google Authenticator, Authy, etc.).</p>
                {!show2faSetup ? (
                  <button onClick={handle2faSetup} className="btn-primary flex items-center gap-2">
                    <QrCode className="w-4 h-4" /> Set Up 2FA
                  </button>
                ) : (
                  <div className="space-y-4">
                    {totpSetup?.otpauth_uri && (
                      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                        <p className="text-xs text-slate-400 mb-2">Scan this URI in your authenticator app:</p>
                        <code className="text-xs text-green-400 break-all font-mono">{totpSetup.otpauth_uri}</code>
                        <p className="text-xs text-slate-500 mt-2">Or enter secret manually: <code className="text-yellow-400">{totpSetup.secret}</code></p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Verification Code</label>
                      <input
                        className="input-field font-mono tracking-widest text-center text-lg"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => enable2fa.mutate()} disabled={totpCode.length !== 6 || enable2fa.isPending} className="btn-primary flex-1">
                        {enable2fa.isPending ? 'Verifying...' : 'Enable 2FA'}
                      </button>
                      <button onClick={() => setShow2faSetup(false)} className="btn-secondary px-5">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">2FA is active. Enter your password to disable it.</p>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Password</label>
                  <input type="password" className="input-field" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} />
                </div>
                <button onClick={() => { setTotpError(''); disable2fa.mutate() }} disabled={!disablePassword || disable2fa.isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium">
                  <ShieldOff className="w-4 h-4" />{disable2fa.isPending ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Plan */}
        <div className="glass-card p-5 h-fit">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-primary-400" />
            <h2 className="font-semibold text-white">Current Plan</h2>
          </div>
          <div className="space-y-3">
            {PLANS.map(plan => (
              <div key={plan.id} className={`p-4 rounded-xl border transition-all ${user?.subscription_plan === plan.id ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700 hover:border-slate-600'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{plan.name}</h3>
                    {(plan as any).popular && <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400">Popular</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-white">{plan.price}</span>
                    <span className="text-xs text-slate-500">/{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {plan.features.slice(0, 3).map(f => (
                    <li key={f} className="text-xs text-slate-400 flex items-center gap-1.5">
                      <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                {user?.subscription_plan === plan.id
                  ? <span className="mt-3 block text-center text-xs font-semibold text-primary-400">Current Plan</span>
                  : <button className="mt-3 w-full py-1.5 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors">Upgrade</button>
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
