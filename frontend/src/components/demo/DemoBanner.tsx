import { AnimatePresence, motion } from 'framer-motion'
import { X, FlaskConical, AlertTriangle, CheckCircle, AlertCircle, LogOut } from 'lucide-react'
import { useDemo } from '../../context/DemoContext'
import { useAuth } from '../../context/AuthContext'

function AlertIcon({ type }: { type: 'down' | 'up' | 'warning' }) {
  if (type === 'down') return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
  if (type === 'up') return <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
  return <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
}

export default function DemoBanner() {
  const { isDemoMode, alertEvents, stopDemo, dismissAlert } = useDemo()
  const { logout } = useAuth()

  if (!isDemoMode) return null

  const exitDemo = () => {
    stopDemo()
    logout()
  }

  return (
    <>
      {/* Top banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-amber-300">
          <FlaskConical className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Demo Environment</span>
          <span className="text-amber-400/70 hidden sm:inline">— You are viewing live demo data. Changes are not permanently saved.</span>
        </div>
        <button
          onClick={exitDemo}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-white border border-amber-500/40 hover:border-amber-400 rounded-lg px-3 py-1.5 transition-all flex-shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          Exit Demo
        </button>
      </div>

      {/* Alert notification popups */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
        <AnimatePresence>
          {alertEvents.map(event => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="pointer-events-auto bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl flex items-start gap-3"
              style={{ backdropFilter: 'blur(12px)' }}
            >
              <AlertIcon type={event.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium leading-snug">{event.message}</p>
                <p className="text-xs text-slate-500 mt-0.5">{event.timestamp}</p>
              </div>
              <button
                onClick={() => dismissAlert(event.id)}
                className="text-slate-500 hover:text-slate-300 flex-shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
