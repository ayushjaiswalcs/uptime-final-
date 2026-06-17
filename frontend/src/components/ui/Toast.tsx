import React, { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast, type Toast } from '../../context/ToastContext'

const config = {
  success: {
    Icon: CheckCircle2,
    accent: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    ring: 'rgba(34,197,94,0.15)',
  },
  error: {
    Icon: XCircle,
    accent: '#ef4444',
    glow: 'rgba(239,68,68,0.35)',
    ring: 'rgba(239,68,68,0.15)',
  },
  warning: {
    Icon: AlertTriangle,
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    ring: 'rgba(245,158,11,0.15)',
  },
  info: {
    Icon: Info,
    accent: '#3b82f6',
    glow: 'rgba(59,130,246,0.35)',
    ring: 'rgba(59,130,246,0.15)',
  },
}

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast()
  const [leaving, setLeaving] = useState(false)
  const { Icon, accent, glow, ring } = config[toast.type]
  const duration = toast.duration ?? 4000

  const close = () => {
    setLeaving(true)
    setTimeout(() => dismiss(toast.id), 260)
  }

  return (
    <div
      role="status"
      className="toast-card group"
      style={{
        animation: leaving
          ? 'toast-out 0.26s cubic-bezier(0.4,0,1,1) forwards'
          : 'toast-in 0.42s cubic-bezier(0.16,1,0.3,1) forwards',
        boxShadow: `0 8px 32px -8px ${glow}, 0 0 0 1px ${ring}`,
      }}
    >
      {/* colored accent bar */}
      <span className="toast-accent" style={{ background: accent }} />

      {/* icon puck */}
      <span
        className="toast-icon"
        style={{ background: ring, boxShadow: `0 0 12px ${glow}` }}
      >
        <Icon size={18} strokeWidth={2.4} style={{ color: accent }} />
      </span>

      <p className="toast-msg">{toast.message}</p>

      <button onClick={close} aria-label="Dismiss" className="toast-close">
        <X size={14} />
      </button>

      {/* auto-dismiss countdown */}
      {duration > 0 && (
        <span
          className="toast-progress"
          style={{
            background: accent,
            animation: `toast-progress ${duration}ms linear forwards`,
          }}
        />
      )}
    </div>
  )
}

export default function ToastContainer() {
  const { toasts } = useToast()
  return (
    <>
      <ToastStyles />
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </div>
    </>
  )
}

// Inject keyframes + card styles once.
function ToastStyles() {
  useEffect(() => {
    if (document.getElementById('toast-styles')) return
    const el = document.createElement('style')
    el.id = 'toast-styles'
    el.textContent = `
      @keyframes toast-in {
        0%   { opacity: 0; transform: translateX(120%) scale(0.92); }
        60%  { opacity: 1; }
        100% { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes toast-out {
        0%   { opacity: 1; transform: translateX(0) scale(1); }
        100% { opacity: 0; transform: translateX(120%) scale(0.92); }
      }
      @keyframes toast-progress {
        from { transform: scaleX(1); }
        to   { transform: scaleX(0); }
      }
      .toast-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        max-width: 400px;
        padding: 13px 14px 13px 18px;
        border-radius: 16px;
        overflow: hidden;
        background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        backdrop-filter: blur(16px) saturate(180%);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
      }
      .toast-accent {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 4px;
        border-radius: 4px;
      }
      .toast-icon {
        flex-shrink: 0;
        display: grid;
        place-items: center;
        width: 34px; height: 34px;
        border-radius: 11px;
      }
      .toast-msg {
        flex: 1;
        font-size: 13.5px;
        line-height: 1.4;
        font-weight: 500;
        color: var(--text-primary);
      }
      .toast-close {
        flex-shrink: 0;
        display: grid;
        place-items: center;
        width: 24px; height: 24px;
        border-radius: 8px;
        color: var(--text-muted);
        opacity: 0;
        transition: opacity 0.15s, background 0.15s, color 0.15s;
      }
      .toast-card:hover .toast-close { opacity: 1; }
      .toast-close:hover {
        background: var(--surface-hover, rgba(255,255,255,0.08));
        color: var(--text-primary);
      }
      .toast-progress {
        position: absolute;
        left: 0; bottom: 0;
        height: 2.5px;
        width: 100%;
        transform-origin: left;
        opacity: 0.7;
      }
    `
    document.head.appendChild(el)
  }, [])
  return null
}
