export type StreamQualityLevel = 'unknown' | 'excellent' | 'good' | 'fair' | 'poor'

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
  mosScore: number | null
  /** Ratio of concealed (PLC-generated) audio samples to total. Higher = more glitches heard. */
  concealedSamplesRatio: number | null
  /** Number of video freeze events since last sample. */
  freezeCount: number | null
  /** Total freeze duration in ms since last sample. */
  totalFreezesDurationMs: number | null
  /** Remote audio level (0-1). Near-zero for extended period = patient may be muted/silent. */
  remoteAudioLevel: number | null
}

export interface StreamQualitySummary {
  roomId: string
  overallLevel: StreamQualityLevel
  peers: StreamQualityMetrics[]
}

export interface PeerStatsSample {
  timestampMs: number
  outboundVideoBytes: number
  outboundAudioBytes: number
  inboundVideoBytes: number
  inboundAudioBytes: number
  packetsLost: number
  packetsReceived: number
}


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

