import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailWarning, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'

export default function VerifyBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [devLink, setDevLink] = useState<string | null>(null)

  if (!user || user.is_verified || dismissed) return null

  const resend = async () => {
    setState('sending')
    try {
      const { data } = await authApi.resendVerification()
      setDevLink(data.dev_verify_link ?? null)
      setState('sent')
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center gap-3 text-sm">
      <MailWarning className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <span className="text-amber-200/90">
        Please verify your email address to secure your account.
      </span>
      {state === 'sent' ? (
        devLink ? (
          <Link to={devLink.replace(/^https?:\/\/[^/]+/, '')} className="text-amber-300 hover:text-amber-200 underline font-medium">
            Open verification link →
          </Link>
        ) : (
          <span className="text-amber-300 font-medium">Verification email sent.</span>
        )
      ) : (
        <button
          onClick={resend}
          disabled={state === 'sending'}
          className="text-amber-300 hover:text-amber-200 underline font-medium disabled:opacity-60"
        >
          {state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="ml-auto text-amber-400/70 hover:text-amber-300" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
