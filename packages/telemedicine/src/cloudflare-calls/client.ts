/**
 * CloudflareCallsClient
 *
 * Drop-in replacement de WebRTCClient que enruta el media a través del SFU de
 * Cloudflare Calls en lugar de usar WebRTC P2P directo.
 *
 * Protocolo de señalización (via WebSocket existente):
 *   → { type: 'join', from: userId, data: { userType } }
 *   ← { type: 'room-state', data: { users: [...] } }
 *   ← { type: 'user-joined', from: userId, data: { userType } }
 *   → { type: 'cf-session', from: userId, data: { sessionId, userType } }   (anuncio de sesión CF)
 *   ← { type: 'cf-session', from: userId, data: { sessionId, userType } }   (sesión del peer)
 *   ↔ { type: 'chat',      from: userId, data: { message } }                (chat via WS)
 *   → { type: 'leave' }
 */

import { loadSignalingUrl } from '../config/ice-servers'
import { getAdaptiveConstraints, applyContentHints } from '../media-optimizations'
import type { CallProvider, ConnectionState, DeviceInfo, WarmUpResult, WebRTCEvents } from '../providers/types'
import type {
  ChatMessage,
  StreamQualityLevel,
  StreamQualitySummary,
} from '../webrtc-client'
import { CloudflareCallsSession } from './session'

type ServerMessage =
  | { type: 'room-state'; data: { users: Array<{ id: string; userType: string }> } }
  | { type: 'user-joined'; from: string; data: { userType: string } }
  | { type: 'user-left'; from: string }
  | { type: 'cf-session'; from: string; data: { sessionId: string; userType: string } }
  | { type: 'chat'; from: string; data: { message: ChatMessage } }
  | { type: 'error'; data: string }

export interface CloudflareCallsClientConfig {
  userId: string
  userName?: string
  userType: 'doctor' | 'patient' | 'nurse'
  roomId?: string
  /** URL del proxy API (default: '/api/cloudflare-calls') */
  apiProxyUrl?: string
  /** URL del servidor de señalización (default: PUBLIC_SIGNALING_URL) */
  signalingUrl?: string
}

export class CloudflareCallsClient implements CallProvider {
  private ws: WebSocket | null = null
  private cfSession: CloudflareCallsSession | null = null
  private localStream: MediaStream | null = null
  private connectionState: ConnectionState = 'disconnected'
  private cachedDevices: DeviceInfo[] = []
  private streamIdToUserId = new Map<string, string>()
  private pendingRemoteUserIds: string[] = []
  private connectedPeerIds = new Set<string>()
  private pendingSessionId: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<keyof WebRTCEvents, ((...args: any[]) => void)[]>()
  private readonly config: Required<Omit<CloudflareCallsClientConfig, 'userName'>> & { userName?: string }

  // ── Reconnect state ──
  private intentionalClose = false
  private signalingReconnectAttempt = 0
  private signalingReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly MAX_SIGNALING_RECONNECT = 5
  private static readonly SIGNALING_BACKOFF_BASE_MS = 1_000

  constructor(cfg: CloudflareCallsClientConfig) {
    this.config = {
      userId: cfg.userId,
      userName: cfg.userName,
      userType: cfg.userType,
      roomId: cfg.roomId ?? 'default-room',
      apiProxyUrl: cfg.apiProxyUrl ?? '/api/cloudflare-calls',
      signalingUrl: cfg.signalingUrl ?? loadSignalingUrl(),
    }
  }

  /* ── Event emitter ── */

  on<E extends keyof WebRTCEvents>(event: E, handler: WebRTCEvents[E]): () => void {
    const arr = this.listeners.get(event) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arr.push(handler as (...args: any[]) => void)
    this.listeners.set(event, arr)
    return () => {
      const cur = this.listeners.get(event) ?? []
      this.listeners.set(event, cur.filter((h) => h !== handler))
    }
  }

  private emit<E extends keyof WebRTCEvents>(event: E, ...args: Parameters<WebRTCEvents[E]>): void {
    for (const h of this.listeners.get(event) ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(h as (...a: any[]) => void)(...args)
      } catch {
        // no-op: listener errors must not crash the client
      }
    }
  }

  /* ── Media ── */

  async warmUp(constraints?: MediaStreamConstraints): Promise<WarmUpResult> {
    const t0 = Date.now()
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints ?? getAdaptiveConstraints())
    } catch {
      if (constraints) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(getAdaptiveConstraints())
        } catch {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        }
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
    }
    applyContentHints(this.localStream)
    this.emit('local-stream', this.localStream)

    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      this.cachedDevices = devs
        .filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput' || d.kind === 'audiooutput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind as DeviceInfo['kind'] }))
    } catch { /* ignore */ }

    return {
      stream: this.localStream,
      devices: this.cachedDevices,
      signalingReady: false,
      latencyMs: Date.now() - t0,
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  private async acquireVideoTrack(): Promise<MediaStreamTrack | null> {
    const constraints = getAdaptiveConstraints()
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: constraints.video,
        audio: false,
      })
      return cameraStream.getVideoTracks()[0] ?? null
    } catch {
      return null
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<boolean> {
    if (!this.localStream) return false

    const currentTrack = this.localStream.getVideoTracks()[0] ?? null
    if (!enabled) {
      if (!currentTrack) return false
      currentTrack.enabled = false
      await this.cfSession?.replacePublishedVideoTrack(null)
      this.localStream.removeTrack(currentTrack)
      currentTrack.stop()
      this.emit('local-stream', this.localStream)
      return false
    }

    if (currentTrack?.readyState === 'live') {
      currentTrack.enabled = true
      await this.cfSession?.replacePublishedVideoTrack(currentTrack)
      this.emit('local-stream', this.localStream)
      return true
    }

    const newTrack = await this.acquireVideoTrack()
    if (!newTrack) return false

    this.localStream.addTrack(newTrack)
    await this.cfSession?.replacePublishedVideoTrack(newTrack)
    this.emit('local-stream', this.localStream)
    return true
  }

  toggleVideo(enabled?: boolean): boolean {
    const tracks = this.localStream?.getVideoTracks() ?? []
    const next = enabled !== undefined ? enabled : !tracks[0]?.enabled
    void this.setCameraEnabled(next)
    return next
  }

  toggleAudio(enabled?: boolean): boolean {
    const tracks = this.localStream?.getAudioTracks() ?? []
    const next = enabled !== undefined ? enabled : !tracks[0]?.enabled
    tracks.forEach((t) => { t.enabled = next })
    return next
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    if (!this.localStream) return
    if (!newTrack) {
      const currentVideo = this.localStream.getVideoTracks()[0]
      if (currentVideo?.readyState === 'live') return
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        newTrack = camStream.getVideoTracks()[0]
        if (!newTrack) return
      } catch { return }
    }
    for (const old of this.localStream.getVideoTracks()) {
      this.localStream.removeTrack(old)
      if (newTrack.id !== old.id) old.stop()
    }
    this.localStream.addTrack(newTrack)
    this.emit('local-stream', this.localStream)
  }

  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    if (!this.localStream) return
    const constraint = kind === 'video' ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } }
    const newStream = await navigator.mediaDevices.getUserMedia(constraint)
    const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0]
    if (!newTrack) return
    // Stop and replace old track
    const oldTracks = kind === 'video' ? this.localStream.getVideoTracks() : this.localStream.getAudioTracks()
    oldTracks.forEach((t) => { t.stop(); this.localStream?.removeTrack(t) })
    this.localStream.addTrack(newTrack)
    this.emit('local-stream', this.localStream)
  }

  /* ── Connection ── */

  async connect(roomId?: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') return

    const finalRoomId = roomId ?? this.config.roomId
    this.config.roomId = finalRoomId
    this.intentionalClose = false
    this.signalingReconnectAttempt = 0
    this.setConnectionState('connecting')

    try {
      if (!this.localStream) await this.warmUp()

      // 1. Conectar al servidor de señalización para coordinación entre peers
      await this.connectSignaling(finalRoomId)

      // 2. Crear sesión CF Calls y publicar tracks locales
      this.cfSession = new CloudflareCallsSession({
        apiProxyUrl: this.config.apiProxyUrl,
        onTrack: (event) => this.handleRemoteTrack(event),
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            if (this.connectionState === 'connecting' || this.connectionState === 'disconnected') {
              this.setConnectionState('connected')
            }
            // If we were recovering from a transient state, emit reconnected
            if (this.connectionState === 'connected') {
              this.emit('reconnected', { peerId: 'sfu', afterAttempts: 1 })
            }
          } else if (state === 'disconnected') {
            this.emit('reconnecting', { peerId: 'sfu', attempt: 1, maxAttempts: 1 })
          } else if (state === 'failed') {
            this.setConnectionState('failed')
            this.emit('error', new Error('Cloudflare Calls SFU connection failed'))
          }
        },
        onError: (err) => this.emit('error', err),
      })

      if (!this.localStream) throw new Error('No local stream available')
      const mySessionId = await this.cfSession.connect(this.localStream)

      // 3. Anunciar nuestra sesión CF al room (vía señalización)
      this.sendSignal({
        type: 'cf-session',
        from: this.config.userId,
        data: { sessionId: mySessionId, userType: this.config.userType },
      })

      // Si ya había un peer esperando, subscribirse ahora
      if (this.pendingSessionId) {
        await this.cfSession.subscribeToSession(this.pendingSessionId)
        this.pendingSessionId = null
      }
    } catch (err) {
      this.setConnectionState('failed')
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true
    if (this.signalingReconnectTimer) {
      clearTimeout(this.signalingReconnectTimer)
      this.signalingReconnectTimer = null
    }
    this.setConnectionState('closed')
    this.sendSignal({ type: 'leave', from: this.config.userId })
    this.ws?.close(1000, 'user disconnect')
    this.ws = null
    this.cfSession?.close()
    this.cfSession = null
    for (const t of this.localStream?.getTracks() ?? []) t.stop()
    this.localStream = null
    this.streamIdToUserId.clear()
    this.pendingRemoteUserIds = []
    this.connectedPeerIds.clear()
    this.signalingReconnectAttempt = 0
  }

  /* ── Chat (via señalización WS) ── */

  sendChatMessage(text: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      senderId: this.config.userId,
      senderType: this.config.userType as ChatMessage['senderType'],
      senderName: this.config.userName,
      timestamp: Date.now(),
    }
    this.sendSignal({ type: 'chat', from: this.config.userId, data: { message } })
    // Emitir propio mensaje como saliente para que la UI lo muestre
    return true
  }

  /* ── Quality stub (sin stats propias en CF Calls por ahora) ── */

  private emitQualityStub(): void {
    const stub: StreamQualitySummary = {
      roomId: this.config.roomId,
      overallLevel: 'unknown' as StreamQualityLevel,
      peers: [],
    }
    this.emit('stream-quality', stub)
  }

  /* ── Señalización ── */

  private connectSignaling(roomId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `${this.config.signalingUrl}?roomId=${encodeURIComponent(roomId)}`
      this.ws = new WebSocket(wsUrl)
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Signaling timeout')) }
      }, 8000)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        this.signalingReconnectAttempt = 0
        this.sendSignal({
          type: 'join',
          from: this.config.userId,
          data: { userType: this.config.userType },
        })
        if (!settled) { settled = true; resolve() }
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage
          void this.handleSignalingMessage(msg)
        } catch { /* ignore parse errors */ }
      }

      this.ws.onerror = () => {
        clearTimeout(timeout)
        if (!settled) { settled = true; reject(new Error('WebSocket connection failed')) }
      }

      this.ws.onclose = (event) => {
        clearTimeout(timeout)
        if (this.intentionalClose || this.connectionState === 'closed') return

        // Auto-reconnect mid-call signaling drops
        if (settled && this.signalingReconnectAttempt < CloudflareCallsClient.MAX_SIGNALING_RECONNECT) {
          this.scheduleSignalingReconnect(roomId)
          return
        }

        if (!settled) {
          settled = true
          reject(new Error(`WebSocket closed unexpectedly (code ${event.code})`))
        } else {
          this.setConnectionState('failed')
          this.emit('error', new Error('Signaling connection lost after max reconnect attempts'))
        }
      }
    })
  }

  private scheduleSignalingReconnect(roomId: string): void {
    const attempt = this.signalingReconnectAttempt++
    const delayMs = CloudflareCallsClient.SIGNALING_BACKOFF_BASE_MS * Math.pow(2, attempt)
      + Math.random() * 500

    this.emit('reconnecting', {
      peerId: 'signaling',
      attempt: attempt + 1,
      maxAttempts: CloudflareCallsClient.MAX_SIGNALING_RECONNECT,
    })

    this.signalingReconnectTimer = setTimeout(() => {
      this.signalingReconnectTimer = null
      if (this.intentionalClose || this.connectionState === 'closed') return

      const wsUrl = `${this.config.signalingUrl}?roomId=${encodeURIComponent(roomId)}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.signalingReconnectAttempt = 0
        this.sendSignal({
          type: 'join',
          from: this.config.userId,
          data: { userType: this.config.userType },
        })
        // Re-announce CF session so the peer knows we're back
        if (this.cfSession?.getSessionId()) {
          this.sendSignal({
            type: 'cf-session',
            from: this.config.userId,
            data: {
              sessionId: this.cfSession.getSessionId() ?? '',
              userType: this.config.userType,
            },
          })
        }
        this.emit('reconnected', { peerId: 'signaling', afterAttempts: attempt + 1 })
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage
          void this.handleSignalingMessage(msg)
        } catch { /* ignore */ }
      }

      this.ws.onerror = () => {
        // Try again if attempts remain
        if (this.signalingReconnectAttempt < CloudflareCallsClient.MAX_SIGNALING_RECONNECT) {
          this.scheduleSignalingReconnect(roomId)
        } else {
          this.setConnectionState('failed')
          this.emit('error', new Error('Signaling reconnect exhausted'))
        }
      }

      this.ws.onclose = () => {
        if (this.intentionalClose || this.connectionState === 'closed') return
        if (this.signalingReconnectAttempt < CloudflareCallsClient.MAX_SIGNALING_RECONNECT) {
          this.scheduleSignalingReconnect(roomId)
        } else {
          this.setConnectionState('failed')
          this.emit('error', new Error('Signaling reconnect exhausted'))
        }
      }
    }, delayMs)
  }

  private async handleSignalingMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'room-state': {
        for (const user of msg.data.users) {
          this.emit('user-joined', user.id, user.userType)
        }
        // Don't set 'connected' here — wait for SFU RTCPeerConnection via onConnectionStateChange.
        // Signaling is ready but media is not yet flowing.
        this.emit('chat-ready', true)
        this.emitQualityStub()
        break
      }

      case 'user-joined': {
        this.emit('user-joined', msg.from, msg.data.userType)
        // Re-anunciar nuestra sesión CF para que el recién llegado se subscriba
        if (this.cfSession?.getSessionId()) {
          this.sendSignal({
            type: 'cf-session',
            from: this.config.userId,
            data: {
              sessionId: this.cfSession.getSessionId() ?? '',
              userType: this.config.userType,
            },
          })
        }
        break
      }

      case 'user-left': {
        this.connectedPeerIds.delete(msg.from)
        this.emit('user-left', msg.from)
        break
      }

      case 'cf-session': {
        const { sessionId: remoteSessionId, userType: remoteUserType } = msg.data
        const remoteUserId = msg.from
        this.emit('user-joined', remoteUserId, remoteUserType)
        if (!this.pendingRemoteUserIds.includes(remoteUserId)) {
          this.pendingRemoteUserIds.push(remoteUserId)
        }

        if (this.cfSession) {
          // Suscribirse a los tracks del peer remoto
          await this.cfSession.subscribeToSession(remoteSessionId)
        } else {
          // La sesión CF todavía no está lista — guardar para usarla cuando esté
          this.pendingSessionId = remoteSessionId
        }
        break
      }

      case 'chat': {
        this.emit('chat-message', msg.data.message)
        break
      }

      case 'error': {
        this.emit('error', new Error(`Signaling error: ${msg.data}`))
        break
      }
    }
  }

  private handleRemoteTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    let userId = this.streamIdToUserId.get(stream.id)

    if (!userId) {
      userId = this.pendingRemoteUserIds.shift() ?? stream.id
      this.streamIdToUserId.set(stream.id, userId)
    }

    this.emit('remote-stream', stream, userId)

    if (!this.connectedPeerIds.has(userId)) {
      this.connectedPeerIds.add(userId)
      this.emit('peer-connected', {
        peerId: userId,
        connectionState: 'connected',
        iceConnectionState: 'connected',
      })
    }
  }

  private sendSignal(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return
    this.connectionState = state
    this.emit('connection-state', state)
  }
}
