/**
 * WebRTC Client for AltaMedica Telemedicine
 * Handles peer-to-peer video/audio connections with signaling server
 */

import { logger } from '@autamedica/shared'
import { loadIceServers, ICE_STUN_ONLY } from './config/ice-servers'

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
}

export interface StreamQualitySummary {
  roomId: string
  overallLevel: StreamQualityLevel
  peers: StreamQualityMetrics[]
}

export interface WebRTCEvents {
  'connection-state': (state: ConnectionState) => void
  'remote-stream': (stream: MediaStream, userId: string) => void
  'local-stream': (stream: MediaStream) => void
  'user-joined': (userId: string, userType: string) => void
  'user-left': (userId: string) => void
  'chat-message': (message: ChatMessage) => void
  'chat-ready': (ready: boolean) => void
  'stream-quality': (summary: StreamQualitySummary) => void
  'error': (error: Error) => void
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

const QUALITY_POLL_INTERVAL_MS = 5000
const QUALITY_LOG_INTERVAL_MS = 30000
const CHAT_CHANNEL_LABEL = 'autamedica-chat'
const QUALITY_SCORE_TO_LEVEL: StreamQualityLevel[] = ['poor', 'fair', 'good', 'excellent']

export class WebRTCClient {
  private ws: WebSocket | null = null
  private peerConnections = new Map<string, PeerState>()
  private localStream: MediaStream | null = null
  private config: WebRTCConfig
  private readonly sessionId = `${Math.random().toString(36).slice(2, 8)}-${Date.now()}`
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private eventListeners = new Map<keyof WebRTCEvents, Function[]>()
  private connectionState: ConnectionState = 'disconnected'
  private qualityInterval: ReturnType<typeof setInterval> | null = null
  private peerStatsSamples = new Map<string, PeerStatsSample>()
  private latestQualityByPeer = new Map<string, StreamQualityMetrics>()
  private qualityLogState = new Map<string, { level: StreamQualityLevel; at: number }>()

  constructor(config: Partial<WebRTCConfig> & { userId: string; userType: 'doctor' | 'patient' | 'nurse' }) {
    // Use environment-configured ICE servers or fallback to STUN-only defaults
    const envServers = loadIceServers()
    const iceServers = config.iceServers || (envServers.length > 0 ? envServers : ICE_STUN_ONLY)

    this.config = {
      signalingUrl: 'wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling',
      iceServers,
      roomId: 'default-room',
      ...config
    }
  }

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    logger.info(`[WebRTCClient] ${message}`, {
      sessionId: this.sessionId,
      roomId: this.config.roomId,
      userId: this.config.userId,
      userType: this.config.userType,
      ...context,
    })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    logger.warn(`[WebRTCClient] ${message}`, {
      sessionId: this.sessionId,
      roomId: this.config.roomId,
      userId: this.config.userId,
      userType: this.config.userType,
      ...context,
    })
  }

  private logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
    logger.error(`[WebRTCClient] ${message}`, {
      sessionId: this.sessionId,
      roomId: this.config.roomId,
      userId: this.config.userId,
      userType: this.config.userType,
      ...context,
    }, error)
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

  private classifyQualityLevel(metrics: Omit<StreamQualityMetrics, 'userId' | 'timestamp' | 'level'>): StreamQualityLevel {
    const scores: number[] = []

    if (metrics.inboundVideoBitrateKbps !== null) {
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
      } catch (error) {
        this.logWarn('Failed collecting stream quality stats', { peerId: userId, error })
      }
    }

    this.emit('stream-quality', {
      roomId: this.config.roomId || 'default-room',
      overallLevel: this.getOverallQualityLevel(peers),
      peers,
    })
  }

  async connect(roomId?: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return
    }

    this.setConnectionState('connecting')

    try {
      const finalRoomId = roomId || this.config.roomId || 'default-room'
      this.config.roomId = finalRoomId
      const wsUrl = `${this.config.signalingUrl}?roomId=${encodeURIComponent(finalRoomId)}`

      this.ws = new WebSocket(wsUrl)
      this.logInfo('Opening signaling socket', { signalingUrl: this.config.signalingUrl, wsUrl })

      this.ws.onopen = () => {
        this.logInfo('WebSocket connected')
        // Join the room
        this.sendSignalingMessage({
          type: 'join',
          from: this.config.userId,
          data: { userType: this.config.userType }
        })
      }

      this.ws.onmessage = (event) => {
        try {
          this.handleSignalingMessage(JSON.parse(event.data) as ServerSignalingMessage)
        } catch (error) {
          this.logError('Failed parsing signaling message', error, {
            payloadPreview: String(event.data).slice(0, 200),
          })
        }
      }

      this.ws.onerror = (error) => {
        this.logError('WebSocket error', error)
        this.setConnectionState('failed')
        this.emit('error', new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        this.logInfo('WebSocket disconnected')
        this.setConnectionState('disconnected')
        this.cleanup()
      }

      // Wait for connection
      const ws = this.ws
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 10000)

        const originalOnOpen = ws.onopen
        ws.onopen = (event) => {
          clearTimeout(timeout)
          originalOnOpen?.call(ws, event)
          resolve()
        }

        const originalOnError = ws.onerror
        ws.onerror = (error) => {
          clearTimeout(timeout)
          originalOnError?.call(ws, error)
          reject(new Error('WebSocket connection failed'))
        }
      })

    } catch (error) {
      this.setConnectionState('failed')
      this.logError('Failed connecting to signaling server', error)
      throw error
    }
  }

  async startLocalStream(constraints: MediaConstraints = { video: true, audio: true }): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
      this.emit('local-stream', this.localStream)
      this.logInfo('Local media stream started', {
        videoTrackCount: this.localStream.getVideoTracks().length,
        audioTrackCount: this.localStream.getAudioTracks().length,
      })

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
        // Handle initial room state
        for (const user of message.data.users) {
          this.emit('user-joined', user.id, user.userType)
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
          this.emitChatReady()
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

    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers })
    const isPolite = this.config.userType !== 'doctor'
    this.logInfo('Creating peer connection', { peerId: userId, isPolite })

    peerState = {
      pc,
      pendingIceCandidates: [],
      isMakingOffer: false,
      isSettingRemoteAnswerPending: false,
      ignoreOffer: false,
      isPolite,
      dataChannel: null
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(userId)
        this.peerStatsSamples.delete(userId)
        this.latestQualityByPeer.delete(userId)
        this.qualityLogState.delete(userId)
        this.emitChatReady()
      }
    }

    pc.oniceconnectionstatechange = () => {
      this.logInfo('ICE connection state changed', {
        peerId: userId,
        iceConnectionState: pc.iceConnectionState,
      })

      // ICE Restart for seamless recovery on network changes (Streamer level resilience)
      if (pc.iceConnectionState === 'failed') {
        this.logWarn('ICE connection failed, attempting restart', { peerId: userId })
        pc.restartIce()
      }
    }

    pc.onsignalingstatechange = () => {
      this.logInfo('Peer signaling state changed', {
        peerId: userId,
        signalingState: pc.signalingState,
      })
    }

    pc.ondatachannel = (event) => {
      this.attachDataChannel(userId, event.channel)
    }

    pc.onnegotiationneeded = async () => {
      if (!peerState) {
        return
      }

      try {
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

    if (this.shouldCreateChatChannel(userId)) {
      const outgoingChannel = pc.createDataChannel(CHAT_CHANNEL_LABEL, { ordered: true })
      this.attachDataChannel(userId, outgoingChannel)
    }

    this.emitChatReady()
    void this.collectQualityMetrics()
    return peerState
  }

  private attachLocalTracks(pc: RTCPeerConnection): void {
    const stream = this.localStream
    if (!stream) return

    const existingTrackIds = new Set(
      pc.getSenders()
        .map(sender => sender.track?.id)
        .filter((id): id is string => Boolean(id))
    )

    stream.getTracks().forEach(track => {
      if (!existingTrackIds.has(track.id)) {
        const sender = pc.addTrack(track, stream)
        
        // Optimizar bitrate de video (Streamer level)
        if (track.kind === 'video') {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }
          // Priorizar 1.5Mbps y degradación elegante
          params.encodings[0].maxBitrate = 1500000 
          params.encodings[0].maxFramerate = 30
          // networkPriority requires TypeScript DOM lib update or any cast, let's use standard properties
          
          sender.setParameters(params).catch(e => {
            this.logWarn('Failed to set video encoding parameters', { error: e, trackId: track.id })
          })
        }

        this.logInfo('Attached local track to peer connection', {
          trackId: track.id,
          trackKind: track.kind,
          peerConnectionSignalingState: pc.signalingState,
        })
      }
    })
  }

  private async handleOffer(userId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const peerState = this.ensurePeerConnection(userId)
    const { pc } = peerState

    const offerCollision = peerState.isMakingOffer || pc.signalingState !== 'stable'

    peerState.ignoreOffer = !peerState.isPolite && offerCollision
    if (peerState.ignoreOffer) {
      this.logWarn('Ignoring offer due to collision (impolite peer)', { peerId: userId })
      return
    }

    try {
      if (offerCollision) {
        this.logInfo('Offer collision detected, rolling back local description', { peerId: userId })
        await pc.setLocalDescription({ type: 'rollback' })
      }

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

  private shouldCreateChatChannel(remoteUserId: string): boolean {
    return this.config.userId.localeCompare(remoteUserId) < 0
  }

  private attachDataChannel(remoteUserId: string, channel: RTCDataChannel): void {
    const peerState = this.peerConnections.get(remoteUserId)
    if (!peerState) {
      return
    }

    peerState.dataChannel = channel

    channel.onopen = () => {
      logger.info(`Chat channel opened with ${remoteUserId}`)
      this.emitChatReady()
    }

    channel.onclose = () => {
      logger.info(`Chat channel closed with ${remoteUserId}`)
      if (peerState.dataChannel === channel) {
        peerState.dataChannel = null
      }
      this.emitChatReady()
    }

    channel.onerror = (event) => {
      logger.error(`Chat channel error with ${remoteUserId}:`, event)
    }

    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      try {
        const parsed = JSON.parse(event.data) as ChatMessage
        if (!parsed || parsed.senderId === this.config.userId || typeof parsed.text !== 'string') {
          return
        }
        this.emit('chat-message', parsed)
      } catch (error) {
        logger.warn('Ignoring invalid chat payload:', error)
      }
    }

    this.emitChatReady()
  }

  private emitChatReady(): void {
    this.emit('chat-ready', this.isChatReady())
  }

  // Utility methods
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getPeerConnections(): Map<string, RTCPeerConnection> {
    const map = new Map<string, RTCPeerConnection>()
    for (const [userId, peerState] of this.peerConnections) {
      map.set(userId, peerState.pc)
    }
    return map
  }

  sendChatMessage(text: string): boolean {
    const trimmedText = text.trim()
    if (!trimmedText) {
      return false
    }

    const payload: ChatMessage = {
      id: `${this.config.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: trimmedText,
      senderId: this.config.userId,
      senderType: this.config.userType,
      senderName: this.config.userName,
      timestamp: Date.now()
    }

    let delivered = false

    for (const [remoteUserId, peerState] of this.peerConnections) {
      const channel = peerState.dataChannel
      if (channel?.readyState !== 'open') {
        logger.warn(`Chat channel not ready for ${remoteUserId}`)
        continue
      }

      try {
        channel.send(JSON.stringify(payload))
        delivered = true
      } catch (error) {
        logger.error(`Failed sending chat message to ${remoteUserId}:`, error)
      }
    }

    return delivered
  }

  isChatReady(): boolean {
    for (const [, peerState] of this.peerConnections) {
      if (peerState.dataChannel?.readyState === 'open') {
        return true
      }
    }
    return false
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
}
