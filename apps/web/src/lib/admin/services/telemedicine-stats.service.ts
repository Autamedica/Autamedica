/**
 * Service: telemedicine stats for admin dashboard.
 * Extracted from /api/admin/telemedicine-stats.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

interface CallRow {
  status: string
  created_at: string
  ended_at: string | null
}

export interface TelemedicineStatsResult {
  stats: Record<string, unknown>
  recentCalls: unknown[]
  eventsByType: Record<string, number>
}

function computeStatsFromCalls(calls: CallRow[]): Record<string, unknown> {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const calls24h = calls.filter(c => new Date(c.created_at) >= last24h)
  const calls7d = calls.filter(c => new Date(c.created_at) >= last7d)

  const completedCalls = calls.filter((c): c is CallRow & { ended_at: string } => c.status === 'ended' && c.ended_at !== null)
  const avgDurationMs = completedCalls.length > 0
    ? completedCalls
        .map(c => new Date(c.ended_at).getTime() - new Date(c.created_at).getTime())
        .reduce((sum, d) => sum + d, 0) / completedCalls.length
    : 0

  const byStatus = calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  return {
    totalCalls: calls.length,
    calls24h: calls24h.length,
    calls7d: calls7d.length,
    connected: calls.filter(c => c.status === 'connected' || c.status === 'ended').length,
    failed: calls.filter(c => c.status === 'failed' || c.status === 'canceled' || c.status === 'declined').length,
    avgDurationSeconds: Math.round(avgDurationMs / 1000),
    byStatus,
  }
}

export const telemedicineStatsService = {
  async verifyAdmin(admin: AdminClient, userId: string): Promise<boolean> {
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    return (data as { role: string } | null)?.role === 'admin'
  },

  async getStats(admin: AdminClient): Promise<TelemedicineStatsResult> {
    const [callsResult, recentCallsResult, eventsResult] = await Promise.all([
      admin.rpc('get_telemedicine_stats').single(),
      admin
        .from('calls')
        .select('id, room_id, status, doctor_id, patient_id, appointment_id, created_at, ended_at')
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('call_events')
        .select('id, call_id, type, payload, at')
        .order('at', { ascending: false })
        .limit(200),
    ])

    let stats: Record<string, unknown>
    if (callsResult.error) {
      const { data: allCalls } = await admin
        .from('calls')
        .select('status, created_at, ended_at')
        .order('created_at', { ascending: false })
        .limit(1000)

      stats = computeStatsFromCalls((allCalls ?? []) as CallRow[])
    } else {
      stats = callsResult.data as Record<string, unknown>
    }

    const events = (eventsResult.data ?? []) as Array<{ type: string; call_id: string; payload: Record<string, unknown> | null }>
    const eventsByType = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1
      return acc
    }, {})

    // Build participant map: for each call_id, collect which userTypes connected
    const participantMap = new Map<string, Set<string>>()
    for (const event of events) {
      const payload = event.payload as Record<string, unknown> | null
      const innerPayload = payload?.payload as Record<string, unknown> | undefined
      const userType = (innerPayload?.userType ?? payload?.userType) as string | undefined
      if (userType && event.call_id) {
        const participants = participantMap.get(event.call_id) ?? new Set<string>()
        participants.add(userType)
        participantMap.set(event.call_id, participants)
      }
    }

    // Enrich recent calls with participant info
    const recentCalls = (recentCallsResult.data ?? []).map((call: Record<string, unknown>) => {
      const callId = call.id as string
      const participants = participantMap.get(callId)
      const doctorJoined = participants?.has('doctor') ?? false
      const patientJoined = participants?.has('patient') ?? false
      return {
        ...call,
        doctor_joined: doctorJoined,
        patient_joined: patientJoined,
      }
    })

    return {
      stats,
      recentCalls,
      eventsByType,
    }
  },
}
