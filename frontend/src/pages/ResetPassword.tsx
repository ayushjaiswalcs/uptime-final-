import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Radio, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { authApi } from '../api/auth'
import PasswordStrength, { isPasswordValid } from '../components/auth/PasswordStrength'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isPasswordValid(password)) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Uptime</span>
          </Link>
          <p className="text-slate-400 mt-3 text-sm">Choose a new password</p>
        </div>

        <div className="glass-card p-7">
          {!token ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-400">This reset link is invalid or incomplete.</p>
              <Link to="/forgot-password" className="btn-primary inline-block">Request a new link</Link>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-green-500/15 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Password reset</h2>
              <p className="text-sm text-slate-400">Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting...
                  </span>
                ) : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
