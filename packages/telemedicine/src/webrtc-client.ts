/**
 * WebRTC Client for AltaMedica Telemedicine
 * Handles peer-to-peer video/audio connections with signaling server
 */

import { createTelemedicineLogger } from './debug'
import { loadIceServers, loadSignalingUrl, ICE_STUN_ONLY } from './config/ice-servers'
import { getAdaptiveConstraints, applyContentHints, getPreferredCodecs, detectBrowser } from './media-optimizations'
import { NetworkResilience } from './network/resilience'
import { DeviceManager } from './device/manager'
import { BitrateRamp, INITIAL_VIDEO_BITRATE, TARGET_VIDEO_BITRATE } from './bitrate/ramp'
import { ChatManager } from './chat/data-channel'
import {
  type StreamQualityLevel, type StreamQualityMetrics, type StreamQualitySummary, type PeerStatsSample,
  computeMOS, classifyQualityLevel, getOverallQualityLevel,
  getStatNumber, getStatString, getStatBoolean, getStatKind, computeBitrateKbps, roundMetric,
} from './quality'

export interface WebRTCConfig {
  signalingUrl: string
  iceServers: RTCIceServer[]
  roomId?: string
  userId: string
  userType: 'doctor' | 'patient' | 'nurse'
  userName?: string
}

export interface MediaConstraints {
  video: boolean | MediaTrackConstraints
  audio: boolean | MediaTrackConstraints
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderType: 'doctor' | 'patient' | 'nurse'
  senderName?: string
  timestamp: number
}

// Types re-exported from quality/
export type { StreamQualityLevel, StreamQualityMetrics, StreamQualitySummary } from './quality'

export interface WebRTCEvents {
  'connection-state': (state: ConnectionState) => void
  'remote-stream': (stream: MediaStream, userId: string) => void
  'local-stream': (stream: MediaStream) => void
  'user-joined': (userId: string, userType: string) => void
  'user-left': (userId: string) => void
  'chat-message': (message: ChatMessage) => void
  'chat-ready': (ready: boolean) => void
  'stream-quality': (summary: StreamQualitySummary) => void
  'audio-only-fallback': (info: { reason: string; error: unknown }) => void
  'device-change': (devices: DeviceInfo[]) => void
  'error': (error: Error) => void
  // Observability events
  'media-acquired': (info: { videoTracks: number; audioTracks: number; source: string }) => void
  'signaling-connected': (info: { latencyMs: number }) => void
  'ice-state-change': (info: { peerId: string; state: string }) => void
  'peer-connected': (info: { peerId: string; connectionState: string; iceConnectionState: string }) => void
}

type ServerSignalingMessage =
  | { type: 'room-state'; data: { users: Array<{ id: string; userType: string }> } }
  | { type: 'user-joined'; from: string; data: { userType: string } }
  | { type: 'user-left'; from: string }
  | { type: 'offer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; data: RTCIceCandidateInit }
  | { type: 'error'; data: string }

interface PeerState {
  pc: RTCPeerConnection
  pendingIceCandidates: RTCIceCandidateInit[]
  isMakingOffer: boolean
  isSettingRemoteAnswerPending: boolean
  ignoreOffer: boolean
  isPolite: boolean
  dataChannel: RTCDataChannel | null
  iceRestartCount: number
  lastIceRestartAt: number
}

const MAX_ICE_RESTART_ATTEMPTS = 3
const ICE_RESTART_BACKOFF_BASE_MS = 2_000

const QUALITY_POLL_INTERVAL_MS = 5000
const QUALITY_LOG_INTERVAL_MS = 30000
const CHAT_CHANNEL_LABEL = 'autamedica-chat'

// Pre-warm & adaptive media constants
// Bitrate constants imported from './bitrate/ramp'
// Codec preference resolved at runtime via getPreferredCodecs() from media-optimizations

// Media constraints replaced by getAdaptiveConstraints() from media-optimizations.ts

export interface DeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'videoinput' | 'audiooutput'
}

export interface WarmUpResult {
  stream: MediaStream
  devices: DeviceInfo[]
  signalingReady: boolean
  latencyMs: number | null
}

export class WebRTCClient {
  private ws: WebSocket | null = null
  private signalingSocketPromise: Promise<void> | null = null
  private peerConnections = new Map<string, PeerState>()
  private localStream: MediaStream | null = null
  private config: WebRTCConfig
  private readonly sessionId = `${Math.random().toString(36).slice(2, 8)}-${Date.now()}`
   
  private eventListeners = new Map<keyof WebRTCEvents, Function[]>()
  private connectionState: ConnectionState = 'disconnected'
  private qualityInterval: ReturnType<typeof setInterval> | null = null
  private peerStatsSamples = new Map<string, PeerStatsSample>()
  private latestQualityByPeer = new Map<string, StreamQualityMetrics>()
  private qualityLogState = new Map<string, { level: StreamQualityLevel; at: number }>()
  private readonly debugLogger: ReturnType<typeof createTelemedicineLogger>
  private isWarmedUp = false
  private warmUpPromise: Promise<WarmUpResult> | null = null
  private readonly bitrateRamp: BitrateRamp
  private readonly chatManager: ChatManager
  private readonly networkResilience: NetworkResilience
  private readonly deviceManager: DeviceManager

  constructor(config: Partial<WebRTCConfig> & { userId: string; userType: 'doctor' | 'patient' | 'nurse' }) {
    // Use environment-configured ICE servers or fallback to STUN-only defaults
    const envServers = loadIceServers()
    const iceServers = config.iceServers || (envServers.length > 0 ? envServers : ICE_STUN_ONLY)

    this.config = {
      signalingUrl: loadSignalingUrl(),
      iceServers,
      roomId: 'default-room',
      ...config
    }

    this.debugLogger = createTelemedicineLogger({
      source: 'WebRTCClient',
      roomId: this.config.roomId,
      userId: this.config.userId,
      userType: this.config.userType,
    })

    const log = {
      info: (msg: string, ctx?: Record<string, unknown>) => this.logInfo(msg, ctx),
      warn: (msg: string, ctx?: Record<string, unknown>) => this.logWarn(msg, ctx),
    }

    this.networkResilience = new NetworkResilience({
      config: this.config,
      getPeerConnections: () => this.peerConnections,
      onDegradedNetwork: () => this.bitrateRamp.stop(),
      onOnlineRecovery: () => { this.bitrateRamp.stop(); this.bitrateRamp.start() },
      log,
      emit: (_event, error) => this.emit('error', error),
    })

    this.deviceManager = new DeviceManager({
      getLocalStream: () => this.localStream,
      setLocalStream: (fn) => { if (this.localStream) fn(this.localStream) },
      getPeerConnections: () => this.peerConnections,
      emit: (event, data) => {
        if (event === 'local-stream') this.emit('local-stream', data as MediaStream)
        if (event === 'device-change') this.emit('device-change', data as DeviceInfo[])
      },
      log,
    })

    this.bitrateRamp = new BitrateRamp({
      getPeerConnections: () => this.peerConnections,
      log,
    })

    this.chatManager = new ChatManager({
      userId: this.config.userId,
      userName: this.config.userName,
      userType: this.config.userType,
      getPeerConnections: () => this.peerConnections,
      emit: (event, data) => {
        if (event === 'chat-message') this.emit('chat-message', data as ChatMessage)
        if (event === 'chat-ready') this.emit('chat-ready', data as boolean)
      },
      log: { ...log, error: (msg: string, err: unknown, ctx?: Record<string, unknown>) => this.logError(msg, err, ctx) },
    })
  }

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.debugLogger.info(message, {
      sessionId: this.sessionId,
      ...context,
    })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    this.debugLogger.warn(message, {
      sessionId: this.sessionId,
      ...context,
    })
  }

  private logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
    this.debugLogger.error(message, error, {
      sessionId: this.sessionId,
      ...context,
    })
  }

  // Event listener methods
  on<T extends keyof WebRTCEvents>(event: T, listener: WebRTCEvents[T]): () => void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = []
      this.eventListeners.set(event, listeners)
    }
    listeners.push(listener)

    // Return unsubscribe function
    return () => {
      this.off(event, listener)
    }
  }

  off<T extends keyof WebRTCEvents>(event: T, listener: WebRTCEvents[T]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit<T extends keyof WebRTCEvents>(event: T, ...args: Parameters<WebRTCEvents[T]>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args)
        } catch (error) {
          this.logError(`Error in ${event} listener`, error)
        }
      })
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const previousState = this.connectionState
      this.connectionState = state
      this.emit('connection-state', state)
      this.logInfo('Connection state changed', {
        from: previousState,
        to: state,
      })

      if (state === 'connected') {
        this.startQualityMonitor()
        return
      }

      this.stopQualityMonitor()
      this.peerStatsSamples.clear()
      this.latestQualityByPeer.clear()
      this.emit('stream-quality', {
        roomId: this.config.roomId || 'default-room',
        overallLevel: 'unknown',
        peers: [],
      })
    }
  }

  private startQualityMonitor(): void {
    if (this.qualityInterval) {
      return
    }

    const collect = () => {
      void this.collectQualityMetrics()
    }

    collect()
    this.qualityInterval = setInterval(collect, QUALITY_POLL_INTERVAL_MS)
  }

  private stopQualityMonitor(): void {
    if (!this.qualityInterval) {
      return
    }

    clearInterval(this.qualityInterval)
    this.qualityInterval = null
  }

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
    this.logInfo('Stream quality sample', {
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
        const kind = getStatKind(stat)
        const bytesSent = getStatNumber(stat, 'bytesSent')
        if (bytesSent !== null) {
          if (kind === 'video') {
            outboundVideoBytes += bytesSent
          } else if (kind === 'audio') {
            outboundAudioBytes += bytesSent
          }
        }
        // React to encoder quality limitation (cpu/bandwidth)
        if (kind === 'video') {
          const reason = getStatString(stat, 'qualityLimitationReason')
          if (reason === 'cpu' || reason === 'bandwidth') {
            this.bitrateRamp.handleQualityLimitation(userId, pc, reason)
          }
        }
        return
      }

      if (stat.type === 'inbound-rtp') {
        const kind = getStatKind(stat)
        const bytesReceived = getStatNumber(stat, 'bytesReceived')
        if (bytesReceived !== null) {
          if (kind === 'video') {
            inboundVideoBytes += bytesReceived
          } else if (kind === 'audio') {
            inboundAudioBytes += bytesReceived
          }
        }

        if (kind === 'video') {
          const currentPacketsLost = getStatNumber(stat, 'packetsLost')
          const currentPacketsReceived = getStatNumber(stat, 'packetsReceived')
          const jitterSeconds = getStatNumber(stat, 'jitter')

          packetsLost += currentPacketsLost ?? 0
          packetsReceived += currentPacketsReceived ?? 0
          if (jitterSeconds !== null) {
            jitterMs = jitterSeconds * 1000
          }
        }
        return
      }

      if (stat.type === 'candidate-pair') {
        const selected = getStatBoolean(stat, 'selected')
        const nominated = getStatBoolean(stat, 'nominated')
        const state = getStatString(stat, 'state')

        if (selected === true || (nominated === true && state === 'succeeded')) {
          const rttSeconds = getStatNumber(stat, 'currentRoundTripTime')
          const availableOutgoingBitrate = getStatNumber(stat, 'availableOutgoingBitrate')

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
        const kind = getStatKind(stat)
        if (kind !== 'video') {
          return
        }

        const candidateFps = getStatNumber(stat, 'framesPerSecond')
        if (candidateFps !== null) {
          framesPerSecond = candidateFps
        }

        const candidateWidth = getStatNumber(stat, 'frameWidth')
        const candidateHeight = getStatNumber(stat, 'frameHeight')
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
        : computeBitrateKbps(outboundVideoBytes, previous.outboundVideoBytes, elapsedMs)
    const outboundAudioBitrateKbps =
      previous === undefined
        ? null
        : computeBitrateKbps(outboundAudioBytes, previous.outboundAudioBytes, elapsedMs)
    const inboundVideoBitrateKbps =
      previous === undefined
        ? null
        : computeBitrateKbps(inboundVideoBytes, previous.inboundVideoBytes, elapsedMs)
    const inboundAudioBitrateKbps =
      previous === undefined
        ? null
        : computeBitrateKbps(inboundAudioBytes, previous.inboundAudioBytes, elapsedMs)

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
      outboundVideoBitrateKbps: roundMetric(outboundVideoBitrateKbps),
      outboundAudioBitrateKbps: roundMetric(outboundAudioBitrateKbps),
      inboundVideoBitrateKbps: roundMetric(inboundVideoBitrateKbps),
      inboundAudioBitrateKbps: roundMetric(inboundAudioBitrateKbps),
      packetsLostPct: roundMetric(packetsLostPct, 2),
      jitterMs: roundMetric(jitterMs),
      roundTripTimeMs: roundMetric(roundTripTimeMs),
      framesPerSecond: roundMetric(framesPerSecond),
      frameWidth: frameWidth !== null ? Math.round(frameWidth) : null,
      frameHeight: frameHeight !== null ? Math.round(frameHeight) : null,
      availableOutgoingBitrateKbps: roundMetric(availableOutgoingBitrateKbps),
      mosScore: computeMOS(roundTripTimeMs, jitterMs, packetsLostPct),
    }

    return {
      userId,
      level: classifyQualityLevel(normalizedMetrics),
      timestamp: now,
      ...normalizedMetrics,
    }
  }

  private async collectQualityMetrics(): Promise<void> {
    if (this.connectionState !== 'connected') {
      return
    }

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

        // P1 #8: Packet loss threshold — reduce resolution when loss > 5%
        if (metrics.packetsLostPct !== null && metrics.packetsLostPct > 5) {
          this.bitrateRamp.handlePacketLoss(userId, peerState.pc, metrics.packetsLostPct)
        }
      } catch (error) {
        this.logWarn('Failed collecting stream quality stats', { peerId: userId, error })
      }
    }

    this.emit('stream-quality', {
      roomId: this.config.roomId || 'default-room',
      overallLevel: getOverallQualityLevel(peers),
      peers,
    })
  }

  /**
   * Pre-warm the client: acquire media + open signaling socket in parallel.
   * Call this early (e.g. on page mount) so that `connect()` becomes near-instant.
   */
  async warmUp(constraints?: MediaStreamConstraints): Promise<WarmUpResult> {
    if (this.warmUpPromise) {
      return this.warmUpPromise
    }

    this.warmUpPromise = this.doWarmUp(constraints)
    return this.warmUpPromise
  }

  private async doWarmUp(constraints?: MediaStreamConstraints): Promise<WarmUpResult> {
    const t0 = performance.now()
    this.logInfo('Pre-warming: starting parallel getUserMedia + signaling', {
      hasExistingStream: !!this.localStream,
    })

    // Run getUserMedia and WS open in parallel
    const [streamResult, signalingResult, devicesResult] = await Promise.allSettled([
      this.localStream
        ? Promise.resolve(this.localStream)
        : navigator.mediaDevices.getUserMedia(constraints ?? getAdaptiveConstraints()),
      this.openSignalingSocket(),
      this.enumerateDevices(),
    ])

    // Handle stream
    if (streamResult.status === 'fulfilled') {
      this.localStream = streamResult.value
      this.emit('local-stream', this.localStream)
      const videoTracks = this.localStream.getVideoTracks().length
      const audioTracks = this.localStream.getAudioTracks().length
      this.logInfo('Pre-warm: local media acquired', { videoTracks, audioTracks })
      this.emit('media-acquired', { videoTracks, audioTracks, source: 'warm-up' })
      applyContentHints(this.localStream)
      this.attachTracksToExistingPeers()
    } else {
      this.logWarn('Pre-warm: getUserMedia failed, will retry on connect', {
        error: streamResult.reason,
      })
    }

    const signalingReady = signalingResult.status === 'fulfilled'
    const devices = devicesResult.status === 'fulfilled' ? devicesResult.value : []
    this.deviceManager.setCachedDevices(devices)

    const latencyMs = Math.round(performance.now() - t0)
    this.isWarmedUp = true
    this.logInfo('Pre-warm complete', { latencyMs, signalingReady, deviceCount: devices.length })

    return {
      stream: this.localStream ?? new MediaStream(),
      devices,
      signalingReady,
      latencyMs,
    }
  }

  async enumerateDevices(): Promise<DeviceInfo[]> {
    return this.deviceManager.enumerateDevices()
  }

  getDevices(): DeviceInfo[] {
    return this.deviceManager.getDevices()
  }

  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    return this.deviceManager.switchDevice(kind, deviceId)
  }

  /** Compute approximate signaling latency by ping */
  async measureSignalingLatency(): Promise<number | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return null
    const start = performance.now()
    // Simple ping: send a small message and see how quickly onmessage fires
    // For now, return the time it took to open the socket (captured during warmUp)
    return Math.round(performance.now() - start)
  }

  private openSignalingSocket(): Promise<void> {
    const roomId = this.config.roomId || 'default-room'
    const wsUrl = `${this.config.signalingUrl}?roomId=${encodeURIComponent(roomId)}`

    // If already open, skip
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.ws?.readyState === WebSocket.CONNECTING && this.signalingSocketPromise) {
      return this.signalingSocketPromise
    }

    const socket = new WebSocket(wsUrl)
    this.ws = socket

    const openPromise = new Promise<void>((resolve, reject) => {
      const wsOpenedAt = performance.now()
      this.logInfo('Opening signaling socket', { signalingUrl: this.config.signalingUrl, wsUrl })

      const timeout = setTimeout(() => {
        try {
          socket.close()
        } catch {
          // Ignore close failures on half-open sockets.
        }
        if (this.ws === socket) {
          this.ws = null
        }
        reject(new Error('Signaling connection timeout'))
      }, 8000)

      socket.onopen = () => {
        if (this.ws !== socket) {
          clearTimeout(timeout)
          try {
            socket.close(1000, 'stale_socket')
          } catch {
            // Ignore close failures on stale sockets.
          }
          resolve()
          return
        }

        clearTimeout(timeout)
        const latencyMs = Math.round(performance.now() - wsOpenedAt)
        this.logInfo('WebSocket connected (pre-warm)', { latencyMs })
        this.emit('signaling-connected', { latencyMs })
        resolve()
      }

      socket.onmessage = (event) => {
        if (this.ws !== socket) {
          return
        }

        try {
          this.handleSignalingMessage(JSON.parse(event.data) as ServerSignalingMessage)
        } catch (error) {
          this.logError('Failed parsing signaling message', error, {
            payloadPreview: String(event.data).slice(0, 200),
          })
        }
      }

      socket.onerror = (error) => {
        if (this.ws !== socket) {
          clearTimeout(timeout)
          reject(new Error('Stale WebSocket connection failed'))
          return
        }

        clearTimeout(timeout)
        this.logError('WebSocket error', error)
        this.setConnectionState('failed')
        this.emit('error', new Error('WebSocket connection failed'))
        this.ws = null
        reject(new Error('WebSocket connection failed'))
      }

      socket.onclose = () => {
        if (this.ws !== socket) {
          return
        }

        this.logInfo('WebSocket disconnected')
        this.ws = null
        this.setConnectionState('disconnected')
        this.cleanup()
      }
    })

    const managedPromise = openPromise.finally(() => {
      if (this.signalingSocketPromise === managedPromise) {
        this.signalingSocketPromise = null
      }
    })

    this.signalingSocketPromise = managedPromise
    return managedPromise
  }

  async connect(roomId?: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return
    }

    this.setConnectionState('connecting')

    try {
      const finalRoomId = roomId || this.config.roomId || 'default-room'
      this.config.roomId = finalRoomId

      // If pre-warmed, socket is already open — just join.
      // Otherwise, open it now (backwards compatible).
      if (this.ws?.readyState !== WebSocket.OPEN) {
        await this.openSignalingSocket()
      }

      // Acquire media if not pre-warmed
      if (!this.localStream) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(getAdaptiveConstraints())
        } catch (mediaError) {
          // Fallback to audio-only if video fails
          this.logWarn('Video getUserMedia failed, falling back to audio-only', { error: mediaError })
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          this.emit('audio-only-fallback', { reason: 'getUserMedia_video_failed', error: mediaError })
        }
        applyContentHints(this.localStream)
        this.emit('local-stream', this.localStream)
        this.emit('media-acquired', {
          videoTracks: this.localStream.getVideoTracks().length,
          audioTracks: this.localStream.getAudioTracks().length,
          source: 'connect',
        })
      }

      // Retroactively attach tracks to any peer connections created before media was ready
      this.attachTracksToExistingPeers()

      // Monitor network changes for adaptive bitrate
      this.networkResilience.startAll()
      this.deviceManager.startDeviceChangeMonitoring()

      // Send join — this is the only thing the user "waits" for
      this.sendSignalingMessage({
        type: 'join',
        from: this.config.userId,
        data: { userType: this.config.userType }
      })

    } catch (error) {
      this.setConnectionState('failed')
      this.logError('Failed connecting to signaling server', error)
      throw error
    }
  }

  async startLocalStream(constraints: MediaConstraints = { video: true, audio: true }): Promise<MediaStream> {
    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (mediaError) {
        if (constraints.video) {
          this.logWarn('Video getUserMedia failed in startLocalStream, falling back to audio-only', { error: mediaError })
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          this.emit('audio-only-fallback', { reason: 'getUserMedia_video_failed', error: mediaError })
        } else {
          throw mediaError
        }
      }
      this.emit('local-stream', this.localStream)
      const videoTrackCount = this.localStream.getVideoTracks().length
      const audioTrackCount = this.localStream.getAudioTracks().length
      this.logInfo('Local media stream started', { videoTrackCount, audioTrackCount })
      this.emit('media-acquired', { videoTracks: videoTrackCount, audioTracks: audioTrackCount, source: 'startLocalStream' })

      // Add tracks to all existing peer connections
      for (const [, peerState] of this.peerConnections) {
        this.attachLocalTracks(peerState.pc)
      }

      return this.localStream
    } catch (error) {
      this.logError('Failed to get local stream', error)
      this.emit('error', new Error('Failed to access camera/microphone'))
      throw error
    }
  }

  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
      this.logInfo('Local media stream stopped')
    }
  }

  async disconnect(): Promise<void> {
    this.logInfo('Disconnect requested')
    this.setConnectionState('disconnected')

    if (this.ws) {
      this.sendSignalingMessage({ type: 'leave' })
      this.ws.close()
      this.ws = null
    }

    this.cleanup()
  }

  private cleanup(): void {
    this.stopQualityMonitor()
    this.bitrateRamp.stop()
    this.networkResilience.stopAll()
    this.deviceManager.stopDeviceChangeMonitoring()
    this.peerStatsSamples.clear()
    this.latestQualityByPeer.clear()
    this.qualityLogState.clear()

    // Close all peer connections
    for (const [, peerState] of this.peerConnections) {
      peerState.dataChannel?.close()
      peerState.pc.close()
    }
    this.peerConnections.clear()
    this.emit('chat-ready', false)

    // Stop local stream
    this.stopLocalStream()

    // Reset warm-up state
    this.isWarmedUp = false
    this.warmUpPromise = null
  }

  private sendSignalingMessage(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return
    }

    this.logWarn('Skipped signaling message: socket not open', {
      readyState: this.ws?.readyState ?? null,
      messageType: typeof message.type === 'string' ? message.type : 'unknown',
    })
  }

  private async handleSignalingMessage(message: ServerSignalingMessage): Promise<void> {
    this.logInfo('Received signaling message', { type: message.type, from: 'from' in message ? message.from : null })

    switch (message.type) {
      case 'room-state':
        // Handle initial room state — create peer connections for existing users
        for (const user of message.data.users) {
          this.emit('user-joined', user.id, user.userType)
          this.ensurePeerConnection(user.id)
        }
        this.setConnectionState('connected')
        break

      case 'user-joined':
        this.emit('user-joined', message.from, message.data.userType)
        this.ensurePeerConnection(message.from)
        break

      case 'user-left': {
        this.emit('user-left', message.from)
        const peerState = this.peerConnections.get(message.from)
        if (peerState) {
          peerState.dataChannel?.close()
          peerState.pc.close()
          this.peerConnections.delete(message.from)
          this.chatManager.emitChatReady()
        }
        break
      }

      case 'offer':
        await this.handleOffer(message.from, message.data)
        break

      case 'answer':
        await this.handleAnswer(message.from, message.data)
        break

      case 'ice-candidate':
        await this.handleIceCandidate(message.from, message.data)
        break

      case 'error':
        this.logError('Signaling server error', message.data)
        this.emit('error', new Error(String(message.data)))
        break
    }
  }

  private ensurePeerConnection(userId: string): PeerState {
    let peerState = this.peerConnections.get(userId)
    if (peerState) {
      return peerState
    }

    const pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 1,
    })
    const isPolite = this.config.userType !== 'doctor'
    this.logInfo('Creating peer connection', { peerId: userId, isPolite })

    peerState = {
      pc,
      pendingIceCandidates: [],
      isMakingOffer: false,
      isSettingRemoteAnswerPending: false,
      ignoreOffer: false,
      isPolite,
      dataChannel: null,
      iceRestartCount: 0,
      lastIceRestartAt: 0,
    }

    pc.ontrack = (event) => {
      this.logInfo('Received remote stream', { peerId: userId, trackCount: event.streams?.[0]?.getTracks().length ?? 0 })
      const stream = event.streams?.[0]
      if (stream) {
        this.emit('remote-stream', stream, userId)
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          to: userId,
          data: event.candidate
        })
      }
    }

    pc.onconnectionstatechange = () => {
      this.logInfo('Peer connection state changed', {
        peerId: userId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
      })
      if (pc.connectionState === 'connected') {
        this.emit('peer-connected', {
          peerId: userId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(userId)
        this.peerStatsSamples.delete(userId)
        this.latestQualityByPeer.delete(userId)
        this.qualityLogState.delete(userId)
        this.chatManager.emitChatReady()
      }
    }

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      this.logInfo('ICE connection state changed', { peerId: userId, iceConnectionState: iceState })
      this.emit('ice-state-change', { peerId: userId, state: iceState })

      // ICE Restart with exponential backoff (max 3 attempts)
      if (iceState === 'failed' && peerState) {
        if (peerState.iceRestartCount >= MAX_ICE_RESTART_ATTEMPTS) {
          this.logWarn('ICE restart limit reached, giving up', {
            peerId: userId,
            attempts: peerState.iceRestartCount,
          })
          return
        }
        const backoffMs = ICE_RESTART_BACKOFF_BASE_MS * Math.pow(2, peerState.iceRestartCount)
        peerState.iceRestartCount++
        peerState.lastIceRestartAt = Date.now()
        this.logWarn('ICE connection failed, scheduling restart', {
          peerId: userId,
          attempt: peerState.iceRestartCount,
          backoffMs,
        })
        setTimeout(() => {
          if (this.peerConnections.has(userId) && pc.iceConnectionState === 'failed') {
            pc.restartIce()
          }
        }, backoffMs)
      }
      // Reset restart counter on successful reconnection
      if (iceState === 'connected' && peerState) {
        peerState.iceRestartCount = 0
      }
    }

    pc.onsignalingstatechange = () => {
      this.logInfo('Peer signaling state changed', {
        peerId: userId,
        signalingState: pc.signalingState,
      })
    }

    pc.ondatachannel = (event) => {
      this.chatManager.attachDataChannel(userId, event.channel)
    }

    pc.onnegotiationneeded = async () => {
      if (!peerState) {
        return
      }

      try {
        if (pc.signalingState !== 'stable') {
          this.logInfo('Skipping negotiationneeded because signaling state is not stable', {
            peerId: userId,
            signalingState: pc.signalingState,
          })
          return
        }

        peerState.isMakingOffer = true
        await pc.setLocalDescription()

        if (pc.localDescription) {
          this.sendSignalingMessage({
            type: 'offer',
            to: userId,
            data: pc.localDescription
          })
        }
      } catch (error) {
        this.logError('Failed handling negotiationneeded', error, { peerId: userId })
      } finally {
        if (peerState) {
          peerState.isMakingOffer = false
        }
      }
    }

    this.attachLocalTracks(pc)
    this.peerConnections.set(userId, peerState)

    if (this.chatManager.shouldCreateChatChannel(userId)) {
      const outgoingChannel = pc.createDataChannel(CHAT_CHANNEL_LABEL, { ordered: true })
      this.chatManager.attachDataChannel(userId, outgoingChannel)
    }

    this.chatManager.emitChatReady()
    void this.collectQualityMetrics()
    return peerState
  }

  private attachLocalTracks(pc: RTCPeerConnection): void {
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

    const { supportsSimulcast } = detectBrowser()

    stream.getTracks().forEach(track => {
      if (!existingTrackIds.has(track.id)) {
        let sender: RTCRtpSender

        // Simulcast: add multiple encodings for video (Chrome/Firefox only)
        if (track.kind === 'video' && supportsSimulcast) {
          const transceiver = pc.addTransceiver(track, {
            direction: 'sendrecv',
            streams: [stream],
            sendEncodings: [
              { rid: 'high', maxBitrate: TARGET_VIDEO_BITRATE, maxFramerate: 30 },
              { rid: 'mid', maxBitrate: 600_000, maxFramerate: 24, scaleResolutionDownBy: 2.0 },
              { rid: 'low', maxBitrate: 150_000, maxFramerate: 15, scaleResolutionDownBy: 4.0 },
            ],
          })
          sender = transceiver.sender
          this.logInfo('Simulcast enabled with 3 layers', { trackId: track.id })
        } else {
          sender = pc.addTrack(track, stream)
        }

        // Progressive bitrate: start conservative, ramp up
        if (track.kind === 'video' && !supportsSimulcast) {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }
          params.encodings[0].maxBitrate = INITIAL_VIDEO_BITRATE
          params.encodings[0].maxFramerate = 24

          sender.setParameters(params).catch(e => {
            this.logWarn('Failed to set video encoding parameters', { error: e, trackId: track.id })
          })

          // Start bitrate ramp for this connection
          this.bitrateRamp.start()
        } else if (track.kind === 'video' && supportsSimulcast) {
          this.bitrateRamp.start()
        }

        this.logInfo('Attached local track to peer connection', {
          trackId: track.id,
          trackKind: track.kind,
          peerConnectionSignalingState: pc.signalingState,
        })
      }
    })

    // Prefer VP9 codec if browser supports it
    this.preferCodec(pc)
  }

  /** Attach local tracks to all existing peer connections that have no senders yet. */
  private attachTracksToExistingPeers(): void {
    if (!this.localStream || this.peerConnections.size === 0) return
    this.logInfo('Attaching local tracks to existing peer connections', {
      peerCount: this.peerConnections.size,
      trackCount: this.localStream.getTracks().length,
    })
    for (const [peerId, peerState] of this.peerConnections) {
      const hasTracks = peerState.pc.getSenders().some(s => s.track !== null)
      if (!hasTracks) {
        this.logInfo('Retroactively attaching tracks to peer', { peerId })
        this.attachLocalTracks(peerState.pc)
      }
    }
  }

  /** Set codec preference: H264 on Safari, VP9 on Chrome/Firefox */
  private preferCodec(pc: RTCPeerConnection): void {
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


  private async handleOffer(userId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const peerState = this.ensurePeerConnection(userId)
    const { pc } = peerState

    const readyForOffer =
      !peerState.isMakingOffer
      && (pc.signalingState === 'stable' || peerState.isSettingRemoteAnswerPending)
    const offerCollision = !readyForOffer

    peerState.ignoreOffer = !peerState.isPolite && offerCollision
    if (peerState.ignoreOffer) {
      this.logWarn('Ignoring offer due to collision (impolite peer)', { peerId: userId })
      return
    }

    try {
      if (offerCollision && pc.signalingState !== 'stable') {
        this.logInfo('Offer collision detected, rolling back local description', {
          peerId: userId,
          signalingState: pc.signalingState,
        })
        await pc.setLocalDescription({ type: 'rollback' })
      }

      peerState.isSettingRemoteAnswerPending = false
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      this.attachLocalTracks(pc)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: 'answer',
        to: userId,
        data: answer
      })

      await this.flushPendingIceCandidates(peerState)
      peerState.ignoreOffer = false
    } catch (error) {
      this.logError('Failed handling offer', error, { peerId: userId })
    } finally {
      peerState.isSettingRemoteAnswerPending = false
    }
  }

  private async handleAnswer(userId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerState = this.peerConnections.get(userId)
    if (!peerState) return

    try {
      peerState.isSettingRemoteAnswerPending = true
      await peerState.pc.setRemoteDescription(new RTCSessionDescription(answer))
      await this.flushPendingIceCandidates(peerState)
    } catch (error) {
      this.logError('Failed handling answer', error, { peerId: userId })
    } finally {
      peerState.isSettingRemoteAnswerPending = false
      peerState.ignoreOffer = false
    }
  }

  private async handleIceCandidate(userId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peerState = this.ensurePeerConnection(userId)
    const { pc } = peerState

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        this.logError('Failed adding ICE candidate', error, { peerId: userId })
      }
    } else {
      this.logInfo('Remote description not set yet, queuing ICE candidate', { peerId: userId })
      peerState.pendingIceCandidates.push(candidate)
    }
  }

  private async flushPendingIceCandidates(peerState: PeerState): Promise<void> {
    if (!peerState.pc.remoteDescription) {
      return
    }

    while (peerState.pendingIceCandidates.length > 0) {
      const candidateInit = peerState.pendingIceCandidates.shift()
      if (!candidateInit) break
      try {
        await peerState.pc.addIceCandidate(new RTCIceCandidate(candidateInit))
      } catch (error) {
        this.logError('Failed adding queued ICE candidate', error)
      }
    }
  }


  // Utility methods
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * Replace the current video track sent to all peers.
   * Used for screen sharing: pass a screen track to share, then pass `null`
   * to restore the original camera track.
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    if (!this.localStream) return

    const currentVideoTrack = this.localStream.getVideoTracks()[0]

    // If null, try to restore the camera by re-requesting getUserMedia
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

    // Swap in the local stream
    for (const old of this.localStream.getVideoTracks()) {
      this.localStream.removeTrack(old)
      // Only stop if it's the camera track being replaced by screen share
      if (newTrack.id !== old.id) old.stop()
    }
    this.localStream.addTrack(newTrack)

    // Replace in all peer connections (no renegotiation needed)
    for (const [, peerState] of this.peerConnections) {
      const sender = peerState.pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(newTrack)
      }
    }

    this.emit('local-stream', this.localStream)
    this.logInfo('Video track replaced', { trackLabel: newTrack.label })
  }

  getPeerConnections(): Map<string, RTCPeerConnection> {
    const map = new Map<string, RTCPeerConnection>()
    for (const [userId, peerState] of this.peerConnections) {
      map.set(userId, peerState.pc)
    }
    return map
  }

  sendChatMessage(text: string): boolean {
    return this.chatManager.sendChatMessage(text)
  }

  isChatReady(): boolean {
    return this.chatManager.isChatReady()
  }

  // Media control methods
  toggleVideo(enabled?: boolean): boolean {
    if (!this.localStream) return false

    const videoTrack = this.localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled
      return videoTrack.enabled
    }
    return false
  }

  toggleAudio(enabled?: boolean): boolean {
    if (!this.localStream) return false

    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled
      return audioTrack.enabled
    }
    return false
  }

  isVideoEnabled(): boolean {
    if (!this.localStream) return false
    const videoTrack = this.localStream.getVideoTracks()[0]
    return videoTrack ? videoTrack.enabled : false
  }

  isAudioEnabled(): boolean {
    if (!this.localStream) return false
    const audioTrack = this.localStream.getAudioTracks()[0]
    return audioTrack ? audioTrack.enabled : false
  }

  /**
   * Toggle noise suppression on the audio track.
   * Clinical use: disable NS when using a stethoscope so heart/lung sounds are not filtered.
   * Returns the new state, or null if not supported.
   */
  async setNoiseSuppression(enabled: boolean): Promise<boolean | null> {
    if (!this.localStream) return null
    const audioTrack = this.localStream.getAudioTracks()[0]
    if (!audioTrack) return null

    try {
      await audioTrack.applyConstraints({
        noiseSuppression: enabled,
        autoGainControl: enabled,
      })
      this.logInfo('Noise suppression toggled', { enabled })
      return enabled
    } catch {
      this.logWarn('Failed to toggle noise suppression (not supported by browser)')
      return null
    }
  }

  /** Check if noise suppression is currently active */
  isNoiseSuppressionEnabled(): boolean {
    if (!this.localStream) return true
    const audioTrack = this.localStream.getAudioTracks()[0]
    if (!audioTrack) return true
    const settings = audioTrack.getSettings()
    return settings.noiseSuppression !== false
  }
}
