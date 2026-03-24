import type { APIRoute } from 'astro'
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { jsonOk, unauthorized, forbidden, internalError } from '@/lib/api-helpers'

type AdminClient = SupabaseClient

async function verifyAdmin(admin: AdminClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { role: string } | null)?.role === 'admin'
}

export const GET: APIRoute = async ({ request }) => {
  try {
    let session: Session
    try {
      const supabase = createServerClientFromRequest(request)
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !data.session) {
        return unauthorized()
      }
      session = data.session
    } catch {
      return unauthorized()
    }

    const admin = createAdminClient() as unknown as AdminClient

    const isAdmin = await verifyAdmin(admin, session.user.id)
    if (!isAdmin) {
      return forbidden()
    }

    // Parallel queries for dashboard data
    const [callsResult, recentCallsResult, eventsResult] = await Promise.all([
      // Call summary stats
      admin.rpc('get_telemedicine_stats').single(),
      // Recent calls (last 50)
      admin
        .from('calls')
        .select('id, room_id, status, doctor_id, patient_id, appointment_id, created_at, ended_at')
        .order('created_at', { ascending: false })
        .limit(50),
      // Recent call events (last 200)
      admin
        .from('call_events')
        .select('id, call_id, type, payload, at')
        .order('at', { ascending: false })
        .limit(200),
    ])

    // If the RPC doesn't exist yet, compute stats from raw data
    let stats: Record<string, unknown>
    if (callsResult.error) {
      const { data: allCalls } = await admin
        .from('calls')
        .select('status, created_at, ended_at')
        .order('created_at', { ascending: false })
        .limit(1000)

      const calls = (allCalls ?? []) as Array<{ status: string; created_at: string; ended_at: string | null }>
      const now = new Date()
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const calls24h = calls.filter(c => new Date(c.created_at) >= last24h)
      const calls7d = calls.filter(c => new Date(c.created_at) >= last7d)

      const avgDurationMs = calls
        .filter(c => c.status === 'ended' && c.ended_at)
        .map(c => new Date(c.ended_at as string).getTime() - new Date(c.created_at).getTime())
        .reduce((sum, d, _, arr) => sum + d / arr.length, 0)

      stats = {
        totalCalls: calls.length,
        calls24h: calls24h.length,
        calls7d: calls7d.length,
        connected: calls.filter(c => c.status === 'connected' || c.status === 'ended').length,
        failed: calls.filter(c => c.status === 'failed' || c.status === 'canceled' || c.status === 'declined').length,
        avgDurationSeconds: Math.round(avgDurationMs / 1000),
        byStatus: Object.fromEntries(
          Object.entries(
            calls.reduce<Record<string, number>>((acc, c) => {
              acc[c.status] = (acc[c.status] ?? 0) + 1
              return acc
            }, {})
          )
        ),
      }
    } else {
      stats = callsResult.data as Record<string, unknown>
    }

    // Event type distribution
    const events = (eventsResult.data ?? []) as Array<{ type: string }>
    const eventsByType = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1
      return acc
    }, {})

    return jsonOk({
      stats,
      recentCalls: recentCallsResult.data ?? [],
      eventsByType,
    })
  } catch (error) {
    logger.error('[telemedicine-stats] GET error', error)
    return internalError()
  }
}
