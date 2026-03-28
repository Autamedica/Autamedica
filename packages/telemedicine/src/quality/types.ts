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
