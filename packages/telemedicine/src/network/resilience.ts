/**
 * Network resilience: offline/online detection, network change handling,
 * and TURN credential refresh for long-running calls.
 */

import { fetchTurnCredentials, hasTurnIceServer } from '../config/ice-servers'
import type { WebRTCConfig } from '../webrtc-client'

interface PeerState {
  pc: RTCPeerConnection
  iceRestartCount: number
}

interface ResilienceContext {
  config: WebRTCConfig
  getPeerConnections: () => Map<string, PeerState>
  onDegradedNetwork: () => void
  onOnlineRecovery: () => void
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void
    warn: (msg: string, ctx?: Record<string, unknown>) => void
  }
  emit: (event: 'error', error: Error) => void
}

const INITIAL_VIDEO_BITRATE = 500_000

export class NetworkResilience {
  private networkChangeCleanup: (() => void) | null = null
  private onlineOfflineCleanup: (() => void) | null = null
  private turnRefreshInterval: ReturnType<typeof setInterval> | null = null
  private readonly ctx: ResilienceContext

  constructor(ctx: ResilienceContext) {
    this.ctx = ctx
  }

  startAll(): void {
    this.startNetworkMonitoring()
    this.startOnlineOfflineMonitoring()
    this.startTurnCredentialRefresh()
  }

  stopAll(): void {
    this.stopNetworkMonitoring()
    this.stopTurnCredentialRefresh()
  }

  private startNetworkMonitoring(): void {
    const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string; downlink?: number } }).connection
    if (!conn) return

    const handler = () => {
      const info = conn as { effectiveType?: string; downlink?: number }
      this.ctx.log.info('Network change detected', { effectiveType: info.effectiveType, downlink: info.downlink })

      if (info.effectiveType === '2g' || info.effectiveType === '3g' || info.effectiveType === 'slow-2g') {
        this.ctx.onDegradedNetwork()
        for (const [, peerState] of this.ctx.getPeerConnections()) {
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

  private startOnlineOfflineMonitoring(): void {
    if (typeof window === 'undefined') return

    const onOffline = () => {
      this.ctx.log.warn('Browser went offline')
      this.ctx.emit('error', new Error('network_offline'))
    }

    const onOnline = () => {
      this.ctx.log.info('Browser came back online, restarting ICE for all peers')
      for (const [peerId, peerState] of this.ctx.getPeerConnections()) {
        peerState.iceRestartCount = 0
        peerState.pc.restartIce()
        this.ctx.log.info('ICE restart triggered after online recovery', { peerId })
      }
      this.ctx.onOnlineRecovery()
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    this.onlineOfflineCleanup = () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }

  private stopNetworkMonitoring(): void {
    this.networkChangeCleanup?.()
    this.networkChangeCleanup = null
    this.onlineOfflineCleanup?.()
    this.onlineOfflineCleanup = null
  }

  private startTurnCredentialRefresh(): void {
    if (this.turnRefreshInterval) return
    if (!hasTurnIceServer(this.ctx.config.iceServers)) return

    const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
    this.turnRefreshInterval = setInterval(async () => {
      try {
        const freshServers = await fetchTurnCredentials()
        if (hasTurnIceServer(freshServers)) {
          this.ctx.config.iceServers = freshServers
          for (const [peerId, peerState] of this.ctx.getPeerConnections()) {
            peerState.pc.setConfiguration({
              iceServers: freshServers,
              bundlePolicy: 'max-bundle',
              rtcpMuxPolicy: 'require',
            })
            this.ctx.log.info('TURN credentials refreshed for peer', { peerId })
          }
        }
      } catch {
        this.ctx.log.warn('Failed to refresh TURN credentials')
      }
    }, REFRESH_INTERVAL_MS)
  }

  private stopTurnCredentialRefresh(): void {
    if (this.turnRefreshInterval) {
      clearInterval(this.turnRefreshInterval)
      this.turnRefreshInterval = null
    }
  }
}
