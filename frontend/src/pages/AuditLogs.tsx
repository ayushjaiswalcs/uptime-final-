import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { auditApi, type AuditLogOut } from '../api/audit'
import Header from '../components/layout/Header'

const ACTION_COLOR: Record<string, string> = {
  'monitor.create': 'text-green-400 bg-green-500/10',
  'monitor.delete': 'text-red-400 bg-red-500/10',
  'monitor.update': 'text-blue-400 bg-blue-500/10',
  'user.login':     'text-purple-400 bg-purple-500/10',
  'user.register':  'text-primary-400 bg-primary-500/10',
  'api_key.create': 'text-yellow-400 bg-yellow-500/10',
  'api_key.revoke': 'text-red-400 bg-red-500/10',
}

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLOR[action] || 'text-slate-300 bg-slate-700/60'
  return <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${cls}`}>{action}</span>
}

export default function AuditLogs() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const limit = 25

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () => auditApi.list({ limit, offset: page * limit, action: search || undefined }).then(r => r.data),
  })

  return (
    <div className="p-6 space-y-6">
      <Header title="Audit Logs" />

      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input-field pl-9 py-2"
              placeholder="Filter by action..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
          <p className="text-sm text-slate-500">Showing page {page + 1}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Resource</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IP Address</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3"><ActionBadge action={log.action} /></td>
                    <td className="py-3 text-slate-400">
                      {log.resource_type && <span className="font-mono text-xs">{log.resource_type}{log.resource_id ? `#${log.resource_id}` : ''}</span>}
                    </td>
                    <td className="py-3 text-slate-500 font-mono text-xs">{log.ip_address || '—'}</td>
                    <td className="py-3 text-slate-500 text-xs max-w-xs truncate">
                      {log.details ? (() => { try { return JSON.stringify(JSON.parse(log.details), null, 0).slice(0, 80) } catch { return log.details } })() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-xs text-slate-500">Page {page + 1}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < limit}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
