import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast, type Toast } from '../../context/ToastContext'

const icons = {
  success: <CheckCircle size={16} className="text-green-400" />,
  error: <XCircle size={16} className="text-red-400" />,
  warning: <AlertTriangle size={16} className="text-yellow-400" />,
  info: <Info size={16} className="text-blue-400" />,
}

const borders = {
  success: 'border-green-500/40',
  error: 'border-red-500/40',
  warning: 'border-yellow-500/40',
  info: 'border-blue-500/40',
}

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast()
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border bg-[var(--bg-secondary)] shadow-xl min-w-[280px] max-w-sm ${borders[toast.type]}`}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.type]}</span>
      <p className="flex-1 text-sm text-[var(--text-primary)] leading-snug">{toast.message}</p>
      <button onClick={() => dismiss(toast.id)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts } = useToast()
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end">
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  )
}
