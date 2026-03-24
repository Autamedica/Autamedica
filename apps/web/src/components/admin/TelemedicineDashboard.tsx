'use client'

import { useEffect, useState, useCallback } from 'react'

interface CallRecord {
  id: string
  room_id: string
  status: string
  doctor_id: string
  patient_id: string
  appointment_id: string | null
  created_at: string
  ended_at: string | null
}

interface TelemedicineStats {
  totalCalls: number
  calls24h: number
  calls7d: number
  connected: number
  failed: number
  avgDurationSeconds: number
  byStatus: Record<string, number>
}

interface DashboardData {
  stats: TelemedicineStats
  recentCalls: CallRecord[]
  eventsByType: Record<string, number>
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-100 text-green-800',
  ended: 'bg-gray-100 text-gray-800',
  connecting: 'bg-blue-100 text-blue-800',
  requested: 'bg-yellow-100 text-yellow-800',
  ringing: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-red-100 text-red-800',
  declined: 'bg-red-100 text-red-800',
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function TelemedicineDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTelemedicineStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/telemedicine-stats')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { success: boolean; data: { stats: TelemedicineStats; recentCalls: CallRecord[]; eventsByType: Record<string, number> } }
      if (!json.success) throw new Error('Failed to load stats')
      setData({ stats: json.data.stats, recentCalls: json.data.recentCalls, eventsByType: json.data.eventsByType })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTelemedicineStats()
    const interval = setInterval(() => void loadTelemedicineStats(), 30000)
    return () => clearInterval(interval)
  }, [loadTelemedicineStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800">
        <p className="font-medium">Error cargando datos</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={() => { setLoading(true); void loadTelemedicineStats() }}
          className="mt-2 text-sm underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!data) return null

  const { stats, recentCalls, eventsByType } = data

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total llamadas" value={stats.totalCalls} />
        <StatCard label="Ultimas 24h" value={stats.calls24h} />
        <StatCard label="Ultimos 7d" value={stats.calls7d} />
        <StatCard label="Duracion promedio" value={formatDuration(stats.avgDurationSeconds)} />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de llamadas</h3>
          <div className="space-y-2">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {status}
                </span>
                <span className="text-sm font-mono text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Eventos recientes por tipo</h3>
          <div className="space-y-2">
            {Object.entries(eventsByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-600">{type}</span>
                  <span className="text-sm font-mono text-gray-900">{count}</span>
                </div>
              ))}
            {Object.keys(eventsByType).length === 0 && (
              <p className="text-sm text-gray-400">Sin eventos</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent calls table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Llamadas recientes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Creada</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duracion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentCalls.map((call) => {
                const duration = call.ended_at
                  ? Math.round((new Date(call.ended_at).getTime() - new Date(call.created_at).getTime()) / 1000)
                  : null
                return (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs font-mono text-gray-700 truncate max-w-[140px]">
                      {call.room_id}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[call.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {call.appointment_id ? call.appointment_id.slice(0, 8) + '...' : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{timeAgo(call.created_at)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-700">
                      {duration !== null ? formatDuration(duration) : '-'}
                    </td>
                  </tr>
                )
              })}
              {recentCalls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-400">
                    Sin llamadas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
