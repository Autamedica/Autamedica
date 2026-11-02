import type { CallProvider } from '../providers/types'

const REPORT_INTERVAL_MS = 15_000
type WriteEvent = (
  type: string,
  payload: Record<string, unknown>
) => Promise<void>

/** Authenticated call_events transport is supplied by the caller. No raw RTC stats leave here. */
export function attachQualityTelemetry(
  client: CallProvider,
  write: WriteEvent,
  scope: 'client_to_sfu' | 'peer_to_peer'
): () => void {
  const reportSessionId = crypto.randomUUID()
  const lastReport = new Map<string, number>()
  const persist = (type: string, payload: Record<string, unknown>) => {
    // Diagnostics must never interrupt media or produce an unhandled rejection.
    void write(type, {
      ...payload,
      scope,
      reportSessionId,
      source: 'client_reported',
      schemaVersion: 1,
    }).catch(() => {})
  }
  const unsubs = [
    client.on('quality-report', (metrics) => {
      const now = Date.now()
      const previous = lastReport.get(metrics.userId)
      if (previous !== undefined && now - previous < REPORT_INTERVAL_MS) return
      lastReport.set(metrics.userId, now)
      persist('quality_report', {
        peerId: metrics.userId,
        level: metrics.level,
        sampledAt: metrics.timestamp,
        inboundAudioBitrateKbps: metrics.inboundAudioBitrateKbps,
        outboundAudioBitrateKbps: metrics.outboundAudioBitrateKbps,
        inboundVideoBitrateKbps: metrics.inboundVideoBitrateKbps,
        outboundVideoBitrateKbps: metrics.outboundVideoBitrateKbps,
        packetsLostPct: metrics.packetsLostPct,
        jitterMs: metrics.jitterMs,
        roundTripTimeMs: metrics.roundTripTimeMs,
        framesPerSecond: metrics.framesPerSecond,
        freezeCount: metrics.freezeCount,
        totalFreezesDurationMs: metrics.totalFreezesDurationMs,
      })
    }),
    client.on('call-quality-summary', (summary) => {
      persist('call_quality_summary', {
        totalDurationMs: summary.totalDurationMs,
        qualityBreakdown: summary.qualityBreakdown,
        worstMetrics: summary.worstMetrics,
        averageMetrics: summary.averageMetrics,
      })
    }),
  ]
  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}
