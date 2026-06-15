import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Database, Zap, CheckCircle } from 'lucide-react'
import { useDemo } from '../context/DemoContext'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  { label: 'Loading 150 monitors',         icon: Activity },
  { label: 'Connecting simulation engine', icon: Zap },
  { label: 'Launching dashboard',          icon: Database },
]

export default function Demo() {
  const { startDemo } = useDemo()
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(-1)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      startDemo()
      // refreshUser() goes through the mock interceptor → returns DEMO_USER
      await refreshUser().catch(() => {})

      if (cancelled) return
      setStep(0)
      await delay(500)

      if (cancelled) return
      setStep(1)
      await delay(600)

      if (cancelled) return
      setStep(2)
      await delay(700)

      if (!cancelled) navigate('/dashboard', { replace: true })
    }

    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center mx-auto mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          >
            <Activity className="w-8 h-8 text-primary-400" />
          </motion.div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Loading Demo</h1>
        <p className="text-slate-400 text-sm mb-8">Preparing your live environment…</p>

        <div className="space-y-3 text-left">
          {STEPS.map((s, i) => {
            const done = step > i
            const active = step === i
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: step >= i ? 1 : 0.3, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                  active ? 'bg-primary-500/10 border-primary-500/30' :
                  done  ? 'bg-green-500/5 border-green-500/20' :
                           'bg-slate-800/40 border-slate-700/40'
                }`}
              >
                {done
                  ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  : <s.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary-400' : 'text-slate-600'}`} />
                }
                <span className={`text-sm ${done ? 'text-green-300' : active ? 'text-white' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {active && (
                  <motion.div
                    className="ml-auto w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  />
                )}
              </motion.div>
            )
          })}
        </div>

        <p className="text-xs text-slate-600 mt-8">
          Demo environment — no account required
        </p>
      </motion.div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
