/** Pure scoring functions for WebRTC quality assessment. */

import type { StreamQualityLevel, StreamQualityMetrics } from './types'

const QUALITY_SCORE_TO_LEVEL: StreamQualityLevel[] = ['poor', 'fair', 'good', 'excellent']

/**
 * Estimate Mean Opinion Score (1.0-4.5) using simplified E-model (ITU-T G.107).
 */
export function computeMOS(rttMs: number | null, jitterMs: number | null, lossPct: number | null): number | null {
  if (rttMs === null && jitterMs === null && lossPct === null) return null

  const rtt = rttMs ?? 0
  const jitter = jitterMs ?? 0
  const loss = lossPct ?? 0

  const effectiveLatency = (rtt / 2) + jitter * 2 + 10
  let r = 93.2 - effectiveLatency / 40
  r -= loss * 2.5
  r = Math.max(0, Math.min(r, 100))

  if (r < 0) return 1.0
  if (r > 100) return 4.5
  const mos = 1 + 0.035 * r + r * (r - 60) * (100 - r) * 7e-6
  return Math.round(mos * 10) / 10
}

export function scoreInboundBitrate(kbps: number): number {
  if (kbps >= 1800) return 3
  if (kbps >= 1000) return 2
  if (kbps >= 450) return 1
  return 0
}

export function scoreFps(fps: number): number {
  if (fps >= 24) return 3
  if (fps >= 15) return 2
  if (fps >= 8) return 1
  return 0
}

export function scorePacketLoss(packetsLostPct: number): number {
  if (packetsLostPct <= 1) return 3
  if (packetsLostPct <= 3) return 2
  if (packetsLostPct <= 6) return 1
  return 0
}

export function scoreRoundTripTime(roundTripTimeMs: number): number {
  if (roundTripTimeMs <= 120) return 3
  if (roundTripTimeMs <= 220) return 2
  if (roundTripTimeMs <= 350) return 1
  return 0
}

export function scoreJitter(jitterMs: number): number {
  if (jitterMs <= 20) return 3
  if (jitterMs <= 40) return 2
  if (jitterMs <= 70) return 1
  return 0
}

export function levelToScore(level: StreamQualityLevel): number {
  switch (level) {
    case 'excellent': return 3
    case 'good': return 2
    case 'fair': return 1
    case 'poor': return 0
    default: return -1
  }
}

export function classifyQualityLevel(metrics: Omit<StreamQualityMetrics, 'userId' | 'timestamp' | 'level'>): StreamQualityLevel {
  const scores: number[] = []
  const hasRenderableVideoStats =
    metrics.framesPerSecond !== null || metrics.frameWidth !== null || metrics.frameHeight !== null

  if (metrics.inboundVideoBitrateKbps !== null && hasRenderableVideoStats) {
    scores.push(scoreInboundBitrate(metrics.inboundVideoBitrateKbps))
  }
  if (metrics.framesPerSecond !== null) scores.push(scoreFps(metrics.framesPerSecond))
  if (metrics.packetsLostPct !== null) scores.push(scorePacketLoss(metrics.packetsLostPct))
  if (metrics.roundTripTimeMs !== null) scores.push(scoreRoundTripTime(metrics.roundTripTimeMs))
  if (metrics.jitterMs !== null) scores.push(scoreJitter(metrics.jitterMs))

  if (scores.length === 0) return 'unknown'

  const worstScore = Math.min(...scores)
  return QUALITY_SCORE_TO_LEVEL[worstScore] ?? 'unknown'
}

export function getOverallQualityLevel(peers: StreamQualityMetrics[]): StreamQualityLevel {
  let worstScore = 4

  for (const peer of peers) {
    const score = levelToScore(peer.level)
    if (score >= 0) worstScore = Math.min(worstScore, score)
  }

  if (worstScore > 3) return 'unknown'
  return QUALITY_SCORE_TO_LEVEL[worstScore] ?? 'unknown'
}
