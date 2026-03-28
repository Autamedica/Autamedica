/**
 * MediaManager — owns local media stream, device enumeration, and track attachment.
 * Extracted from WebRTCClient to keep media concerns isolated.
 */

import { getAdaptiveConstraints, getPreferredCodecs, detectBrowser } from './media-optimizations'
import type { createTelemedicineLogger } from './debug'
import type { DeviceInfo, MediaConstraints } from './webrtc-client'
import { INITIAL_VIDEO_BITRATE } from './bitrate-adapter'

export interface MediaManagerCallbacks {
  emit: (event: string, ...args: unknown[]) => void
  onBitrateRampNeeded: () => void
}

export class MediaManager {
  private localStream: MediaStream | null = null
  private cachedDevices: DeviceInfo[] = []
  private deviceChangeCleanup: (() => void) | null = null

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
    private readonly callbacks: MediaManagerCallbacks,
  ) {}

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(message, { sessionId: this.sessionId, ...context })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(message, { sessionId: this.sessionId, ...context })
  }

  private logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
    this.logger.error(message, error, { sessionId: this.sessionId, ...context })
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream
  }

  getDevices(): DeviceInfo[] {
    return this.cachedDevices
  }

  setCachedDevices(devices: DeviceInfo[]): void {
    this.cachedDevices = devices
  }

  async enumerateDevices(): Promise<DeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices
        .filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput' || d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `${d.kind} (${d.deviceId.slice(0, 6)})`,
          kind: d.kind as DeviceInfo['kind'],
        }))
    } catch {
      return []
    }
  }

  async startLocalStream(
    constraints: MediaConstraints = { video: true, audio: true },
    peerConnections: Map<string, { pc: RTCPeerConnection }>,
  ): Promise<MediaStream> {
    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (mediaError) {
        if (constraints.video) {
          this.logWarn('Video getUserMedia failed in startLocalStream, falling back to audio-only', { error: mediaError })
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          this.callbacks.emit('audio-only-fallback', { reason: 'getUserMedia_video_failed', error: mediaError })
        } else {
          throw mediaError
        }
      }
      this.callbacks.emit('local-stream', this.localStream)
      const videoTrackCount = this.localStream.getVideoTracks().length
      const audioTrackCount = this.localStream.getAudioTracks().length
      this.logInfo('Local media stream started', { videoTrackCount, audioTrackCount })
      this.callbacks.emit('media-acquired', { videoTracks: videoTrackCount, audioTracks: audioTrackCount, source: 'startLocalStream' })

      for (const [, peerState] of peerConnections) {
        this.attachLocalTracks(peerState.pc)
      }

      return this.localStream
    } catch (error) {
      this.logError('Failed to get local stream', error)
      this.callbacks.emit('error', new Error('Failed to access camera/microphone'))
      throw error
    }
  }

  async switchDevice(
    kind: 'video' | 'audio',
    deviceId: string,
    peerConnections: Map<string, { pc: RTCPeerConnection }>,
  ): Promise<void> {
    if (!this.localStream) return

    const adaptive = getAdaptiveConstraints()
    const constraints: MediaStreamConstraints = kind === 'video'
      ? { video: { deviceId: { exact: deviceId }, ...adaptive.video as MediaTrackConstraints } }
      : { audio: { deviceId: { exact: deviceId }, ...adaptive.audio as MediaTrackConstraints } }

    const newStream = await navigator.mediaDevices.getUserMedia(constraints)
    const newTrack = newStream.getTracks()[0]
    if (!newTrack) return

    const oldTracks = kind === 'video'
      ? this.localStream.getVideoTracks()
      : this.localStream.getAudioTracks()
    for (const old of oldTracks) {
      this.localStream.removeTrack(old)
      old.stop()
    }
    this.localStream.addTrack(newTrack)

    for (const [, peerState] of peerConnections) {
      const sender = peerState.pc.getSenders().find((s) => s.track?.kind === kind)
      if (sender) {
        await sender.replaceTrack(newTrack)
      }
    }

    this.callbacks.emit('local-stream', this.localStream)
    this.logInfo('Device switched', { kind, deviceId })
  }

  async replaceVideoTrack(
    newTrack: MediaStreamTrack | null,
    peerConnections: Map<string, { pc: RTCPeerConnection }>,
  ): Promise<void> {
    if (!this.localStream) return

    const currentVideoTrack = this.localStream.getVideoTracks()[0]

    if (!newTrack) {
      if (currentVideoTrack?.readyState === 'live') return
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        newTrack = camStream.getVideoTracks()[0]
        if (!newTrack) return
      } catch {
        return
      }
    }

    for (const old of this.localStream.getVideoTracks()) {
      this.localStream.removeTrack(old)
      if (newTrack.id !== old.id) old.stop()
    }
    this.localStream.addTrack(newTrack)

    for (const [, peerState] of peerConnections) {
      const sender = peerState.pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(newTrack)
      }
    }

    this.callbacks.emit('local-stream', this.localStream)
    this.logInfo('Video track replaced', { trackLabel: newTrack.label })
  }

  attachLocalTracks(pc: RTCPeerConnection): void {
    const stream = this.localStream
    if (!stream) {
      this.logWarn('attachLocalTracks called but localStream is null — tracks will be added after media acquisition')
      return
    }

    const existingTrackIds = new Set(
      pc.getSenders()
        .map(sender => sender.track?.id)
        .filter((id): id is string => Boolean(id))
    )

    stream.getTracks().forEach(track => {
      if (!existingTrackIds.has(track.id)) {
        const sender = pc.addTrack(track, stream)

        if (track.kind === 'video') {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }
          params.encodings[0].maxBitrate = INITIAL_VIDEO_BITRATE
          params.encodings[0].maxFramerate = 24

          sender.setParameters(params).catch(e => {
            this.logWarn('Failed to set video encoding parameters', { error: e, trackId: track.id })
          })

          this.callbacks.onBitrateRampNeeded()
        }

        this.logInfo('Attached local track to peer connection', {
          trackId: track.id,
          trackKind: track.kind,
          peerConnectionSignalingState: pc.signalingState,
        })
      }
    })

    this.preferCodec(pc)
  }

  attachTracksToExistingPeers(peerConnections: Map<string, { pc: RTCPeerConnection }>): void {
    if (!this.localStream || peerConnections.size === 0) return
    this.logInfo('Attaching local tracks to existing peer connections', {
      peerCount: peerConnections.size,
      trackCount: this.localStream.getTracks().length,
    })
    for (const [peerId, peerState] of peerConnections) {
      const hasTracks = peerState.pc.getSenders().some(s => s.track !== null)
      if (!hasTracks) {
        this.logInfo('Retroactively attaching tracks to peer', { peerId })
        this.attachLocalTracks(peerState.pc)
      }
    }
  }

  /** Detect when devices are connected/disconnected (headset, camera, etc.) */
  startDeviceChangeMonitoring(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return

    const handler = async () => {
      const devices = await this.enumerateDevices()
      this.cachedDevices = devices
      this.callbacks.emit('device-change', devices)
      this.logInfo('Device change detected', { deviceCount: devices.length })
    }

    navigator.mediaDevices.addEventListener('devicechange', handler)
    this.deviceChangeCleanup = () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }

  stopDeviceChangeMonitoring(): void {
    this.deviceChangeCleanup?.()
    this.deviceChangeCleanup = null
  }

  preferCodec(pc: RTCPeerConnection): void {
    if (!('getTransceivers' in pc)) return

    try {
      const preferred = getPreferredCodecs()
      const transceivers = pc.getTransceivers()
      for (const transceiver of transceivers) {
        if (transceiver.sender.track?.kind !== 'video') continue

        const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs
        if (!codecs) continue

        const sorted = [...codecs].sort((a, b) => {
          const aIdx = preferred.indexOf(a.mimeType)
          const bIdx = preferred.indexOf(b.mimeType)
          return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999)
        })

        if ('setCodecPreferences' in transceiver) {
          transceiver.setCodecPreferences(sorted)
          this.logInfo('Codec preference set', {
            preferred: sorted[0]?.mimeType ?? 'unknown',
            browser: detectBrowser(),
          })
        }
      }
    } catch (error) {
      this.logWarn('Could not set codec preference', { error })
    }
  }
}
