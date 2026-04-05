/**
 * MediaManager — owns local media stream, device enumeration, and track attachment.
 * Extracted from WebRTCClient to keep media concerns isolated.
 */

import { getAdaptiveConstraints, getPreferredVideoCodecs, getPreferredAudioCodecs, detectBrowser } from './media-optimizations'
import type { createTelemedicineLogger } from './debug'
import type { DeviceInfo, MediaConstraints } from './webrtc-client'
import { INITIAL_VIDEO_BITRATE } from './bitrate-adapter'
import { AudioFilterProcessor, type AudioFilterConfig } from './audio-filter'

export interface MediaManagerCallbacks {
  emit: (event: string, ...args: unknown[]) => void
  onBitrateRampNeeded: () => void
}

export class MediaManager {
  private localStream: MediaStream | null = null
  private rawStream: MediaStream | null = null
  private cachedDevices: DeviceInfo[] = []
  private deviceChangeCleanup: (() => void) | null = null
  private audioFilter: AudioFilterProcessor

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
    private readonly callbacks: MediaManagerCallbacks,
    audioFilterConfig?: Partial<AudioFilterConfig>,
  ) {
    this.audioFilter = new AudioFilterProcessor(logger, audioFilterConfig)
  }

  getAudioFilter(): AudioFilterProcessor {
    return this.audioFilter
  }

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
      // Stop previous stream tracks before acquiring new media to prevent leaks
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop())
        this.localStream = null
      }
      if (this.rawStream) {
        this.rawStream.getTracks().forEach(t => t.stop())
        this.rawStream = null
      }

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (mediaError) {
        if (constraints.video) {
          this.logWarn('Video getUserMedia failed in startLocalStream, falling back to audio-only', { error: mediaError })
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          })
          this.callbacks.emit('audio-only-fallback', { reason: 'getUserMedia_video_failed', error: mediaError })
        } else {
          throw mediaError
        }
      }
      // Apply 3-band audio filter (low: -50dB, mid: 0dB, high: 0dB)
      this.rawStream = this.localStream
      this.localStream = this.audioFilter.process(this.localStream)

      this.callbacks.emit('local-stream', this.localStream)
      const videoTrackCount = this.localStream.getVideoTracks().length
      const audioTrackCount = this.localStream.getAudioTracks().length
      this.logInfo('Local media stream started', { videoTrackCount, audioTrackCount, audioFilterEnabled: this.audioFilter.enabled })
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

    let newStream = await navigator.mediaDevices.getUserMedia(constraints)

    // Re-apply audio filter when switching audio device
    if (kind === 'audio') {
      newStream = this.audioFilter.process(newStream)
    }

    const newTrack = newStream.getTracks().find(t => t.kind === kind)
    if (!newTrack) {
      // No matching track — stop all tracks from the acquired stream to avoid leaks
      newStream.getTracks().forEach(t => t.stop())
      return
    }

    // Stop any extra tracks from the new stream that we won't use
    newStream.getTracks().forEach(t => {
      if (t !== newTrack) t.stop()
    })

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
    this.logInfo('Device switched', { kind, deviceId, audioFilterEnabled: kind === 'audio' && this.audioFilter.enabled })
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
        if (!newTrack) {
          camStream.getTracks().forEach(t => t.stop())
          return
        }
        // Stop any extra tracks from fallback stream (e.g. unexpected audio tracks)
        camStream.getTracks().forEach(t => {
          if (t !== newTrack) t.stop()
        })
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

  /**
   * Toggle clinical audio mode on the LOCAL microphone track.
   *
   * When enabled: disables noiseSuppression, echoCancellation, autoGainControl
   * so the remote side receives raw clinical audio (sibilances, lung sounds, etc.).
   *
   * When disabled: re-enables all processing for clean conversational audio.
   *
   * NOTE: This changes what THIS client SENDS. In the asymmetric telemedicine model:
   * - Patient calls this when doctor requests clinical mode (via DataChannel control msg)
   * - Doctor should NOT call this directly — use requestRemoteClinicalMode() instead
   */
  async setClinicalMode(
    enabled: boolean,
    peerConnections: Map<string, { pc: RTCPeerConnection }>
  ): Promise<void> {
    if (!this.localStream) return

    // In clinical mode: bypass audio filter to send raw unprocessed audio
    // (stethoscope, lung sounds need full frequency range without EQ cuts)
    if (enabled) {
      this.audioFilter.destroy()
    }

    const currentAudioTrack = (this.rawStream ?? this.localStream).getAudioTracks()[0]
    if (!currentAudioTrack) return

    const deviceId = currentAudioTrack.getSettings().deviceId

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: !enabled,
        noiseSuppression: !enabled,
        autoGainControl: !enabled,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
      }
    }

    try {
      let newStream = await navigator.mediaDevices.getUserMedia(constraints)

      // Re-apply EQ when exiting clinical mode
      if (!enabled) {
        this.rawStream = newStream
        newStream = this.audioFilter.process(newStream)
      }

      const newTrack = newStream.getAudioTracks()[0]
      if (!newTrack) return

      // Set content hint based on mode
      if ('contentHint' in newTrack) {
        newTrack.contentHint = enabled ? 'music' : 'speech'
      }

      for (const old of this.localStream.getAudioTracks()) {
        this.localStream.removeTrack(old)
        old.stop()
      }
      this.localStream.addTrack(newTrack)

      for (const [, peerState] of peerConnections) {
        const sender = peerState.pc.getSenders().find((s) => s.track?.kind === 'audio')
        if (sender) {
          await sender.replaceTrack(newTrack)
        }
      }

      this.callbacks.emit('local-stream', this.localStream)
      this.logInfo('Clinical mode toggled', { enabled, deviceId, contentHint: enabled ? 'music' : 'speech' })
    } catch (error) {
      this.logError('Failed to toggle clinical mode', error, { enabled })
      throw error
    }
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
        if (track.kind === 'video') {
          // Use addTransceiver for video to enable simulcast with 3 encoding layers.
          // Simulcast lets the SFU/receiver pick the best layer for their bandwidth.
          // Medical context: prioritize resolution over framerate (skin lesions, mucosa color).
          pc.addTransceiver(track, {
            direction: 'sendrecv',
            streams: [stream],
            sendEncodings: [
              { rid: 'low', maxBitrate: 150_000, scaleResolutionDownBy: 4, maxFramerate: 15 },
              { rid: 'mid', maxBitrate: 500_000, scaleResolutionDownBy: 2, maxFramerate: 24 },
              { rid: 'high', maxBitrate: INITIAL_VIDEO_BITRATE, maxFramerate: 30 },
            ],
          })
          this.callbacks.onBitrateRampNeeded()
        } else {
          pc.addTrack(track, stream)
        }

        this.logInfo('Attached local track to peer connection', {
          trackId: track.id,
          trackKind: track.kind,
          simulcast: track.kind === 'video',
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
      const preferredVideo = getPreferredVideoCodecs()
      const preferredAudio = getPreferredAudioCodecs()
      
      const transceivers = pc.getTransceivers()
      for (const transceiver of transceivers) {
        const kind = transceiver.sender.track?.kind
        if (!kind) continue

        const preferred = kind === 'video' ? preferredVideo : preferredAudio
        const codecs = RTCRtpSender.getCapabilities?.(kind)?.codecs
        if (!codecs) continue

        const sorted = [...codecs].sort((a, b) => {
          const aIdx = preferred.indexOf(a.mimeType)
          const bIdx = preferred.indexOf(b.mimeType)
          return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999)
        })

        if ('setCodecPreferences' in transceiver) {
          transceiver.setCodecPreferences(sorted)
          this.logInfo('Codec preference set', {
            kind,
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
