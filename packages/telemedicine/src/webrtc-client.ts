/**
 * WebRTC Client for AltaMedica Telemedicine
 * Orchestrator: delegates to BitrateAdapter, TurnManager, PeerConnectionFactory,
 * MediaManager, and QualityMonitor for specific concerns.
 */

import { createTelemedicineLogger } from './debug'
import { openSignalingSocket } from './signaling-socket'
import { loadIceServers, loadSignalingUrl, ICE_STUN_ONLY } from './config/ice-servers'
import { getAdaptiveConstraints, applyContentHints } from './media-optimizations'
import { MediaManager } from './media-manager'
import { QualityMonitor, type StreamQualitySummary, type CallQualitySummary } from './quality-monitor'
import { BitrateAdapter } from './bitrate-adapter'
import { TurnManager } from './turn-manager'
import { PeerConnectionFactory, type PeerState, type ChatMessage, type DataChannelControlMessage } from './peer-connection-factory'
export type { StreamQualityLevel, StreamQualityMetrics, StreamQualitySummary, CallQualitySummary, CallQualityTimelineEntry, CallQualityWorstMetrics, CallQualityAverageMetrics } from './quality-monitor'
export type { ChatMessage, DataChannelControlMessage } from './peer-connection-factory'

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

export interface WebRTCEvents {
  'connection-state': (state: ConnectionState) => void
  'remote-stream': (stream: MediaStream, userId: string) => void
  'local-stream': (stream: MediaStream) => void
  'user-joined': (userId: string, userType: string) => void
  'user-left': (userId: string) => void
  'chat-message': (message: ChatMessage) => void
  'control-message': (message: DataChannelControlMessage) => void
  'chat-ready': (ready: boolean) => void
  'stream-quality': (summary: StreamQualitySummary) => void
  'audio-only-fallback': (info: { reason: string; error: unknown }) => void
  'device-change': (devices: DeviceInfo[]) => void
  'error': (error: Error) => void
  'media-acquired': (info: { videoTracks: number; audioTracks: number; source: string }) => void
  'signaling-connected': (info: { latencyMs: number }) => void
  'ice-state-change': (info: { peerId: string; state: string }) => void
  'peer-connected': (info: { peerId: string; connectionState: string; iceConnectionState: string }) => void
  'call-quality-summary': (summary: CallQualitySummary) => void
  'reconnecting': (info: { peerId: string; attempt: number; maxAttempts: number }) => void
  'reconnected': (info: { peerId: string; afterAttempts: number }) => void
  'clinical-mode-changed': (info: { enabled: boolean; source: 'local' | 'remote' }) => void
  'remote-audio-silent': (info: { durationMs: number; userId: string }) => void
  'quality-report': (metrics: import('./quality-monitor').StreamQualityMetrics) => void
}

type ServerSignalingMessage =
  | { type: 'room-state'; data: { users: Array<{ id: string; userType: string }> } }
  | { type: 'user-joined'; from: string; data: { userType: string } }
  | { type: 'user-left'; from: string }
  | { type: 'offer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; data: RTCIceCandidateInit }
  | { type: 'error'; data: string }

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
  private readonly bitrateAdapter: BitrateAdapter
  private readonly turnManager: TurnManager
  private readonly peerFactory: PeerConnectionFactory
  readonly media: MediaManager
  private isWarmedUp = false
  private warmUpPromise: Promise<WarmUpResult> | null = null

  constructor(config: Partial<WebRTCConfig> & { userId: string; userType: 'doctor' | 'patient' | 'nurse' }) {
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
    this.qualityMonitor.onRemoteAudioSilent = (info) => {
      this.emit('remote-audio-silent', info)
      this.logWarn('Remote audio silent', info)
    }

    this.qualityMonitor.onQualityReport = (metrics) => {
      this.emit('quality-report', metrics)
    }

    this.qualityMonitor.onQualitySummary = (summary) => {
      this.emit('stream-quality', summary)

      // BWE feedback loop: adapt bitrate based on available bandwidth
      for (const peer of summary.peers) {
        if (peer.availableOutgoingBitrateKbps !== null && peer.availableOutgoingBitrateKbps > 0) {
          this.bitrateAdapter.adaptToBandwidthEstimate(this.peerConnections, peer.availableOutgoingBitrateKbps)
          break // One BWE estimate is enough — all peers share the same uplink
        }
      }

      // Proactive quality degradation: reduce bitrate on early warning signs
      for (const peer of summary.peers) {
        if (peer.level === 'fair' || peer.level === 'poor') {
          this.bitrateAdapter.handleQualityDegradation(this.peerConnections, peer.level, {
            packetsLostPct: peer.packetsLostPct,
            roundTripTimeMs: peer.roundTripTimeMs,
          })
          break // Apply once per summary cycle
        }
      }
    }

    const emitCallback = {
      emit: (event: string, ...args: unknown[]) => {
        this.emit(event as keyof WebRTCEvents, ...args as [never])
      },
    }

    this.media = new MediaManager(this.debugLogger, this.sessionId, {
      ...emitCallback,
      onBitrateRampNeeded: () => this.bitrateAdapter.startBitrateRamp(this.peerConnections),
    })

    this.bitrateAdapter = new BitrateAdapter(this.debugLogger, this.sessionId, emitCallback)
    this.turnManager = new TurnManager(this.debugLogger, this.sessionId)
    this.peerFactory = new PeerConnectionFactory(
      this.debugLogger,
      this.sessionId,
      this.media,
      this.qualityMonitor,
      {
        ...emitCallback,
        sendSignalingMessage: (msg) => this.sendSignalingMessage(msg),
        emitChatReady: () => this.emitChatReady(),
      },
    )

    // Promote to 'connected' when any peer's RTCPeerConnection actually connects
    this.on('peer-connected', () => {
      this.setConnectionState('connected')
    })

    // Track audio-only fallbacks for call summary
    this.on('audio-only-fallback', () => {
      this.qualityMonitor.recordAudioOnlyFallback()
    })

    // Handle incoming control messages (clinical-mode, etc.)
    this.on('control-message', (msg) => {
      this.handleControlMessage(msg)
    })
  }

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.debugLogger.info(message, { sessionId: this.sessionId, ...context })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    this.debugLogger.warn(message, { sessionId: this.sessionId, ...context })
  }

  private logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
    this.debugLogger.error(message, error, { sessionId: this.sessionId, ...context })
  }

  // Event listener methods
  on<T extends keyof WebRTCEvents>(event: T, listener: WebRTCEvents[T]): () => void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = []
      this.eventListeners.set(event, listeners)
    }
    listeners.push(listener)
    return () => { this.off(event, listener) }
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
      this.logInfo('Connection state changed', { from: previousState, to: state })

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

    const [streamResult, signalingResult, devicesResult] = await Promise.allSettled([
      this.media.getLocalStream()
        ? Promise.resolve(this.media.getLocalStream() as MediaStream)
        : navigator.mediaDevices.getUserMedia(constraints ?? getAdaptiveConstraints()),
      this.openSignalingSocket(),
      this.media.enumerateDevices(),
    ])

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

  async enumerateDevices(): Promise<DeviceInfo[]> {
    return this.media.enumerateDevices()
  }

  getDevices(): DeviceInfo[] {
    return this.media.getDevices()
  }

  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    return this.media.switchDevice(kind, deviceId, this.peerConnections)
  }

  async measureSignalingLatency(): Promise<number | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return null
    const start = performance.now()
    return Math.round(performance.now() - start)
  }

  private openSignalingSocket(): Promise<void> {
    const roomId = this.config.roomId || 'default-room'
    const wsState = { ws: this.ws, promise: this.signalingSocketPromise }
    const result = openSignalingSocket(
      this.config.signalingUrl,
      roomId,
      {
        logger: { logInfo: this.logInfo.bind(this), logWarn: this.logWarn.bind(this), logError: this.logError.bind(this) },
        setConnectionState: (s) => this.setConnectionState(s as ConnectionState),
        handleMessage: (msg) => { void this.handleSignalingMessage(msg as ServerSignalingMessage) },
        emit: (event, ...args) => this.emit(event as keyof WebRTCEvents, ...args as [never]),
        cleanup: () => this.cleanup(),
      },
      wsState,
    )
    this.ws = wsState.ws
    this.signalingSocketPromise = wsState.promise
    return result
  }

  async connect(roomId?: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return
    }

    this.setConnectionState('connecting')

    try {
      const finalRoomId = roomId || this.config.roomId || 'default-room'
      this.config.roomId = finalRoomId

      if (this.ws?.readyState !== WebSocket.OPEN) {
        await this.openSignalingSocket()
      }

      if (!this.media.getLocalStream()) {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(getAdaptiveConstraints())
        } catch (mediaError) {
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

      this.media.attachTracksToExistingPeers(this.peerConnections)
      this.bitrateAdapter.startNetworkMonitoring(this.peerConnections)
      this.bitrateAdapter.startOnlineOfflineMonitoring(this.peerConnections)
      this.turnManager.startTurnCredentialRefresh(this.config.iceServers, (freshServers) => {
        this.config.iceServers = freshServers
        for (const [peerId, peerState] of this.peerConnections) {
          peerState.pc.setConfiguration({
            iceServers: freshServers,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
          })
          this.logInfo('TURN credentials refreshed for peer', { peerId })
        }
      })
      this.media.startDeviceChangeMonitoring()

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
    this.media.getAudioFilter().destroy()
    const stream = this.media.getLocalStream()
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      this.media.setLocalStream(null)
      this.logInfo('Local media stream stopped')
    }
  }

  async disconnect(): Promise<void> {
    this.logInfo('Disconnect requested')

    // Emit call quality summary before cleanup destroys the data
    const iceRestartCount = this.getTotalIceRestartCount()
    const summary = this.qualityMonitor.getCallSummary(iceRestartCount)
    if (summary.totalDurationMs > 0) {
      this.emit('call-quality-summary', summary)
      this.logInfo('Call quality summary emitted', {
        totalDurationMs: summary.totalDurationMs,
        qualityBreakdown: summary.qualityBreakdown,
        iceRestartCount: summary.iceRestartCount,
        audioOnlyPeriods: summary.audioOnlyPeriods,
      })
    }

    this.setConnectionState('disconnected')

    if (this.ws) {
      this.sendSignalingMessage({ type: 'leave' })
      this.ws.close()
      this.ws = null
    }

    this.cleanup()
  }

  private getTotalIceRestartCount(): number {
    let total = 0
    for (const [, peerState] of this.peerConnections) {
      total += peerState.iceRestartCount
    }
    return total
  }

  private cleanup(): void {
    this.qualityMonitor.stop()
    this.qualityMonitor.clearState()
    this.bitrateAdapter.stopBitrateRamp()
    this.bitrateAdapter.stopNetworkMonitoring()
    this.turnManager.stopTurnCredentialRefresh()
    this.media.stopDeviceChangeMonitoring()

    for (const [, peerState] of this.peerConnections) {
      peerState.dataChannel?.close()
      peerState.pc.close()
    }
    this.peerConnections.clear()
    this.emit('chat-ready', false)

    this.stopLocalStream()
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
        for (const user of message.data.users) {
          this.emit('user-joined', user.id, user.userType)
          this.ensurePeerConnection(user.id)
        }
        // Only mark as 'connecting' here — real 'connected' comes from
        // pc.onconnectionstatechange when the WebRTC peer actually connects
        if (this.connectionState !== 'connected') {
          this.setConnectionState('connecting')
        }
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
    return this.peerFactory.ensurePeerConnection(
      userId,
      this.config.iceServers,
      this.config.userId,
      this.config.userType,
      this.peerConnections,
    )
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
      // MDN Perfect Negotiation: setRemoteDescription(offer) auto-rolls back
      // any pending local offer on polite peer — no explicit rollback needed.
      peerState.isSettingRemoteAnswerPending = false
      await pc.setRemoteDescription(offer)

      const answer = await pc.createAnswer()
      const { mungeOpusSdp } = await import('./utils/sdp-helpers')
      const mungedSdp = mungeOpusSdp(answer.sdp || '')
      
      await pc.setLocalDescription({ type: answer.type, sdp: mungedSdp })

      if (pc.localDescription) {
        this.sendSignalingMessage({ type: 'answer', to: userId, data: pc.localDescription })
      }

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
    if (!peerState.pc.remoteDescription) return

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

  private emitChatReady(): void {
    this.emit('chat-ready', this.isChatReady())
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getLocalStream(): MediaStream | null {
    return this.media.getLocalStream()
  }

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
    if (!trimmedText) return false

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

  /**
   * Toggle clinical mode on the LOCAL audio track.
   * When called by the patient's client (e.g. in response to a remote request),
   * it disables all audio processing so the doctor receives raw clinical audio.
   */
  async setClinicalMode(enabled: boolean): Promise<void> {
    await this.media.setClinicalMode(enabled, this.peerConnections)
    this.emit('clinical-mode-changed', { enabled, source: 'local' })
  }

  /**
   * Doctor-side: request the remote patient to switch their audio to clinical mode.
   * Sends a control message via DataChannel. The patient's client auto-responds
   * by toggling their local audio processing.
   * Doctor's own audio is NOT affected — always stays processed.
   */
  requestRemoteClinicalMode(enabled: boolean): boolean {
    return this.sendControlMessage({
      type: 'clinical-mode',
      payload: { enabled },
    })
  }

  private sendControlMessage(msg: Omit<DataChannelControlMessage, '_control' | 'senderId' | 'timestamp'>): boolean {
    const payload: DataChannelControlMessage = {
      _control: true,
      type: msg.type,
      payload: msg.payload,
      senderId: this.config.userId,
      timestamp: Date.now(),
    }

    let delivered = false
    for (const [remoteUserId, peerState] of this.peerConnections) {
      const channel = peerState.dataChannel
      if (channel?.readyState !== 'open') continue
      try {
        channel.send(JSON.stringify(payload))
        delivered = true
      } catch (error) {
        this.logError('Failed sending control message', error, { remoteUserId })
      }
    }
    return delivered
  }

  private handleControlMessage(msg: DataChannelControlMessage): void {
    this.logInfo('Received control message', { type: msg.type, from: msg.senderId })

    if (msg.type === 'clinical-mode') {
      const enabled = msg.payload.enabled === true
      // Auto-apply: remote requested us to change our audio processing
      void this.setClinicalMode(enabled).then(() => {
        this.emit('clinical-mode-changed', { enabled, source: 'remote' })
      })
    }
  }

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

  async setNoiseSuppression(enabled: boolean): Promise<boolean | null> {
    const stream = this.media.getLocalStream()
    if (!stream) return null
    const audioTrack = stream.getAudioTracks()[0]
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

  isNoiseSuppressionEnabled(): boolean {
    const localStream = this.media.getLocalStream()
    if (!localStream) return true
    const audioTrack = localStream.getAudioTracks()[0]
    if (!audioTrack) return true
    const settings = audioTrack.getSettings()
    return settings.noiseSuppression !== false
  }

  /**
   * Tune the jitter buffer target delay for audio receivers.
   * Lower values = less latency (better for real-time auscultation).
   * Higher values = smoother playback (better for poor networks).
   *
   * Recommended: 50-80ms for clinical/auscultation, 100-150ms for conversation on poor networks.
   * Pass null to reset to browser default (adaptive).
   */
  setJitterBufferTarget(targetMs: number | null): void {
    for (const [peerId, peerState] of this.peerConnections) {
      for (const receiver of peerState.pc.getReceivers()) {
        if (receiver.track?.kind !== 'audio') continue
        if ('jitterBufferTarget' in receiver) {
          (receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget =
            targetMs !== null ? targetMs / 1000 : null
          this.logInfo('Jitter buffer target set', { peerId, targetMs })
        }
      }
    }
  }
}
