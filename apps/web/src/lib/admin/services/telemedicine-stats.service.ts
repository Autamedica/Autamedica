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

    const events = (eventsResult.data ?? []) as Array<{ type: string }>
    const eventsByType = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1
      return acc
    }, {})

    return {
      stats,
      recentCalls: recentCallsResult.data ?? [],
      eventsByType,
    }
  },
}
