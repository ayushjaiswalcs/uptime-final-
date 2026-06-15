import { useMemo } from 'react'
import { Check, X } from 'lucide-react'

export interface PasswordRule {
  label: string
  test: (pw: string) => boolean
}

export const passwordRules: PasswordRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
  { label: 'One symbol', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

// Backend requires >= 8 chars; the extra rules are guidance, not hard blockers.
export function isPasswordValid(pw: string): boolean {
  return pw.length >= 8
}

const LEVELS = [
  { label: 'Too weak', color: 'bg-red-500', text: 'text-red-400' },
  { label: 'Weak', color: 'bg-orange-500', text: 'text-orange-400' },
  { label: 'Fair', color: 'bg-amber-500', text: 'text-amber-400' },
  { label: 'Good', color: 'bg-lime-500', text: 'text-lime-400' },
  { label: 'Strong', color: 'bg-green-500', text: 'text-green-400' },
]

export default function PasswordStrength({ password }: { password: string }) {
  const passed = useMemo(() => passwordRules.filter((r) => r.test(password)).length, [password])

  if (!password) return null

  // Map 0..5 passed rules onto 5 strength levels (index 0..4).
  const level = LEVELS[Math.max(0, Math.min(passed - 1, LEVELS.length - 1))]

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex gap-1.5">
        {LEVELS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < passed ? level.color : 'bg-slate-700'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${level.text}`}>{level.label}</span>
      </div>
      <ul className="grid grid-cols-1 gap-1">
        {passwordRules.map((rule) => {
          const ok = rule.test(password)
          return (
            <li key={rule.label} className="flex items-center gap-1.5 text-xs">
              {ok ? (
                <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              )}
              <span className={ok ? 'text-slate-300' : 'text-slate-500'}>{rule.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
