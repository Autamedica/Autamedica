/**
 * Call Log Collector — subscribes to a CallLogger and aggregates data
 * into a structured CallSummary when the call ends.
 */

import type { CallLogger, CallLogEntry, CallLogCategory } from './call-logger'

export interface ParticipantInfo {
  userId: string
  role: string
  joinedAt: string
  leftAt: string
}

export interface QualityTimelineEntry {
  timestamp: string
  level: string
}

export interface EventTimelineEntry {
  timestamp: string
  event: string
  category: CallLogCategory
}

export interface CallMetrics {
  avgBitrateKbps: number
  avgPacketLoss: number
  avgRttMs: number
  qualityDistribution: { excellent: number; good: number; fair: number; poor: number }
  iceRestarts: number
  turnUsed: boolean
  autoDowngraded: boolean
}

export interface CallSummary {
  callId: string
  roomId: string
  startedAt: string
  endedAt: string
  durationMs: number
  participants: ParticipantInfo[]
  qualityTimeline: QualityTimelineEntry[]
  events: EventTimelineEntry[]
  outcome: 'completed' | 'failed' | 'dropped' | 'cancelled'
  failureReason?: string
  metrics: CallMetrics
}

export interface CallLogCollector {
  getSummary(): CallSummary
  dispose(): void
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function createCallLogCollector(logger: CallLogger): CallLogCollector {
  const entries: CallLogEntry[] = []
  const qualityTimeline: QualityTimelineEntry[] = []
  const participants = new Map<string, ParticipantInfo>()

  // Quality metric accumulators
  const bitrateValues: number[] = []
  const packetLossValues: number[] = []
  const rttValues: number[] = []
  const qualitySamples: string[] = []

  let iceRestarts = 0
  let turnUsed = false
  let autoDowngraded = false
  let startedAt = ''
  let endedAt = ''
  let outcome: CallSummary['outcome'] = 'completed'
  let failureReason: string | undefined

  const unsubscribe = logger.subscribe((entry) => {
    entries.push(entry)

    if (!startedAt) {
      startedAt = entry.timestamp
    }
    endedAt = entry.timestamp

    // Track participants
    if (entry.event === 'user_joined' || entry.event === 'peer_connected') {
      const peerUserId = (entry.data?.peerId as string) ?? (entry.data?.userId as string)
      if (peerUserId && !participants.has(peerUserId)) {
        participants.set(peerUserId, {
          userId: peerUserId,
          role: (entry.data?.role as string) ?? 'unknown',
          joinedAt: entry.timestamp,
          leftAt: '',
        })
      }
    }

    if (entry.event === 'user_left') {
      const peerUserId = (entry.data?.peerId as string) ?? (entry.data?.userId as string)
      if (peerUserId) {
        const p = participants.get(peerUserId)
        if (p) p.leftAt = entry.timestamp
      }
    }

    // Track quality reports
    if (entry.event === 'quality_report' && entry.data) {
      const level = entry.data.level as string
      if (level && level !== 'unknown') {
        qualityTimeline.push({ timestamp: entry.timestamp, level })
        qualitySamples.push(level)
      }
      if (typeof entry.data.bitrateKbps === 'number') bitrateValues.push(entry.data.bitrateKbps)
      if (typeof entry.data.inboundVideoBitrateKbps === 'number') bitrateValues.push(entry.data.inboundVideoBitrateKbps)
      if (typeof entry.data.packetLoss === 'number') packetLossValues.push(entry.data.packetLoss)
      if (typeof entry.data.packetsLostPct === 'number') packetLossValues.push(entry.data.packetsLostPct)
      if (typeof entry.data.rttMs === 'number') rttValues.push(entry.data.rttMs)
      if (typeof entry.data.roundTripTimeMs === 'number') rttValues.push(entry.data.roundTripTimeMs)
    }

    // ICE restarts
    if (entry.event === 'ice_restart' || entry.event === 'ice_restart_attempted') {
      iceRestarts++
    }

    // TURN usage
    if (entry.event === 'turn_refresh' || entry.event === 'turn_used' || entry.category === 'turn') {
      turnUsed = true
    }

    // Auto downgrade
    if (entry.event === 'audio_only_fallback' || entry.event === 'quality_downgraded') {
      autoDowngraded = true
    }

    // Failure detection
    if (entry.level === 'error' && entry.category === 'lifecycle') {
      outcome = 'failed'
      failureReason = (entry.data?.reason as string) ?? entry.event
    }

    if (entry.event === 'call_dropped' || entry.event === 'connection_lost') {
      outcome = 'dropped'
      failureReason = entry.event
    }

    if (entry.event === 'call_cancelled') {
      outcome = 'cancelled'
    }
  })

  function computeQualityDistribution(): CallMetrics['qualityDistribution'] {
    const dist = { excellent: 0, good: 0, fair: 0, poor: 0 }
    const total = qualitySamples.length
    if (total === 0) return dist

    for (const sample of qualitySamples) {
      if (sample in dist) {
        dist[sample as keyof typeof dist]++
      }
    }

    return {
      excellent: round2((dist.excellent / total) * 100),
      good: round2((dist.good / total) * 100),
      fair: round2((dist.fair / total) * 100),
      poor: round2((dist.poor / total) * 100),
    }
  }

  return {
    getSummary(): CallSummary {
      const ctx = logger.getContext()
      const start = startedAt || new Date().toISOString()
      const end = endedAt || new Date().toISOString()
      const durationMs = new Date(end).getTime() - new Date(start).getTime()

      // Fill leftAt for participants still in call
      for (const [, p] of participants) {
        if (!p.leftAt) p.leftAt = end
      }

      return {
        callId: ctx.callId,
        roomId: ctx.roomId,
        startedAt: start,
        endedAt: end,
        durationMs: Math.max(0, durationMs),
        participants: Array.from(participants.values()),
        qualityTimeline,
        events: entries
          .filter((e) => e.level !== 'debug')
          .map((e) => ({ timestamp: e.timestamp, event: e.event, category: e.category })),
        outcome,
        failureReason,
        metrics: {
          avgBitrateKbps: round2(mean(bitrateValues)),
          avgPacketLoss: round2(mean(packetLossValues)),
          avgRttMs: round2(mean(rttValues)),
          qualityDistribution: computeQualityDistribution(),
          iceRestarts,
          turnUsed,
          autoDowngraded,
        },
      }
    },
    dispose() {
      unsubscribe()
    },
  }
}
