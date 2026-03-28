/**
 * WebRTC Client for AltaMedica Telemedicine
 * Handles peer-to-peer video/audio connections with signaling server
 */

import { createTelemedicineLogger } from './debug'
import { loadIceServers, loadSignalingUrl, ICE_STUN_ONLY, fetchTurnCredentials, hasTurnIceServer } from './config/ice-servers'
import { getAdaptiveConstraints, applyContentHints } from './media-optimizations'
import { MediaManager } from './media-manager'
import { QualityMonitor, type StreamQualitySummary } from './quality-monitor'
export type { StreamQualityLevel, StreamQualityMetrics, StreamQualitySummary } from './quality-monitor'

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

const CHAT_CHANNEL_LABEL = 'autamedica-chat'

// Pre-warm & adaptive media constants
const INITIAL_VIDEO_BITRATE = 500_000  // Start conservative: 500kbps
const TARGET_VIDEO_BITRATE = 2_500_000 // Ramp to 2.5Mbps for 720p quality
const BITRATE_RAMP_DURATION_MS = 10_000 // Over 10 seconds
const BITRATE_RAMP_INTERVAL_MS = 2_000  // Step every 2s
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
  private config: WebRTCConfig
  private readonly sessionId = `${Math.random().toString(36).slice(2, 8)}-${Date.now()}`

  private eventListeners = new Map<keyof WebRTCEvents, Function[]>()
  private connectionState: ConnectionState = 'disconnected'
  private readonly qualityMonitor: QualityMonitor
  private readonly debugLogger: ReturnType<typeof createTelemedicineLogger>
  readonly media: MediaManager
  private isWarmedUp = false
  private warmUpPromise: Promise<WarmUpResult> | null = null
  private bitrateRampInterval: ReturnType<typeof setInterval> | null = null
  private bitrateRampStartMs: number | null = null
  private networkChangeCleanup: (() => void) | null = null
  private onlineOfflineCleanup: (() => void) | null = null
  private turnRefreshInterval: ReturnType<typeof setInterval> | null = null
  private deviceChangeCleanup: (() => void) | null = null

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

    const loggerProxy = {
      info: (msg: string, ctx?: Record<string, unknown>) => this.logInfo(msg, ctx),
      warn: (msg: string, ctx?: Record<string, unknown>) => this.logWarn(msg, ctx),
    }
    this.qualityMonitor = new QualityMonitor({
      logger: loggerProxy,
      roomId: this.config.roomId || 'default-room',
    })
    this.qualityMonitor.onQualitySummary = (summary) => {
      this.emit('stream-quality', summary)
    }

    this.media = new MediaManager(this.debugLogger, this.sessionId, {
      emit: (event: string, ...args: unknown[]) => {
        this.emit(event as keyof WebRTCEvents, ...args as [never])
      },
      onBitrateRampNeeded: () => this.startBitrateRamp(),
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

  /** Monitor network changes (WiFi→cellular etc) and adjust bitrate */
  private startNetworkMonitoring(): void {
    const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string; downlink?: number } }).connection
    if (!conn) return

    const handler = () => {
      const info = conn as { effectiveType?: string; downlink?: number }
      this.logInfo('Network change detected', { effectiveType: info.effectiveType, downlink: info.downlink })

      // On degraded network, reset bitrate ramp to start conservative again
      if (info.effectiveType === '2g' || info.effectiveType === '3g' || info.effectiveType === 'slow-2g') {
        this.stopBitrateRamp()
        for (const [, peerState] of this.peerConnections) {
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

  /** Refresh TURN credentials mid-call (Cloudflare credentials expire in 24h) */
  private startTurnCredentialRefresh(): void {
    if (this.turnRefreshInterval) return
    if (!hasTurnIceServer(this.config.iceServers)) return

    const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // Every 6 hours
    this.turnRefreshInterval = setInterval(async () => {
      try {
        const freshServers = await fetchTurnCredentials()
        if (hasTurnIceServer(freshServers)) {
          this.config.iceServers = freshServers
          // Update existing peer connections with new credentials
          for (const [peerId, peerState] of this.peerConnections) {
            peerState.pc.setConfiguration({
              iceServers: freshServers,
              bundlePolicy: 'max-bundle',
              rtcpMuxPolicy: 'require',
            })
            this.logInfo('TURN credentials refreshed for peer', { peerId })
          }
        }
      } catch {
        this.logWarn('Failed to refresh TURN credentials')
      }
    }, REFRESH_INTERVAL_MS)
  }

  private stopTurnCredentialRefresh(): void {
    if (this.turnRefreshInterval) {
      clearInterval(this.turnRefreshInterval)
      this.turnRefreshInterval = null
    }
  }

  /** Detect browser going offline/online and trigger reconnection */
  private startOnlineOfflineMonitoring(): void {
    if (typeof window === 'undefined') return

    const onOffline = () => {
      this.logWarn('Browser went offline')
      this.emit('error', new Error('network_offline'))
    }

    const onOnline = () => {
      this.logInfo('Browser came back online, restarting ICE for all peers')
      for (const [peerId, peerState] of this.peerConnections) {
        peerState.iceRestartCount = 0
        peerState.pc.restartIce()
        this.logInfo('ICE restart triggered after online recovery', { peerId })
      }
      // Re-start bitrate ramp from conservative
      this.stopBitrateRamp()
      this.startBitrateRamp()
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

  /** Detect when devices are connected/disconnected (headset, camera, etc.) */
  private startDeviceChangeMonitoring(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return

    const handler = async () => {
      const devices = await this.enumerateDevices()
      this.media.setCachedDevices(devices)
      this.emit('device-change', devices)
      this.logInfo('Device change detected', { deviceCount: devices.length })
    }

    navigator.mediaDevices.addEventListener('devicechange', handler)
    this.deviceChangeCleanup = () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }

  private stopDeviceChangeMonitoring(): void {
    this.deviceChangeCleanup?.()
    this.deviceChangeCleanup = null
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
        this.qualityMonitor.start(this.peerConnections)
        return
      }

      this.qualityMonitor.stop()
      this.qualityMonitor.clearState()
      this.emit('stream-quality', {
        roomId: this.config.roomId || 'default-room',
        overallLevel: 'unknown',
        peers: [],
      })
    }
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
      hasExistingStream: !!this.media.getLocalStream(),
    })

    // Run getUserMedia and WS open in parallel
    const [streamResult, signalingResult, devicesResult] = await Promise.allSettled([
      this.media.getLocalStream()
        ? Promise.resolve(this.media.getLocalStream() as MediaStream)
        : navigator.mediaDevices.getUserMedia(constraints ?? getAdaptiveConstraints()),
      this.openSignalingSocket(),
      this.media.enumerateDevices(),
    ])

    // Handle stream
    if (streamResult.status === 'fulfilled') {
      this.media.setLocalStream(streamResult.value)
      const localStream = this.media.getLocalStream() as MediaStream
      this.emit('local-stream', localStream)
      const videoTracks = localStream.getVideoTracks().length
      const audioTracks = localStream.getAudioTracks().length
      this.logInfo('Pre-warm: local media acquired', { videoTracks, audioTracks })
      this.emit('media-acquired', { videoTracks, audioTracks, source: 'warm-up' })
      applyContentHints(localStream)
      this.media.attachTracksToExistingPeers(this.peerConnections)
    } else {
      this.logWarn('Pre-warm: getUserMedia failed, will retry on connect', {
        error: streamResult.reason,
      })
    }

    const signalingReady = signalingResult.status === 'fulfilled'
    const devices = devicesResult.status === 'fulfilled' ? devicesResult.value : []
    this.media.setCachedDevices(devices)

    const latencyMs = Math.round(performance.now() - t0)
    this.isWarmedUp = true
    this.logInfo('Pre-warm complete', { latencyMs, signalingReady, deviceCount: devices.length })

    return {
      stream: this.media.getLocalStream() ?? new MediaStream(),
      devices,
      signalingReady,
      latencyMs,
    }
  }

  /** List available media devices (useful for device selector in Green Room) */
  async enumerateDevices(): Promise<DeviceInfo[]> {
    return this.media.enumerateDevices()
  }

  /** Get cached devices from last warmUp/enumerate */
  getDevices(): DeviceInfo[] {
    return this.media.getDevices()
  }

  /** Switch to a different camera or microphone device */
  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    return this.media.switchDevice(kind, deviceId, this.peerConnections)
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
      if (!this.media.getLocalStream()) {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(getAdaptiveConstraints())
        } catch (mediaError) {
          // Fallback to audio-only if video fails
          this.logWarn('Video getUserMedia failed, falling back to audio-only', { error: mediaError })
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          this.emit('audio-only-fallback', { reason: 'getUserMedia_video_failed', error: mediaError })
        }
        this.media.setLocalStream(stream)
        applyContentHints(stream)
        this.emit('local-stream', stream)
        this.emit('media-acquired', {
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
          source: 'connect',
        })
      }

      // Retroactively attach tracks to any peer connections created before media was ready
      this.media.attachTracksToExistingPeers(this.peerConnections)

      // Monitor network changes for adaptive bitrate
      this.startNetworkMonitoring()
      this.startOnlineOfflineMonitoring()
      this.startTurnCredentialRefresh()
      this.startDeviceChangeMonitoring()

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
    return this.media.startLocalStream(constraints, this.peerConnections)
  }

  stopLocalStream(): void {
    const stream = this.media.getLocalStream()
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      this.media.setLocalStream(null)
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
    this.qualityMonitor.stop()
    this.qualityMonitor.clearState()
    this.stopBitrateRamp()
    this.stopNetworkMonitoring()
    this.stopTurnCredentialRefresh()
    this.stopDeviceChangeMonitoring()

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
        this.qualityMonitor.deletePeer(userId)
        this.emitChatReady()
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
      this.attachDataChannel(userId, event.channel)
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

    this.media.attachLocalTracks(pc)
    this.peerConnections.set(userId, peerState)

    if (this.shouldCreateChatChannel(userId)) {
      const outgoingChannel = pc.createDataChannel(CHAT_CHANNEL_LABEL, { ordered: true })
      this.attachDataChannel(userId, outgoingChannel)
    }

    this.emitChatReady()
    this.qualityMonitor.collectNow()
    return peerState
  }

  /** Gradually increase video bitrate from conservative to target */
  private startBitrateRamp(): void {
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

      // Apply to all video senders
      for (const [, peerState] of this.peerConnections) {
        for (const sender of peerState.pc.getSenders()) {
          if (sender.track?.kind !== 'video') continue
          const params = sender.getParameters()
          if (params.encodings?.[0]) {
            params.encodings[0].maxBitrate = currentBitrate
            // Upgrade framerate at 50% ramp
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

  private stopBitrateRamp(): void {
    if (this.bitrateRampInterval) {
      clearInterval(this.bitrateRampInterval)
      this.bitrateRampInterval = null
    }
    this.bitrateRampStartMs = null
  }

  /** Reduce bitrate when encoder reports cpu or bandwidth limitation */
  private handleQualityLimitation(peerId: string, pc: RTCPeerConnection, reason: string): void {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      const current = params.encodings?.[0]?.maxBitrate
      if (!current || !params.encodings?.[0]) continue

      const reduced = reason === 'cpu'
        ? Math.max(current * 0.6, INITIAL_VIDEO_BITRATE)   // CPU: drop 40%
        : Math.max(current * 0.75, INITIAL_VIDEO_BITRATE)  // Bandwidth: drop 25%

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
  private handlePacketLoss(peerId: string, pc: RTCPeerConnection, lossPct: number): void {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      if (!params.encodings?.[0]) continue

      if (lossPct > 10) {
        // Severe loss: drop to 360p/15fps
        params.encodings[0].maxBitrate = Math.round(INITIAL_VIDEO_BITRATE * 0.5)
        params.encodings[0].maxFramerate = 15
        params.encodings[0].scaleResolutionDownBy = 2.0
      } else {
        // Moderate loss (5-10%): drop to 480p/20fps
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
      this.media.attachLocalTracks(pc)

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
      this.logInfo('Chat channel opened', { remoteUserId })
      this.emitChatReady()
    }

    channel.onclose = () => {
      this.logInfo('Chat channel closed', { remoteUserId })
      if (peerState.dataChannel === channel) {
        peerState.dataChannel = null
      }
      this.emitChatReady()
    }

    channel.onerror = (event) => {
      this.logError('Chat channel error', event, { remoteUserId })
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
        this.logWarn('Ignoring invalid chat payload', { error, remoteUserId })
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
    return this.media.getLocalStream()
  }

  /**
   * Replace the current video track sent to all peers.
   * Used for screen sharing: pass a screen track to share, then pass `null`
   * to restore the original camera track.
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    return this.media.replaceVideoTrack(newTrack, this.peerConnections)
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
        this.logWarn('Chat channel not ready', { remoteUserId })
        continue
      }

      try {
        channel.send(JSON.stringify(payload))
        delivered = true
      } catch (error) {
        this.logError('Failed sending chat message', error, { remoteUserId })
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
    const localStream = this.media.getLocalStream()
    if (!localStream) return false

    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled
      return videoTrack.enabled
    }
    return false
  }

  toggleAudio(enabled?: boolean): boolean {
    const localStream = this.media.getLocalStream()
    if (!localStream) return false

    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled
      return audioTrack.enabled
    }
    return false
  }

  isVideoEnabled(): boolean {
    const localStream = this.media.getLocalStream()
    if (!localStream) return false
    const videoTrack = localStream.getVideoTracks()[0]
    return videoTrack ? videoTrack.enabled : false
  }

  isAudioEnabled(): boolean {
    const localStream = this.media.getLocalStream()
    if (!localStream) return false
    const audioTrack = localStream.getAudioTracks()[0]
    return audioTrack ? audioTrack.enabled : false
  }

  /**
   * Toggle noise suppression on the audio track.
   * Clinical use: disable NS when using a stethoscope so heart/lung sounds are not filtered.
   * Returns the new state, or null if not supported.
   */
  async setNoiseSuppression(enabled: boolean): Promise<boolean | null> {
    if (!this.media.getLocalStream()) return null
    const audioTrack = this.media.getLocalStream().getAudioTracks()[0]
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
    if (!this.media.getLocalStream()) return true
    const audioTrack = this.media.getLocalStream().getAudioTracks()[0]
    if (!audioTrack) return true
    const settings = audioTrack.getSettings()
    return settings.noiseSuppression !== false
  }
}
