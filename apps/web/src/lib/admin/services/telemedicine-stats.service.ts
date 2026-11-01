import type { SupabaseClient } from '@supabase/supabase-js'
import { telemedicineStatsRepository, type CallRow, type CallEvidence } from '../repositories/telemedicine-stats.repository'

const DAY_MS = 24 * 60 * 60 * 1000
// Review threshold, not a clinical maximum. Longer records remain in the audit history.
const MAX_RECORDED_DURATION_MS = 4 * 60 * 60 * 1000
const OPEN_STATUSES = new Set(['requested', 'ringing', 'accepted', 'connecting', 'connected'])
const MEDIA_EVENTS = new Set(['peer_connected', 'first_remote_media'])

export interface TelemedicineStatsResult {
  stats: {
    totalCalls: number
    calls24h: number
    calls7d: number
    connected: number
    failed: number
    avgDurationSeconds: number | null
    durationSampleCount: number
    durationExcludedCount: number
    staleCalls: number
    testCalls: number
    lastCallAt: string | null
    byStatus: Record<string, number>
  }
  recentCalls: Array<CallRow & {
    stored_status: string
    doctor_joined: true | null
    patient_joined: true | null
    duration_seconds: number | null
    duration_issue: string | null
    is_test: boolean
    connection_recorded: boolean
  }>
  eventsByType: Record<string, number>
  generatedAt: string
}

export function computeTelemedicineStats(
  calls: CallRow[], evidence: CallEvidence[], now: Date
): Omit<TelemedicineStatsResult, 'eventsByType'> {
  const nowMs = now.getTime()
  const evidenceMap = new Map<string, CallEvidence[]>()
  for (const event of evidence) {
    const rows = evidenceMap.get(event.call_id) ?? []
    rows.push(event)
    evidenceMap.set(event.call_id, rows)
  }

  const enriched = calls.map(call => {
    const createdMs = Date.parse(call.created_at)
    const endedMs = call.ended_at ? Date.parse(call.ended_at) : NaN
    const callEvents = (evidenceMap.get(call.id) ?? []).filter(event => {
      const at = Date.parse(event.at)
      return Number.isFinite(at) && at >= createdMs && at <= nowMs
        && (!Number.isFinite(endedMs) || at <= endedMs)
    })
    const mediaTimes = callEvents.filter(event => MEDIA_EVENTS.has(event.type))
      .map(event => Date.parse(event.at))
    const startedMs = mediaTimes.length ? Math.min(...mediaTimes) : NaN
    const participants = new Set<string>()
    for (const event of callEvents) {
      const inner = event.payload?.payload
      const nested = inner && typeof inner === 'object' ? inner as Record<string, unknown> : null
      const role = nested?.userType ?? event.payload?.userType
      if (typeof role === 'string') participants.add(role)
    }
    const stale = OPEN_STATUSES.has(call.status) && (
      Number.isFinite(endedMs) || nowMs - createdMs > DAY_MS
    )
    const isTest = /(^|[-_])(test|instrumented|smoke|e2e)([-_]|$)/i.test(call.room_id)
    const elapsedMs = endedMs - startedMs
    let issue: string | null = null
    if (isTest) issue = 'Registro de prueba'
    else if (call.status !== 'ended') issue = stale ? 'Sin cierre confirmado' : 'Sin finalización'
    else if (!Number.isFinite(startedMs)) issue = 'Sin evidencia de conexión'
    else if (!Number.isFinite(endedMs) || endedMs > nowMs || elapsedMs < 0) issue = 'Fechas inconsistentes'
    else if (elapsedMs > MAX_RECORDED_DURATION_MS) issue = 'Duración superior a 4 h: revisar cierre'
    return {
      ...call,
      status: stale ? 'stale' : call.status,
      stored_status: call.status,
      doctor_joined: participants.has('doctor') ? true as const : null,
      patient_joined: participants.has('patient') ? true as const : null,
      duration_seconds: issue === null ? Math.round(elapsedMs / 1000) : null,
      duration_issue: issue,
      is_test: isTest,
      connection_recorded: mediaTimes.length > 0,
    }
  })
  const durations = enriched.flatMap(call => call.duration_seconds === null ? [] : [call.duration_seconds])
  const byStatus = enriched.reduce<Record<string, number>>((counts, call) => {
    counts[call.status] = (counts[call.status] ?? 0) + 1
    return counts
  }, {})
  const chronological = [...enriched].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const inWindow = (call: CallRow, days: number): boolean => {
    const created = Date.parse(call.created_at)
    return created >= nowMs - days * DAY_MS && created <= nowMs
  }
  return {
    stats: {
      totalCalls: calls.length,
      calls24h: calls.filter(call => inWindow(call, 1)).length,
      calls7d: calls.filter(call => inWindow(call, 7)).length,
      connected: enriched.filter(call => call.connection_recorded).length,
      failed: calls.filter(call => ['failed', 'canceled', 'declined'].includes(call.status)).length,
      avgDurationSeconds: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      durationSampleCount: durations.length,
      durationExcludedCount: calls.filter(call => call.status === 'ended').length - durations.length,
      staleCalls: byStatus.stale ?? 0,
      testCalls: enriched.filter(call => call.is_test).length,
      lastCallAt: chronological[0]?.created_at ?? null,
      byStatus,
    },
    recentCalls: chronological.slice(0, 50),
    generatedAt: now.toISOString(),
  }
}

export const telemedicineStatsService = {
  verifyAdmin: telemedicineStatsRepository.verifyAdmin,
  async getStats(admin: SupabaseClient): Promise<TelemedicineStatsResult> {
    const now = new Date()
    const cutoff = now.toISOString()
    const [calls, evidence, eventsByType] = await Promise.all([
      telemedicineStatsRepository.getCalls(admin, cutoff),
      telemedicineStatsRepository.getEvidence(admin, cutoff),
      telemedicineStatsRepository.getEventCounts(admin, new Date(now.getTime() - DAY_MS).toISOString(), cutoff),
    ])
    return { ...computeTelemedicineStats(calls, evidence, now), eventsByType }
  },
}
