/**
 * BitrateAdapter — owns progressive bitrate ramping, quality limitation handling,
 * packet loss adaptation, and network change monitoring.
 * Extracted from WebRTCClient to isolate adaptive bitrate concerns.
 */

import type { createTelemedicineLogger } from './debug'
import type { StreamQualityLevel } from './quality-monitor'

// Progressive bitrate constants
export const INITIAL_VIDEO_BITRATE = 500_000   // Start conservative: 500kbps
export const TARGET_VIDEO_BITRATE = 2_500_000  // Ramp to 2.5Mbps for 720p quality
const BITRATE_RAMP_DURATION_MS = 10_000        // Over 10 seconds
const BITRATE_RAMP_INTERVAL_MS = 2_000         // Step every 2s

interface PeerConnectionMap {
  entries(): IterableIterator<[string, { pc: RTCPeerConnection; iceRestartCount: number }]>
}

export interface BitrateAdapterCallbacks {
  emit: (event: string, ...args: unknown[]) => void
}

export class BitrateAdapter {
  private bitrateRampInterval: ReturnType<typeof setInterval> | null = null
  private bitrateRampStartMs: number | null = null
  private networkChangeCleanup: (() => void) | null = null
  private onlineOfflineCleanup: (() => void) | null = null
  private lastBweAdjustMs = 0
  private lastQualityDegradationMs = 0

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
    private readonly callbacks: BitrateAdapterCallbacks,
  ) {}

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(message, { sessionId: this.sessionId, ...context })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(message, { sessionId: this.sessionId, ...context })
  }

  /** Gradually increase video bitrate from conservative to target */
  startBitrateRamp(peerConnections: PeerConnectionMap): void {
    if (this.bitrateRampInterval) return

    this.bitrateRampStartMs = Date.now()
    this.logInfo('Starting progressive bitrate ramp', {
      initial: INITIAL_VIDEO_BITRATE,
      target: TARGET_VIDEO_BITRATE,
      durationMs: BITRATE_RAMP_DURATION_MS,
    })

    this.bitrateRampInterval = setInterval(() => {
      if (!this.bitrateRampStartMs) {
        this.stopBitrateRamp()
        return
      }

      const elapsed = Date.now() - this.bitrateRampStartMs
      const progress = Math.min(elapsed / BITRATE_RAMP_DURATION_MS, 1)
      const currentBitrate = Math.round(
        INITIAL_VIDEO_BITRATE + (TARGET_VIDEO_BITRATE - INITIAL_VIDEO_BITRATE) * progress
      )

      for (const [, peerState] of peerConnections.entries()) {
        for (const sender of peerState.pc.getSenders()) {
          if (sender.track?.kind !== 'video') continue
          const params = sender.getParameters()
          if (params.encodings?.[0]) {
            params.encodings[0].maxBitrate = currentBitrate
            if (progress >= 0.5) {
              params.encodings[0].maxFramerate = 30
            }
            sender.setParameters(params).catch(() => { /* ignore */ })
          }
        }
      }

      if (progress >= 1) {
        this.logInfo('Bitrate ramp complete', { finalBitrate: currentBitrate })
        this.stopBitrateRamp()
      }
    }, BITRATE_RAMP_INTERVAL_MS)
  }

  stopBitrateRamp(): void {
    if (this.bitrateRampInterval) {
      clearInterval(this.bitrateRampInterval)
      this.bitrateRampInterval = null
    }
    this.bitrateRampStartMs = null
  }

  /** Reduce bitrate when encoder reports cpu or bandwidth limitation */
  handleQualityLimitation(peerId: string, pc: RTCPeerConnection, reason: string): void {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const current = params.encodings?.[0]?.maxBitrate
      if (!current || !params.encodings?.[0]) continue

      const reduced = reason === 'cpu'
        ? Math.max(current * 0.6, INITIAL_VIDEO_BITRATE)
        : Math.max(current * 0.75, INITIAL_VIDEO_BITRATE)

      if (reduced < current) {
        params.encodings[0].maxBitrate = Math.round(reduced)
        if (reason === 'cpu') {
          params.encodings[0].maxFramerate = 15
        }
        sender.setParameters(params).catch(() => { /* ignore */ })
        this.logInfo('Reduced bitrate due to quality limitation', {
          peerId,
          reason,
          fromKbps: Math.round(current / 1000),
          toKbps: Math.round(reduced / 1000),
        })
      }
    }
  }

  /** Reduce resolution when packet loss exceeds threshold */
  handlePacketLoss(peerId: string, pc: RTCPeerConnection, lossPct: number): void {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      if (!params.encodings?.[0]) continue

      if (lossPct > 10) {
        params.encodings[0].maxBitrate = Math.round(INITIAL_VIDEO_BITRATE * 0.5)
        params.encodings[0].maxFramerate = 15
        params.encodings[0].scaleResolutionDownBy = 2.0
      } else {
        params.encodings[0].maxBitrate = INITIAL_VIDEO_BITRATE
        params.encodings[0].maxFramerate = 20
        params.encodings[0].scaleResolutionDownBy = 1.5
      }

      sender.setParameters(params).catch(() => { /* ignore */ })
      this.logInfo('Reduced quality due to packet loss', {
        peerId,
        lossPct: Math.round(lossPct * 100) / 100,
        scaleDown: params.encodings[0].scaleResolutionDownBy,
      })
    }
  }

  /** Monitor network changes (WiFi→cellular etc) and adjust bitrate */
  startNetworkMonitoring(peerConnections: PeerConnectionMap): void {
    const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string; downlink?: number } }).connection
    if (!conn) return

    const handler = () => {
      const info = conn as { effectiveType?: string; downlink?: number }
      this.logInfo('Network change detected', { effectiveType: info.effectiveType, downlink: info.downlink })

      if (info.effectiveType === '2g' || info.effectiveType === '3g' || info.effectiveType === 'slow-2g') {
        this.stopBitrateRamp()
        for (const [, peerState] of peerConnections.entries()) {
          for (const sender of peerState.pc.getSenders()) {
            if (sender.track?.kind !== 'video') continue
            const params = sender.getParameters()
            if (params.encodings?.[0]) {
              params.encodings[0].maxBitrate = INITIAL_VIDEO_BITRATE
              params.encodings[0].maxFramerate = 15
              sender.setParameters(params).catch(() => { /* ignore */ })
            }
          }
        }
      }
    }

    conn.addEventListener('change', handler)
    this.networkChangeCleanup = () => conn.removeEventListener('change', handler)
  }

  /** Detect browser going offline/online and trigger reconnection */
  startOnlineOfflineMonitoring(peerConnections: PeerConnectionMap): void {
    if (typeof window === 'undefined') return

    const onOffline = () => {
      this.logWarn('Browser went offline')
      this.callbacks.emit('error', new Error('network_offline'))
    }

    const onOnline = () => {
      this.logInfo('Browser came back online, restarting ICE for all peers')
      for (const [peerId, peerState] of peerConnections.entries()) {
        peerState.iceRestartCount = 0
        peerState.pc.restartIce()
        this.logInfo('ICE restart triggered after online recovery', { peerId })
      }
      this.stopBitrateRamp()
      this.startBitrateRamp(peerConnections)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    this.onlineOfflineCleanup = () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }

  /** Proactively adjust bitrate based on browser's bandwidth estimate */
  adaptToBandwidthEstimate(peerConnections: PeerConnectionMap, availableBitrateKbps: number): void {
    const now = Date.now()
    if (now - this.lastBweAdjustMs < 3_000) return
    this.lastBweAdjustMs = now

    // Cap at 85% of available to leave headroom for audio + overhead
    const targetBps = Math.round(availableBitrateKbps * 1000 * 0.85)
    // Never go below the floor
    const cappedBps = Math.max(targetBps, INITIAL_VIDEO_BITRATE)

    for (const [peerId, peerState] of peerConnections.entries()) {
      for (const sender of peerState.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        const current = params.encodings?.[0]?.maxBitrate
        if (!current || !params.encodings?.[0]) continue

        // Only reduce — don't increase beyond what the ramp would set
        if (current > cappedBps) {
          params.encodings[0].maxBitrate = cappedBps
          sender.setParameters(params).catch(() => { /* ignore */ })
          this.logInfo('BWE adaptation: capped bitrate to available bandwidth', {
            peerId,
            availableKbps: Math.round(availableBitrateKbps),
            fromKbps: Math.round(current / 1000),
            toKbps: Math.round(cappedBps / 1000),
          })
        }
      }
    }
  }

  /** Proactively reduce bitrate when quality metrics indicate trouble, BEFORE packet loss spikes */
  handleQualityDegradation(
    peerConnections: PeerConnectionMap,
    level: StreamQualityLevel,
    metrics: { packetsLostPct: number | null; roundTripTimeMs: number | null },
  ): void {
    if (level === 'excellent' || level === 'good' || level === 'unknown') return

    const now = Date.now()
    if (now - this.lastQualityDegradationMs < 3_000) return
    this.lastQualityDegradationMs = now

    const isFair = level === 'fair'
    const isPoor = level === 'poor'

    // Fair: preemptive reduction when early warning signs present
    const fairWarning = isFair && (
      (metrics.packetsLostPct !== null && metrics.packetsLostPct >= 3 && metrics.packetsLostPct <= 6) ||
      (metrics.roundTripTimeMs !== null && metrics.roundTripTimeMs >= 220 && metrics.roundTripTimeMs <= 350)
    )

    if (!fairWarning && !isPoor) return

    const factor = isPoor ? 0.4 : 0.7

    for (const [peerId, peerState] of peerConnections.entries()) {
      for (const sender of peerState.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        const current = params.encodings?.[0]?.maxBitrate
        if (!current || !params.encodings?.[0]) continue

        const reduced = Math.max(Math.round(current * factor), INITIAL_VIDEO_BITRATE)
        if (reduced < current) {
          params.encodings[0].maxBitrate = reduced
          if (isPoor) {
            params.encodings[0].maxFramerate = 15
          }
          sender.setParameters(params).catch(() => { /* ignore */ })
          this.logWarn('Quality degradation: preemptive bitrate reduction', {
            peerId,
            level,
            packetsLostPct: metrics.packetsLostPct,
            roundTripTimeMs: metrics.roundTripTimeMs,
            fromKbps: Math.round(current / 1000),
            toKbps: Math.round(reduced / 1000),
          })
        }
      }
    }
  }

  stopNetworkMonitoring(): void {
    this.networkChangeCleanup?.()
    this.networkChangeCleanup = null
    this.onlineOfflineCleanup?.()
    this.onlineOfflineCleanup = null
  }
}
