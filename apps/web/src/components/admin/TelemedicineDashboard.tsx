'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDuration, timeAgo } from '@/lib/date-utils'
import { fetchApi } from '@/lib/api-client'

interface CallRecord {
  id: string
  room_id: string
  status: string
  doctor_id: string
  patient_id: string
  appointment_id: string | null
  created_at: string
  ended_at: string | null
  doctor_joined: boolean
  patient_joined: boolean
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

interface NotificationRiskSummary {
  total: number
  p0: number
  p1: number
  p2: number
}

interface NotificationRisk {
  appointment_id: string
  start_time: string
  urgency: 'p0' | 'p1' | 'p2'
  risk_reasons: string[]
}

interface NotificationRiskData {
  summary: NotificationRiskSummary
  risks: NotificationRisk[]
  degraded?: boolean
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

export default function TelemedicineDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [notificationRisks, setNotificationRisks] = useState<NotificationRiskData | null>(null)
  const [notificationRiskError, setNotificationRiskError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTelemedicineStats = useCallback(async () => {
    try {
      const statsResult = await fetchApi<DashboardData>('/api/admin/telemedicine-stats')
      setData(statsResult)
      setError(null)

      try {
        const risksResult = await fetchApi<NotificationRiskData>('/api/admin/appointment-notification-risks?limit=8')
        setNotificationRisks(risksResult)
        setNotificationRiskError(risksResult.degraded ? 'Vista de riesgos temporalmente no disponible.' : null)
      } catch (riskErr) {
        setNotificationRisks(null)
        setNotificationRiskError(riskErr instanceof Error ? riskErr.message : 'Vista de riesgos temporalmente no disponible.')
      }
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
  const riskSummary = notificationRisks?.summary ?? { total: 0, p0: 0, p1: 0, p2: 0 }
  const activeRisks = notificationRisks?.risks ?? []

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total llamadas" value={stats.totalCalls} />
        <StatCard label="Ultimas 24h" value={stats.calls24h} />
        <StatCard label="Ultimos 7d" value={stats.calls7d} />
        <StatCard label="Duracion promedio" value={formatDuration(stats.avgDurationSeconds)} />
      </div>

      <div className={`rounded-lg border p-4 ${riskSummary.p0 > 0 ? 'border-red-200 bg-red-50' : riskSummary.p1 > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Riesgo de notificaciones de turnos</h3>
            <p className="mt-1 text-sm text-gray-700">
              {notificationRiskError
                ? notificationRiskError
                : riskSummary.total === 0
                  ? 'Sin turnos confirmados futuros con evidencia incompleta.'
                  : `${riskSummary.total} turno(s) con evidencia incompleta: P0 ${riskSummary.p0}, P1 ${riskSummary.p1}, P2 ${riskSummary.p2}.`}
            </p>
          </div>
          <div className="flex gap-2 text-xs font-semibold">
            <span className="rounded bg-red-100 px-2 py-1 text-red-800">P0 {riskSummary.p0}</span>
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">P1 {riskSummary.p1}</span>
            <span className="rounded bg-gray-100 px-2 py-1 text-gray-800">P2 {riskSummary.p2}</span>
          </div>
        </div>
        {activeRisks.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium uppercase">Urgencia</th>
                  <th className="py-2 pr-3 font-medium uppercase">Appointment</th>
                  <th className="py-2 pr-3 font-medium uppercase">Inicio</th>
                  <th className="py-2 font-medium uppercase">Faltante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeRisks.map((risk) => (
                  <tr key={risk.appointment_id}>
                    <td className="py-2 pr-3 font-semibold uppercase text-gray-900">{risk.urgency}</td>
                    <td className="py-2 pr-3 font-mono text-gray-700">{risk.appointment_id.slice(0, 8)}...</td>
                    <td className="py-2 pr-3 text-gray-700">{new Date(risk.start_time).toLocaleString('es-AR')}</td>
                    <td className="py-2 text-gray-700">{risk.risk_reasons.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participantes</th>
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
                const isNoShow = call.patient_joined && !call.doctor_joined && (call.status === 'ended' || call.status === 'connecting')
                const isRealCall = call.doctor_joined && call.patient_joined
                return (
                  <tr key={call.id} className={`hover:bg-gray-50 ${isNoShow ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 text-xs font-mono text-gray-700 truncate max-w-[140px]">
                      {call.room_id}
                    </td>
                    <td className="px-3 py-2">
                      {isNoShow ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          no-show 🩺
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[call.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {call.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm ${call.doctor_joined ? '' : 'opacity-25 grayscale'}`} title={call.doctor_joined ? 'Médico conectado' : 'Médico ausente'}>
                          🩺
                        </span>
                        <span className={`text-sm ${call.patient_joined ? '' : 'opacity-25 grayscale'}`} title={call.patient_joined ? 'Paciente conectado' : 'Paciente ausente'}>
                          👤
                        </span>
                        {isRealCall && <span className="text-xs text-green-600 font-medium ml-1">✓ Consulta</span>}
                        {isNoShow && <span className="text-xs text-red-600 font-medium ml-1">Sin médico</span>}
                      </div>
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
                  <td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-400">
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
