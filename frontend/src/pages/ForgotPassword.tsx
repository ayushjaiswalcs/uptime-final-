import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, ArrowLeft, MailCheck } from 'lucide-react'
import { authApi } from '../api/auth'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.forgotPassword(email)
      setDevLink(data.dev_reset_link ?? null)
      setSent(true)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
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
          <p className="text-slate-400 mt-3 text-sm">Reset your password</p>
        </div>

        <div className="glass-card p-7">
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-slate-400">
                Enter the email associated with your account and we'll send you a link to reset your password.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : 'Send reset link'}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-green-500/15 rounded-full flex items-center justify-center mx-auto">
                <MailCheck className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Check your email</h2>
              <p className="text-sm text-slate-400">
                If an account exists for <span className="text-slate-200">{email}</span>, we've sent a password reset link. It expires in 30 minutes.
              </p>
              {devLink && (
                <div className="text-left bg-slate-700/40 border border-slate-600/50 rounded-xl p-3">
                  <p className="text-xs text-amber-400 font-medium mb-1">Dev mode (no email configured)</p>
                  <Link to={devLink.replace(/^https?:\/\/[^/]+/, '')} className="text-xs text-primary-400 hover:text-primary-300 break-all underline">
                    Open reset link →
                  </Link>
                </div>
              )}
            </div>
          )}

          <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-white mt-6">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
