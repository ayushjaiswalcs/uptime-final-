import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Radio, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { authApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'

type Status = 'verifying' | 'success' | 'error'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { user, refreshUser } = useAuth()
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // StrictMode double-invoke guard
    ran.current = true

    if (!token) {
      setStatus('error')
      setMessage('This verification link is invalid or incomplete.')
      return
    }
    authApi.verifyEmail(token)
      .then(({ data }) => {
        setStatus('success')
        setMessage(data.message)
        if (user) refreshUser().catch(() => {})
      })
      .catch((err) => {
        setStatus('error')
        const detail = err.response?.data?.detail
        setMessage(typeof detail === 'string' ? detail : 'Verification failed. The link may have expired.')
      })
  }, [token, user, refreshUser])

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
        </div>

        <div className="glass-card p-8 text-center space-y-4">
          {status === 'verifying' && (
            <>
              <Loader2 className="w-10 h-10 text-primary-400 animate-spin mx-auto" />
              <h2 className="text-lg font-semibold text-white">Verifying your email…</h2>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-500/15 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Email verified</h2>
              <p className="text-sm text-slate-400">{message}</p>
              <Link to={user ? '/dashboard' : '/login'} className="btn-primary inline-block">
                {user ? 'Go to dashboard' : 'Sign in'}
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Verification failed</h2>
              <p className="text-sm text-slate-400">{message}</p>
              <Link to={user ? '/dashboard' : '/login'} className="btn-secondary inline-block">
                {user ? 'Back to dashboard' : 'Back to sign in'}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
