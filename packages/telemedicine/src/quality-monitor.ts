/**
 * Quality Monitor for WebRTC streams.
 * Extracted from WebRTCClient to isolate quality metrics collection,
 * scoring, and reporting into a single-responsibility class.
 */

export type StreamQualityLevel = 'unknown' | 'excellent' | 'good' | 'fair' | 'poor'

export interface CallQualityTimelineEntry {
  timestamp: number
  level: StreamQualityLevel
  durationMs: number
}

export interface CallQualityAverageMetrics {
  packetsLostPct: number | null
  jitterMs: number | null
  roundTripTimeMs: number | null
  inboundVideoBitrateKbps: number | null
}

export interface CallQualityWorstMetrics {
  packetsLostPct: number | null
  jitterMs: number | null
  roundTripTimeMs: number | null
  inboundVideoBitrateKbps: number | null
  framesPerSecond: number | null
}

export interface CallQualitySummary {
  totalDurationMs: number
  qualityBreakdown: Record<StreamQualityLevel, number>
  timeline: CallQualityTimelineEntry[]
  worstMetrics: CallQualityWorstMetrics
  averageMetrics: CallQualityAverageMetrics
  iceRestartCount: number
  audioOnlyPeriods: number
}

export interface StreamQualityMetrics {
  userId: string
  level: StreamQualityLevel
  timestamp: number
  outboundVideoBitrateKbps: number | null
  outboundAudioBitrateKbps: number | null
  inboundVideoBitrateKbps: number | null
  inboundAudioBitrateKbps: number | null
  packetsLostPct: number | null
  jitterMs: number | null
  roundTripTimeMs: number | null
  framesPerSecond: number | null
  frameWidth: number | null
  frameHeight: number | null
  availableOutgoingBitrateKbps: number | null
}

export interface StreamQualitySummary {
  roomId: string
  overallLevel: StreamQualityLevel
  peers: StreamQualityMetrics[]
}

interface PeerStatsSample {
  timestampMs: number
  outboundVideoBytes: number
  outboundAudioBytes: number
  inboundVideoBytes: number
  inboundAudioBytes: number
  packetsLost: number
  packetsReceived: number
}

interface QualityLogger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
}

const QUALITY_POLL_INTERVAL_MS = 5000
const QUALITY_LOG_INTERVAL_MS = 30000
const QUALITY_SCORE_TO_LEVEL: StreamQualityLevel[] = ['poor', 'fair', 'good', 'excellent']

export class QualityMonitor {
  private qualityInterval: ReturnType<typeof setInterval> | null = null
  private peerStatsSamples = new Map<string, PeerStatsSample>()
  private latestQualityByPeer = new Map<string, StreamQualityMetrics>()
  private qualityLogState = new Map<string, { level: StreamQualityLevel; at: number }>()

  private peerConnections: Map<string, { pc: RTCPeerConnection }> = new Map()
  private readonly logger: QualityLogger
  private readonly roomId: string
  private callLogger?: import('./logging/call-logger').CallLogger
  onQualitySummary: ((summary: StreamQualitySummary) => void) | null = null

  // --- call summary tracking ---
  private monitoringStartedAt: number | null = null
  private summaryTimeline: CallQualityTimelineEntry[] = []
  private lastOverallLevel: StreamQualityLevel = 'unknown'
  private lastLevelTimestamp: number = 0
  private audioOnlyPeriodCount = 0

  // Running worst metrics (worst = highest loss/jitter/rtt, lowest bitrate/fps)
  private worstPacketsLostPct: number | null = null
  private worstJitterMs: number | null = null
  private worstRoundTripTimeMs: number | null = null
  private worstInboundVideoBitrateKbps: number | null = null
  private worstFramesPerSecond: number | null = null

  // Running sums for averages
  private sumPacketsLostPct = 0
  private sumJitterMs = 0
  private sumRoundTripTimeMs = 0
  private sumInboundVideoBitrateKbps = 0
  private countPacketsLostPct = 0
  private countJitterMs = 0
  private countRoundTripTimeMs = 0
  private countInboundVideoBitrateKbps = 0

  constructor(opts: { logger: QualityLogger; roomId: string; callLogger?: import('./logging/call-logger').CallLogger }) {
    this.logger = opts.logger
    this.roomId = opts.roomId
    this.callLogger = opts.callLogger
  }

  start(peerConnections: Map<string, { pc: RTCPeerConnection }>): void {
    this.peerConnections = peerConnections

    if (this.qualityInterval) {
      return
    }

    this.monitoringStartedAt = Date.now()
    this.lastLevelTimestamp = this.monitoringStartedAt
    this.lastOverallLevel = 'unknown'

    const collect = () => {
      void this.collectQualityMetrics()
    }

    collect()
    this.qualityInterval = setInterval(collect, QUALITY_POLL_INTERVAL_MS)
  }

  stop(): void {
    if (!this.qualityInterval) {
      return
    }

    clearInterval(this.qualityInterval)
    this.qualityInterval = null
  }

  clearState(): void {
    this.peerStatsSamples.clear()
    this.latestQualityByPeer.clear()
    this.qualityLogState.clear()
    this.resetSummaryState()
  }

  private resetSummaryState(): void {
    this.monitoringStartedAt = null
    this.summaryTimeline = []
    this.lastOverallLevel = 'unknown'
    this.lastLevelTimestamp = 0
    this.audioOnlyPeriodCount = 0
    this.worstPacketsLostPct = null
    this.worstJitterMs = null
    this.worstRoundTripTimeMs = null
    this.worstInboundVideoBitrateKbps = null
    this.worstFramesPerSecond = null
    this.sumPacketsLostPct = 0
    this.sumJitterMs = 0
    this.sumRoundTripTimeMs = 0
    this.sumInboundVideoBitrateKbps = 0
    this.countPacketsLostPct = 0
    this.countJitterMs = 0
    this.countRoundTripTimeMs = 0
    this.countInboundVideoBitrateKbps = 0
  }

  deletePeer(userId: string): void {
    this.peerStatsSamples.delete(userId)
    this.latestQualityByPeer.delete(userId)
    this.qualityLogState.delete(userId)
  }

  /** Trigger an immediate collection pass (e.g. when a new peer joins). */
  collectNow(): void {
    void this.collectQualityMetrics()
  }

  /** Call from outside when an audio-only fallback occurs. */
  recordAudioOnlyFallback(): void {
    this.audioOnlyPeriodCount++
  }

  /**
   * Returns an aggregated quality summary for the entire call.
   * Call this before cleanup/clearState — it's a snapshot.
   */
  getCallSummary(iceRestartCount = 0): CallQualitySummary {
    const now = Date.now()
    const totalDurationMs = this.monitoringStartedAt ? now - this.monitoringStartedAt : 0

    // Finalize the current level's duration into the timeline
    const timeline = [...this.summaryTimeline]
    if (this.lastLevelTimestamp > 0 && totalDurationMs > 0) {
      timeline.push({
        timestamp: this.lastLevelTimestamp,
        level: this.lastOverallLevel,
        durationMs: now - this.lastLevelTimestamp,
      })
    }

    // Build quality breakdown (percentage of time at each level)
    const breakdown: Record<StreamQualityLevel, number> = {
      unknown: 0,
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    }

    if (totalDurationMs > 0) {
      for (const entry of timeline) {
        breakdown[entry.level] += entry.durationMs
      }
      for (const level of Object.keys(breakdown) as StreamQualityLevel[]) {
        breakdown[level] = Math.round((breakdown[level] / totalDurationMs) * 10000) / 100
      }
    }

    const avg = (sum: number, count: number): number | null =>
      count > 0 ? Math.round((sum / count) * 100) / 100 : null

    return {
      totalDurationMs,
      qualityBreakdown: breakdown,
      timeline,
      worstMetrics: {
        packetsLostPct: this.worstPacketsLostPct,
        jitterMs: this.worstJitterMs,
        roundTripTimeMs: this.worstRoundTripTimeMs,
        inboundVideoBitrateKbps: this.worstInboundVideoBitrateKbps,
        framesPerSecond: this.worstFramesPerSecond,
      },
      averageMetrics: {
        packetsLostPct: avg(this.sumPacketsLostPct, this.countPacketsLostPct),
        jitterMs: avg(this.sumJitterMs, this.countJitterMs),
        roundTripTimeMs: avg(this.sumRoundTripTimeMs, this.countRoundTripTimeMs),
        inboundVideoBitrateKbps: avg(this.sumInboundVideoBitrateKbps, this.countInboundVideoBitrateKbps),
      },
      iceRestartCount,
      audioOnlyPeriods: this.audioOnlyPeriodCount,
    }
  }

  /** Update worst and running-average trackers from a single peer's metrics. */
  private updateSummaryMetrics(metrics: StreamQualityMetrics): void {
    // Worst: higher is worse for loss/jitter/rtt, lower is worse for bitrate/fps
    if (metrics.packetsLostPct !== null) {
      this.worstPacketsLostPct = Math.max(this.worstPacketsLostPct ?? -Infinity, metrics.packetsLostPct)
      this.sumPacketsLostPct += metrics.packetsLostPct
      this.countPacketsLostPct++
    }
    if (metrics.jitterMs !== null) {
      this.worstJitterMs = Math.max(this.worstJitterMs ?? -Infinity, metrics.jitterMs)
      this.sumJitterMs += metrics.jitterMs
      this.countJitterMs++
    }
    if (metrics.roundTripTimeMs !== null) {
      this.worstRoundTripTimeMs = Math.max(this.worstRoundTripTimeMs ?? -Infinity, metrics.roundTripTimeMs)
      this.sumRoundTripTimeMs += metrics.roundTripTimeMs
      this.countRoundTripTimeMs++
    }
    if (metrics.inboundVideoBitrateKbps !== null) {
      this.worstInboundVideoBitrateKbps =
        this.worstInboundVideoBitrateKbps === null
          ? metrics.inboundVideoBitrateKbps
          : Math.min(this.worstInboundVideoBitrateKbps, metrics.inboundVideoBitrateKbps)
      this.sumInboundVideoBitrateKbps += metrics.inboundVideoBitrateKbps
      this.countInboundVideoBitrateKbps++
    }
    if (metrics.framesPerSecond !== null) {
      this.worstFramesPerSecond =
        this.worstFramesPerSecond === null
          ? metrics.framesPerSecond
          : Math.min(this.worstFramesPerSecond, metrics.framesPerSecond)
    }
  }

  /** Record a quality level transition in the timeline. */
  private recordLevelTransition(newLevel: StreamQualityLevel): void {
    const now = Date.now()
    if (this.lastLevelTimestamp > 0) {
      this.summaryTimeline.push({
        timestamp: this.lastLevelTimestamp,
        level: this.lastOverallLevel,
        durationMs: now - this.lastLevelTimestamp,
      })
    }
    this.lastOverallLevel = newLevel
    this.lastLevelTimestamp = now
  }

  // --- stat extraction helpers ---

  private getStatNumber(stat: RTCStats, key: string): number | null {
    const value = (stat as unknown as Record<string, unknown>)[key]
    return typeof value === 'number' ? value : null
  }

  private getStatString(stat: RTCStats, key: string): string | null {
    const value = (stat as unknown as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : null
  }

  private getStatBoolean(stat: RTCStats, key: string): boolean | null {
    const value = (stat as unknown as Record<string, unknown>)[key]
    return typeof value === 'boolean' ? value : null
  }

  private getStatKind(stat: RTCStats): 'audio' | 'video' | null {
    const kind = this.getStatString(stat, 'kind') ?? this.getStatString(stat, 'mediaType')
    if (kind === 'audio' || kind === 'video') {
      return kind
    }
    return null
  }

  private computeBitrateKbps(currentBytes: number, previousBytes: number, elapsedMs: number): number | null {
    if (elapsedMs <= 0 || currentBytes < previousBytes) {
      return null
    }
    return ((currentBytes - previousBytes) * 8) / elapsedMs
  }

  private roundMetric(value: number | null, digits = 1): number | null {
    if (value === null || Number.isNaN(value)) {
      return null
    }

    const factor = 10 ** digits
    return Math.round(value * factor) / factor
  }

  // --- scoring helpers ---

  private scoreInboundBitrate(kbps: number): number {
    if (kbps >= 1800) return 3
    if (kbps >= 1000) return 2
    if (kbps >= 450) return 1
    return 0
  }

  private scoreFps(fps: number): number {
    if (fps >= 24) return 3
    if (fps >= 15) return 2
    if (fps >= 8) return 1
    return 0
  }

  private scorePacketLoss(packetsLostPct: number): number {
    if (packetsLostPct <= 1) return 3
    if (packetsLostPct <= 3) return 2
    if (packetsLostPct <= 6) return 1
    return 0
  }

  private scoreRoundTripTime(roundTripTimeMs: number): number {
    if (roundTripTimeMs <= 120) return 3
    if (roundTripTimeMs <= 220) return 2
    if (roundTripTimeMs <= 350) return 1
    return 0
  }

  private scoreJitter(jitterMs: number): number {
    if (jitterMs <= 20) return 3
    if (jitterMs <= 40) return 2
    if (jitterMs <= 70) return 1
    return 0
  }

  private levelToScore(level: StreamQualityLevel): number {
    switch (level) {
      case 'excellent':
        return 3
      case 'good':
        return 2
      case 'fair':
        return 1
      case 'poor':
        return 0
      default:
        return -1
    }
  }

  // --- classification ---

  private classifyQualityLevel(metrics: Omit<StreamQualityMetrics, 'userId' | 'timestamp' | 'level'>): StreamQualityLevel {
    const scores: number[] = []
    const hasRenderableVideoStats =
      metrics.framesPerSecond !== null || metrics.frameWidth !== null || metrics.frameHeight !== null

    if (metrics.inboundVideoBitrateKbps !== null && hasRenderableVideoStats) {
      scores.push(this.scoreInboundBitrate(metrics.inboundVideoBitrateKbps))
    }
    if (metrics.framesPerSecond !== null) {
      scores.push(this.scoreFps(metrics.framesPerSecond))
    }
    if (metrics.packetsLostPct !== null) {
      scores.push(this.scorePacketLoss(metrics.packetsLostPct))
    }
    if (metrics.roundTripTimeMs !== null) {
      scores.push(this.scoreRoundTripTime(metrics.roundTripTimeMs))
    }
    if (metrics.jitterMs !== null) {
      scores.push(this.scoreJitter(metrics.jitterMs))
    }

    if (scores.length === 0) {
      return 'unknown'
    }

    const worstScore = Math.min(...scores)
    return QUALITY_SCORE_TO_LEVEL[worstScore] ?? 'unknown'
  }

  private getOverallQualityLevel(peers: StreamQualityMetrics[]): StreamQualityLevel {
    let worstScore = 4

    for (const peer of peers) {
      const score = this.levelToScore(peer.level)
      if (score >= 0) {
        worstScore = Math.min(worstScore, score)
      }
    }

    if (worstScore > 3) {
      return 'unknown'
    }

    return QUALITY_SCORE_TO_LEVEL[worstScore] ?? 'unknown'
  }

  // --- logging ---

  private maybeLogPeerQuality(metrics: StreamQualityMetrics): void {
    const previous = this.qualityLogState.get(metrics.userId)
    const now = Date.now()
    const shouldLog =
      previous?.level !== metrics.level ||
      now - (previous?.at ?? 0) >= QUALITY_LOG_INTERVAL_MS

    if (!shouldLog) {
      return
    }

    this.qualityLogState.set(metrics.userId, { level: metrics.level, at: now })

    // Structured call logger: quality report every log interval, degraded/improved on level change
    if (this.callLogger) {
      this.callLogger.info('quality', 'quality_report', {
        peerId: metrics.userId,
        level: metrics.level,
        inboundVideoBitrateKbps: metrics.inboundVideoBitrateKbps,
        packetsLostPct: metrics.packetsLostPct,
        roundTripTimeMs: metrics.roundTripTimeMs,
        framesPerSecond: metrics.framesPerSecond,
      })
      if (previous && previous.level !== metrics.level) {
        const improved = this.levelToScore(metrics.level) > this.levelToScore(previous.level)
        this.callLogger[improved ? 'info' : 'warn'](
          'quality',
          improved ? 'quality_improved' : 'quality_degraded',
          { peerId: metrics.userId, from: previous.level, to: metrics.level },
        )
      }
    }

    this.logger.info('Stream quality sample', {
      peerId: metrics.userId,
      level: metrics.level,
      outboundVideoBitrateKbps: metrics.outboundVideoBitrateKbps,
      inboundVideoBitrateKbps: metrics.inboundVideoBitrateKbps,
      packetsLostPct: metrics.packetsLostPct,
      jitterMs: metrics.jitterMs,
      roundTripTimeMs: metrics.roundTripTimeMs,
      framesPerSecond: metrics.framesPerSecond,
      resolution:
        metrics.frameWidth !== null && metrics.frameHeight !== null
          ? `${metrics.frameWidth}x${metrics.frameHeight}`
          : null,
    })
  }

  // --- metrics collection ---

  private async buildPeerQualityMetrics(userId: string, pc: RTCPeerConnection): Promise<StreamQualityMetrics | null> {
    const stats = await pc.getStats()
    const now = Date.now()

    let outboundVideoBytes = 0
    let outboundAudioBytes = 0
    let inboundVideoBytes = 0
    let inboundAudioBytes = 0
    let packetsLost = 0
    let packetsReceived = 0
    let jitterMs: number | null = null
    let roundTripTimeMs: number | null = null
    let framesPerSecond: number | null = null
    let frameWidth: number | null = null
    let frameHeight: number | null = null
    let availableOutgoingBitrateKbps: number | null = null

    stats.forEach((stat) => {
      if (stat.type === 'outbound-rtp') {
        const kind = this.getStatKind(stat)
        const bytesSent = this.getStatNumber(stat, 'bytesSent')
        if (bytesSent !== null) {
          if (kind === 'video') {
            outboundVideoBytes += bytesSent
          } else if (kind === 'audio') {
            outboundAudioBytes += bytesSent
          }
        }
        return
      }

      if (stat.type === 'inbound-rtp') {
        const kind = this.getStatKind(stat)
        const bytesReceived = this.getStatNumber(stat, 'bytesReceived')
        if (bytesReceived !== null) {
          if (kind === 'video') {
            inboundVideoBytes += bytesReceived
          } else if (kind === 'audio') {
            inboundAudioBytes += bytesReceived
          }
        }

        if (kind === 'video') {
          const currentPacketsLost = this.getStatNumber(stat, 'packetsLost')
          const currentPacketsReceived = this.getStatNumber(stat, 'packetsReceived')
          const jitterSeconds = this.getStatNumber(stat, 'jitter')

          packetsLost += currentPacketsLost ?? 0
          packetsReceived += currentPacketsReceived ?? 0
          if (jitterSeconds !== null) {
            jitterMs = jitterSeconds * 1000
          }
        }
        return
      }

      if (stat.type === 'candidate-pair') {
        const selected = this.getStatBoolean(stat, 'selected')
        const nominated = this.getStatBoolean(stat, 'nominated')
        const state = this.getStatString(stat, 'state')

        if (selected === true || (nominated === true && state === 'succeeded')) {
          const rttSeconds = this.getStatNumber(stat, 'currentRoundTripTime')
          const availableOutgoingBitrate = this.getStatNumber(stat, 'availableOutgoingBitrate')

          if (rttSeconds !== null) {
            roundTripTimeMs = rttSeconds * 1000
          }
          if (availableOutgoingBitrate !== null) {
            availableOutgoingBitrateKbps = availableOutgoingBitrate / 1000
          }
        }
        return
      }

      if (stat.type === 'track') {
        const kind = this.getStatKind(stat)
        if (kind !== 'video') {
          return
        }

        const candidateFps = this.getStatNumber(stat, 'framesPerSecond')
        if (candidateFps !== null) {
          framesPerSecond = candidateFps
        }

        const candidateWidth = this.getStatNumber(stat, 'frameWidth')
        const candidateHeight = this.getStatNumber(stat, 'frameHeight')
        if (candidateWidth !== null) {
          frameWidth = candidateWidth
        }
        if (candidateHeight !== null) {
          frameHeight = candidateHeight
        }
      }
    })

    const previous = this.peerStatsSamples.get(userId)
    const elapsedMs = previous ? now - previous.timestampMs : 0

    const outboundVideoBitrateKbps =
      previous === undefined
        ? null
        : this.computeBitrateKbps(outboundVideoBytes, previous.outboundVideoBytes, elapsedMs)
    const outboundAudioBitrateKbps =
      previous === undefined
        ? null
        : this.computeBitrateKbps(outboundAudioBytes, previous.outboundAudioBytes, elapsedMs)
    const inboundVideoBitrateKbps =
      previous === undefined
        ? null
        : this.computeBitrateKbps(inboundVideoBytes, previous.inboundVideoBytes, elapsedMs)
    const inboundAudioBitrateKbps =
      previous === undefined
        ? null
        : this.computeBitrateKbps(inboundAudioBytes, previous.inboundAudioBytes, elapsedMs)

    let packetsLostPct: number | null = null
    if (previous) {
      const deltaLost = packetsLost - previous.packetsLost
      const deltaReceived = packetsReceived - previous.packetsReceived
      const deltaTotal = deltaLost + deltaReceived

      if (deltaTotal > 0 && deltaLost >= 0 && deltaReceived >= 0) {
        packetsLostPct = (deltaLost / deltaTotal) * 100
      }
    } else {
      const totalPackets = packetsLost + packetsReceived
      if (totalPackets > 0) {
        packetsLostPct = (packetsLost / totalPackets) * 100
      }
    }

    this.peerStatsSamples.set(userId, {
      timestampMs: now,
      outboundVideoBytes,
      outboundAudioBytes,
      inboundVideoBytes,
      inboundAudioBytes,
      packetsLost,
      packetsReceived,
    })

    const normalizedMetrics = {
      outboundVideoBitrateKbps: this.roundMetric(outboundVideoBitrateKbps),
      outboundAudioBitrateKbps: this.roundMetric(outboundAudioBitrateKbps),
      inboundVideoBitrateKbps: this.roundMetric(inboundVideoBitrateKbps),
      inboundAudioBitrateKbps: this.roundMetric(inboundAudioBitrateKbps),
      packetsLostPct: this.roundMetric(packetsLostPct, 2),
      jitterMs: this.roundMetric(jitterMs),
      roundTripTimeMs: this.roundMetric(roundTripTimeMs),
      framesPerSecond: this.roundMetric(framesPerSecond),
      frameWidth: frameWidth !== null ? Math.round(frameWidth) : null,
      frameHeight: frameHeight !== null ? Math.round(frameHeight) : null,
      availableOutgoingBitrateKbps: this.roundMetric(availableOutgoingBitrateKbps),
    }

    return {
      userId,
      level: this.classifyQualityLevel(normalizedMetrics),
      timestamp: now,
      ...normalizedMetrics,
    }
  }

  private async collectQualityMetrics(): Promise<void> {
    const peers: StreamQualityMetrics[] = []

    for (const [userId, peerState] of this.peerConnections) {
      if (peerState.pc.connectionState === 'closed') {
        continue
      }

      try {
        const metrics = await this.buildPeerQualityMetrics(userId, peerState.pc)
        if (!metrics) {
          continue
        }

        peers.push(metrics)
        this.latestQualityByPeer.set(userId, metrics)
        this.maybeLogPeerQuality(metrics)
      } catch (error) {
        this.logger.warn('Failed collecting stream quality stats', { peerId: userId, error: error as Record<string, unknown> })
      }
    }

    // Track per-sample metrics for call summary
    for (const metrics of peers) {
      this.updateSummaryMetrics(metrics)
    }

    const overallLevel = this.getOverallQualityLevel(peers)

    // Record timeline transition if level changed
    if (overallLevel !== this.lastOverallLevel) {
      this.recordLevelTransition(overallLevel)
    }

    this.onQualitySummary?.({
      roomId: this.roomId,
      overallLevel,
      peers,
    })
  }
}
