/**
 * Progressive bitrate ramp and quality limitation handling.
 */

interface PeerState {
  pc: RTCPeerConnection
}

interface BitrateRampContext {
  getPeerConnections: () => Map<string, PeerState>
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void
  }
}

const INITIAL_VIDEO_BITRATE = 500_000
const TARGET_VIDEO_BITRATE = 2_500_000
const BITRATE_RAMP_DURATION_MS = 10_000
const BITRATE_RAMP_INTERVAL_MS = 2_000

export { INITIAL_VIDEO_BITRATE, TARGET_VIDEO_BITRATE }

export class BitrateRamp {
  private bitrateRampInterval: ReturnType<typeof setInterval> | null = null
  private bitrateRampStartMs: number | null = null
  private readonly ctx: BitrateRampContext

  constructor(ctx: BitrateRampContext) {
    this.ctx = ctx
  }

  start(): void {
    if (this.bitrateRampInterval) return

    this.bitrateRampStartMs = Date.now()
    this.ctx.log.info('Starting progressive bitrate ramp', {
      initial: INITIAL_VIDEO_BITRATE,
      target: TARGET_VIDEO_BITRATE,
      durationMs: BITRATE_RAMP_DURATION_MS,
    })

    this.bitrateRampInterval = setInterval(() => {
      if (!this.bitrateRampStartMs) {
        this.stop()
        return
      }

      const elapsed = Date.now() - this.bitrateRampStartMs
      const progress = Math.min(elapsed / BITRATE_RAMP_DURATION_MS, 1)
      const currentBitrate = Math.round(
        INITIAL_VIDEO_BITRATE + (TARGET_VIDEO_BITRATE - INITIAL_VIDEO_BITRATE) * progress
      )

      for (const [, peerState] of this.ctx.getPeerConnections()) {
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
        this.ctx.log.info('Bitrate ramp complete', { finalBitrate: currentBitrate })
        this.stop()
      }
    }, BITRATE_RAMP_INTERVAL_MS)
  }

  stop(): void {
    if (this.bitrateRampInterval) {
      clearInterval(this.bitrateRampInterval)
      this.bitrateRampInterval = null
    }
    this.bitrateRampStartMs = null
  }

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
        this.ctx.log.info('Reduced bitrate due to quality limitation', {
          peerId, reason,
          fromKbps: Math.round(current / 1000),
          toKbps: Math.round(reduced / 1000),
        })
      }
    }
  }

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
      this.ctx.log.info('Reduced quality due to packet loss', {
        peerId,
        lossPct: Math.round(lossPct * 100) / 100,
        scaleDown: params.encodings[0].scaleResolutionDownBy,
      })
    }
  }
}
