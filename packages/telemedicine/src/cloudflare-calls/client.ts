/**
 * CloudflareCallsClient
 *
 * Drop-in replacement de WebRTCClient que enruta el media a través del SFU de
 * Cloudflare Calls en lugar de usar WebRTC P2P directo.
 */

import { loadSignalingUrl } from '../config/ice-servers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { openSupabaseSignaling, type SupabaseSignalingHandle } from '../supabase-signaling'
import { getAdaptiveConstraints, applyContentHints } from '../media-optimizations'
import type { CallProvider, ConnectionState, DeviceInfo, WarmUpResult, WebRTCEvents } from '../providers/types'
import type {
  ChatMessage,
} from '../webrtc-client'
import { CloudflareCallsSession, type TrackEntry } from './session'
import { SfuQualityMonitor } from './quality'
import { createTelemedicineLogger } from '../debug'

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
  userType: 'doctor' | 'patient' | 'nurse' | 'guest'
  roomId?: string
  /** URL del proxy API en el app (e.g., '/api/cloudflare-calls') */
  apiProxyUrl?: string
  /** URL del servidor de señalización (default: PUBLIC_SIGNALING_URL) */
  signalingUrl?: string
  /** Supabase client for signaling fallback/alternative */
  supabase?: SupabaseClient
  iceServers?: RTCIceServer[]
}

export class CloudflareCallsClient implements CallProvider {
  private ws: WebSocket | null = null
  private sbHandle: SupabaseSignalingHandle | null = null
  private quality: SfuQualityMonitor | null = null
  private sfuReconnecting = false
  private cfSession: CloudflareCallsSession | null = null
  private localStream: MediaStream | null = null
  private connectionState: ConnectionState = 'disconnected'
  private cachedDevices: DeviceInfo[] = []
  private streamIdToUserId = new Map<string, string>()
  private pendingRemoteSessions = new Set<string>()
  private cfToUserIdMap = new Map<string, string>()
  private orphanedStream: MediaStream | null = null
  private pendingRemoteUserIds: string[] = []
  private connectedPeerIds = new Set<string>()
  private userToStream = new Map<string, MediaStream>()
  /** Maps the local transceiver mid (assigned by Cloudflare per pulled track) to the remote user that owns it */
  private midToUserId = new Map<string, string>()
  /** Last cf-sessionId we subscribed to per remote user. A change means the peer reconnected with a new SFU session and we need to forget the old state. */
  private userIdToSessionId = new Map<string, string>()
  /** Session IDs queued because our local CF session isn't fully connected yet */
  private pendingRemoteSessionIds: Array<{ sessionId: string; userId: string }> = []
  /** Peer user IDs who joined while we were still connecting — re-announce our session to them once ready */
  private pendingPeerAnnouncements: string[] = []
  /** Remote users whose last subscribeToSession came back without tracks (peer announced its
   *  cf-session before its local tracks/new finished). Keeps a duplicate cf-session from that
   *  peer from being discarded idempotently, so we can re-subscribe once the publisher is live. */
  private remoteSubscribeNoTracks = new Set<string>()
  /** Backoff budget for re-subscribing to peers who announced early. Bounded so a dead session
   *  cannot loop the signaling handler forever. */
  private resubscribeAttempts = new Map<string, number>()
  private resubscribeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private static readonly REMOTE_RESUBSCRIBE_MAX_ATTEMPTS = 3
  private static readonly REMOTE_RESUBSCRIBE_BACKOFF_MS = 2_000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<keyof WebRTCEvents, ((...args: any[]) => void)[]>()
  private readonly config: Required<Omit<CloudflareCallsClientConfig, 'userName'>> & { userName?: string }
  private readonly debugLogger: ReturnType<typeof createTelemedicineLogger>

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
      supabase: cfg.supabase,
      iceServers: cfg.iceServers,
    }

    this.debugLogger = createTelemedicineLogger({
      source: 'CloudflareCallsClient',
      roomId: this.config.roomId,
      userId: this.config.userId,
      userType: this.config.userType,
    })
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
        // no-op
      }
    }
  }

  /* ── Media ── */

  async warmUp(constraints?: MediaStreamConstraints): Promise<WarmUpResult> {
    const t0 = Date.now()
    this.debugLogger.info('WarmUp started')
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints ?? getAdaptiveConstraints())
    } catch (err) {
      this.debugLogger.warn('getUserMedia fallback triggered', { error: err })
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
    this.emitLocalStream()

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

  /**
   * Emits a fresh MediaStream reference whose track list mirrors
   * this.localStream. Consumers bind srcObject against this ref, so a new
   * reference is required whenever tracks change (e.g. toggling the camera)
   * — otherwise React sees the same object and skips re-bind, leaving the
   * <video> element stuck on the previous (now-ended) track.
   */
  private emitLocalStream(): void {
    if (!this.localStream) return
    this.emit('local-stream', new MediaStream(this.localStream.getTracks()))
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
      this.emitLocalStream()
      return false
    }

    if (currentTrack?.readyState === 'live') {
      currentTrack.enabled = true
      await this.cfSession?.replacePublishedVideoTrack(currentTrack)
      this.emitLocalStream()
      return true
    }

    const newTrack = await this.acquireVideoTrack()
    if (!newTrack) return false

    this.localStream.addTrack(newTrack)
    await this.cfSession?.replacePublishedVideoTrack(newTrack)
    this.emitLocalStream()
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
    this.emitLocalStream()
  }

  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    if (!this.localStream) return
    const constraint = kind === 'video' ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } }
    const newStream = await navigator.mediaDevices.getUserMedia(constraint)
    const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0]
    if (!newTrack) return
    const oldTracks = kind === 'video' ? this.localStream.getVideoTracks() : this.localStream.getAudioTracks()
    oldTracks.forEach((t) => { t.stop(); this.localStream?.removeTrack(t) })
    this.localStream.addTrack(newTrack)
    this.emitLocalStream()
  }

  /* ── Connection ── */

  async connect(roomId?: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') return

    const finalRoomId = roomId ?? this.config.roomId
    this.quality?.stop()
    this.quality = null
    this.config.roomId = finalRoomId
    this.intentionalClose = false
    this.sfuReconnecting = false
    this.signalingReconnectAttempt = 0
    this.setConnectionState('connecting')

    try {
      if (!this.localStream) await this.warmUp()

      await this.connectSignaling(finalRoomId)

      this.cfSession = new CloudflareCallsSession({
        apiProxyUrl: this.config.apiProxyUrl,
        roomId: finalRoomId,
        iceServers: this.config.iceServers,
        onTrack: (event) => this.handleRemoteTrack(event),
        onConnectionStateChange: (state) => {
          this.debugLogger.info('SFU connection state changed', { state })
          if (state === 'connected') {
            if (this.connectionState === 'connecting' || this.connectionState === 'disconnected') {
              this.setConnectionState('connected')
            }
            if (this.sfuReconnecting) this.emit('reconnected', { peerId: 'sfu', afterAttempts: 1 })
            this.sfuReconnecting = false
          } else if (state === 'disconnected') {
            this.sfuReconnecting = true
            this.emit('reconnecting', { peerId: 'sfu', attempt: 1, maxAttempts: 1 })
          } else if (state === 'failed') {
            this.quality?.stop()
            this.quality = null
            this.setConnectionState('failed')
            this.emit('error', new Error('Cloudflare Calls SFU connection failed'))
          }
        },
        onError: (err) => {
          this.debugLogger.error('SFU connection error', err)
          this.emit('error', err)
        },
      })

      if (!this.localStream) throw new Error('No local stream available')
      this.debugLogger.info('Connecting to CF SFU...')
      const mySessionId = await this.cfSession.connect(this.localStream)
      this.quality = new SfuQualityMonitor(finalRoomId, this.cfSession, (event, ...args) => this.emit(event, ...args))
      this.debugLogger.info('CF Session established', { sessionId: mySessionId })

      this.sendSignal({
        type: 'cf-session',
        from: this.config.userId,
        data: { sessionId: mySessionId, userType: this.config.userType },
      })

      // Drain any remote sessions that arrived before our local session was ready
      const pending = [...this.pendingRemoteSessionIds]
      this.pendingRemoteSessionIds = []
      for (const { sessionId: remoteSessionId, userId: remoteUserId } of pending) {
        this.debugLogger.info('Subscribing to pending peer session', { remoteSessionId })
        await this.subscribeToRemoteSession(remoteUserId, remoteSessionId)
      }

      // Re-announce our cf-session to peers who joined while we were still connecting
      // (user-joined arrived before getSessionId() was non-null, so we deferred)
      const deferredPeers = [...this.pendingPeerAnnouncements]
      this.pendingPeerAnnouncements = []
      if (deferredPeers.length > 0) {
        this.debugLogger.info('Re-announcing cf-session to deferred peers', { count: deferredPeers.length })
        this.sendSignal({
          type: 'cf-session',
          from: this.config.userId,
          data: { sessionId: mySessionId, userType: this.config.userType },
        })
      }
    } catch (err) {
      this.quality?.stop()
      this.quality = null
      this.debugLogger.error('Connection failed', err)
      this.setConnectionState('failed')
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true
    this.quality?.stop()
    this.quality = null
    if (this.signalingReconnectTimer) {
      clearTimeout(this.signalingReconnectTimer)
      this.signalingReconnectTimer = null
    }
    this.setConnectionState('closed')
    this.sendSignal({ type: 'leave', from: this.config.userId })
    this.ws?.close(1000, 'user disconnect')
    this.ws = null
    this.sbHandle?.close()
    this.sbHandle = null
    await this.cfSession?.close()
    this.cfSession = null
    for (const t of this.localStream?.getTracks() ?? []) t.stop()
    this.localStream = null
    this.streamIdToUserId.clear()
    this.userToStream.clear()
    this.midToUserId.clear()
    this.userIdToSessionId.clear()
    this.pendingRemoteUserIds = []
    this.pendingRemoteSessionIds = []
    this.pendingPeerAnnouncements = []
    for (const timer of this.resubscribeTimers.values()) clearTimeout(timer)
    this.resubscribeTimers.clear()
    this.remoteSubscribeNoTracks.clear()
    this.resubscribeAttempts.clear()
    this.connectedPeerIds.clear()
    this.signalingReconnectAttempt = 0
  }

  /* ── Chat ── */

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
    return true
  }

  /* ── Señalización ── */

  private async connectSignaling(roomId: string): Promise<void> {
    if (this.config.supabase) {
      this.debugLogger.info('Connecting to signaling via Supabase Realtime')
      const handleWrapper = { handle: this.sbHandle }
      await openSupabaseSignaling(
        this.config.supabase,
        roomId,
        this.config.userId,
        this.config.userType,
        {
          logger: {
            logInfo: (m, ctx) => this.debugLogger.info(m, ctx),
            logWarn: (m, ctx) => this.debugLogger.warn(m, ctx),
            logError: (m, e, ctx) => this.debugLogger.error(m, e, ctx),
          },
          setConnectionState: (s) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.setConnectionState(s as any),
          handleMessage: (m) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.handleSignalingMessage(m as any),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          emit: (e, ...args) => this.emit(e as any, ...args),
          cleanup: () => { this.sbHandle = null },
        },
        handleWrapper
      )
      this.sbHandle = handleWrapper.handle
      return
    }

    return new Promise<void>((resolve, reject) => {
      const wsUrl = `${this.config.signalingUrl}?roomId=${encodeURIComponent(roomId)}`
      this.debugLogger.info('Connecting to signaling server via WebSocket', { wsUrl })
      this.ws = new WebSocket(wsUrl)
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Signaling timeout')) }
      }, 20000)

      this.ws.onopen = () => {
        this.debugLogger.info('Signaling WebSocket opened')
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

      this.ws.onerror = (err) => {
        this.debugLogger.error('Signaling WebSocket error', err)
        clearTimeout(timeout)
        if (!settled) { settled = true; reject(new Error('WebSocket connection failed')) }
      }

      this.ws.onclose = (event) => {
        this.debugLogger.warn('Signaling WebSocket closed', { code: event.code, reason: event.reason })
        clearTimeout(timeout)
        if (this.intentionalClose || this.connectionState === 'closed') return

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
        if (this.cfSession?.isReady()) {
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
    this.debugLogger.info('Signaling message received', { type: msg.type })
    switch (msg.type) {
      case 'room-state': {
        for (const user of msg.data.users) {
          this.emit('user-joined', user.id, user.userType)
        }
        this.emit('chat-ready', true)
        break
      }

      case 'user-joined': {
        this.emit('user-joined', msg.from, msg.data.userType)
        if (this.cfSession?.isReady()) {
          // We're ready — announce our session immediately
          this.sendSignal({
            type: 'cf-session',
            from: this.config.userId,
            data: {
              sessionId: this.cfSession.getSessionId() ?? '',
              userType: this.config.userType,
            },
          })
        } else if (this.cfSession) {
          // We're still connecting — defer announcement until connect() resolves
          this.debugLogger.info('Deferring cf-session announce to peer (still connecting)', { peerId: msg.from })
          if (!this.pendingPeerAnnouncements.includes(msg.from)) {
            this.pendingPeerAnnouncements.push(msg.from)
          }
        }
        break
      }

      case 'user-left': {
        this.userIdToSessionId.delete(msg.from)
        this.forgetRemotePeer(msg.from)
        break
      }

      case 'cf-session': {
        const { sessionId: remoteSessionId, userType: remoteUserType } = msg.data
        const remoteUserId = msg.from
        const previousSessionId = this.userIdToSessionId.get(remoteUserId)

        if (previousSessionId && previousSessionId === remoteSessionId) {
          // Duplicate announce for the current peer session. Normally an
          // idempotent replay (signaling re-broadcast, reconnect on our side),
          // so we do nothing — EXCEPT when our last subscribe to that session
          // came back with zero tracks: the peer announced its cf-session
          // before its local tracks/new finished (sessionId is non-null right
          // after sessions/new, before publish), so the SFU had nothing to
          // subscribe to. Re-subscribe with bounded backoff so the peer's
          // re-announce finally attaches real media (remote video never
          // appearing bug).
          if (this.remoteSubscribeNoTracks.has(remoteUserId)) {
            this.scheduleRemoteResubscribe(remoteUserId, remoteSessionId)
          } else {
            this.debugLogger.info('Ignoring duplicate cf-session for peer', { remoteUserId, remoteSessionId })
          }
          break
        }

        if (previousSessionId && previousSessionId !== remoteSessionId) {
          // Peer reconnected with a fresh SFU session (e.g. tab reload, network
          // drop). The old mids point to dead tracks in Cloudflare and the
          // stale MediaStream in userToStream is useless. Wipe and re-subscribe.
          this.debugLogger.info('Peer re-announced with new cf-session, forgetting old state', {
            remoteUserId, previousSessionId, remoteSessionId,
          })
          this.forgetRemotePeer(remoteUserId)
        }

        this.userIdToSessionId.set(remoteUserId, remoteSessionId)
        this.debugLogger.info('Remote CF session announced', { remoteUserId, remoteSessionId, previousSessionId, nextSessionId: remoteSessionId })
        this.emit('user-joined', remoteUserId, remoteUserType)
        if (!this.pendingRemoteUserIds.includes(remoteUserId)) {
          this.pendingRemoteUserIds.push(remoteUserId)
        }

        // Guard: cfSession must exist AND be fully ready (connect() resolved,
        // remote SDP applied, initial tracks/new done) before we can call
        // subscribeToSession. Using isReady() — not just getSessionId() — closes
        // the race where sessionId is set after `sessions/new` but before the
        // initial tracks/new completes, which used to trigger the
        // "no conectado aún" throw (ASTRO-B/C).
        if (this.cfSession?.isReady()) {
          await this.subscribeToRemoteSession(remoteUserId, remoteSessionId)
        } else {
          this.debugLogger.info('CF session not ready yet, queueing remote session', { remoteSessionId })
          if (!this.pendingRemoteSessionIds.some((p) => p.sessionId === remoteSessionId)) {
            this.pendingRemoteSessionIds.push({ sessionId: remoteSessionId, userId: remoteUserId })
          }
        }
        break
      }

      case 'chat': {
        this.emit('chat-message', msg.data.message)
        break
      }

      case 'error': {
        this.debugLogger.error('Signaling server logic error', new Error(msg.data))
        this.emit('error', new Error(`Signaling error: ${msg.data}`))
        break
      }
    }
  }

  private recordPulledMids(tracks: TrackEntry[], remoteUserId: string): void {
    for (const t of tracks) {
      if (t.mid) {
        this.midToUserId.set(t.mid, remoteUserId)
      }
    }
  }

  /**
   * Subscribe to a remote peer's Cloudflare session and remember whether any
   * tracks actually came back. An empty result usually means the peer published
   * its cf-session before its local tracks/new finished; without a marker the
   * duplicate cf-session that follows gets discarded idempotently and remote
   * media never appears (the bug fixed here).
   */
  private async subscribeToRemoteSession(remoteUserId: string, remoteSessionId: string): Promise<void> {
    try {
      this.debugLogger.info('Subscribing to remote tracks', { remoteSessionId })
      const pulled = await this.cfSession?.subscribeToSession(remoteSessionId, (mid) => {
        this.midToUserId.set(mid, remoteUserId)
      }) ?? []
      this.debugLogger.info('Remote subscribe pulled', { remoteUserId, remoteSessionId, tracks: pulled })
      this.recordPulledMids(pulled, remoteUserId)
      if (pulled.length === 0) {
        this.remoteSubscribeNoTracks.add(remoteUserId)
        this.debugLogger.warn('Remote subscribe returned no tracks; scheduling retry', {
          remoteUserId, remoteSessionId, pulledTracks: pulled.length,
        })
        this.scheduleRemoteResubscribe(remoteUserId, remoteSessionId)
      } else {
        this.remoteSubscribeNoTracks.delete(remoteUserId)
        this.resubscribeAttempts.delete(remoteUserId)
        const timer = this.resubscribeTimers.get(remoteUserId)
        if (timer) clearTimeout(timer)
        this.resubscribeTimers.delete(remoteUserId)
      }
    } catch (err) {
      this.remoteSubscribeNoTracks.add(remoteUserId)
      this.scheduleRemoteResubscribe(remoteUserId, remoteSessionId)
      this.debugLogger.error('subscribeToSession failed, scheduled retry', err, { remoteSessionId })
    }
  }

  /**
   * Re-subscribe to a peer whose earlier subscribe came back empty (announced
   * before publishing). Bounded backoff so a dead session cannot loop forever;
   * a later successful subscribe clears the budget via subscribeToRemoteSession.
   */
  private scheduleRemoteResubscribe(remoteUserId: string, remoteSessionId: string): void {
    if (this.intentionalClose || this.connectionState === 'closed') return
    if (this.resubscribeTimers.has(remoteUserId)) return

    const attempt = (this.resubscribeAttempts.get(remoteUserId) ?? 0) + 1
    if (attempt > CloudflareCallsClient.REMOTE_RESUBSCRIBE_MAX_ATTEMPTS) {
      this.remoteSubscribeNoTracks.delete(remoteUserId)
      this.resubscribeAttempts.delete(remoteUserId)
      this.debugLogger.warn('Remote re-subscribe attempts exhausted without tracks', { remoteUserId, remoteSessionId })
      return
    }

    this.resubscribeAttempts.set(remoteUserId, attempt)
    const delayMs = CloudflareCallsClient.REMOTE_RESUBSCRIBE_BACKOFF_MS * attempt
    this.debugLogger.info('Scheduling re-subscribe to early-announced peer', {
      remoteUserId, remoteSessionId, attempt, delayMs,
    })
    const timer = setTimeout(() => {
      this.resubscribeTimers.delete(remoteUserId)
      if (this.intentionalClose || this.connectionState === 'closed') return
      if (this.cfSession?.isReady()) {
        void this.subscribeToRemoteSession(remoteUserId, remoteSessionId)
      } else {
        // Still not ready — keep the no-tracks marker so the next duplicate
        // cf-session tries again a bounded number of times.
        this.debugLogger.info('CF session not ready for re-subscribe yet', { remoteUserId, remoteSessionId })
      }
    }, delayMs)
    this.resubscribeTimers.set(remoteUserId, timer)
  }

  /**
   * Drop all client-side state associated with a remote user. Used when a peer
   * reconnects (cf-session changes for the same userId) or leaves. Emits
   * user-left so React cleans up remoteUsers; the next cf-session will trigger
   * a fresh subscribeToSession that brings the peer back with new mids.
   *
   * Does NOT close the remote recvonly transceivers on the PeerConnection.
   * Cloudflare ends those tracks when the original publisher's session goes
   * away, so they become inert; Chrome will not render them and the new
   * subscription adds a fresh pair of transceivers for the returning peer.
   */
  private forgetRemotePeer(remoteUserId: string): void {
    this.debugLogger.info('Forgetting remote peer state', { remoteUserId })

    // Drop mid → userId mappings owned by this peer so no stray ontrack
    // accidentally resolves to them.
    for (const [mid, uid] of this.midToUserId) {
      if (uid === remoteUserId) this.midToUserId.delete(mid)
    }

    // Stop tracks in the stale MediaStream so <video> elements bound via ref
    // release them; React will then see a new stream on the next subscribe.
    const staleStream = this.userToStream.get(remoteUserId)
    if (staleStream) {
      for (const t of staleStream.getTracks()) {
        try { t.stop() } catch { /* ignore */ }
      }
      this.userToStream.delete(remoteUserId)
    }

    // Drop stream-id reverse mapping entries pointing at this user so
    // handleRemoteTrack does not reuse them if a new stream happens to
    // recycle a previous id.
    for (const [sid, uid] of this.streamIdToUserId) {
      if (uid === remoteUserId) this.streamIdToUserId.delete(sid)
    }

    // Remove any pending announcement for this user so we don't re-consume it
    // from the heuristic fallback in handleRemoteTrack.
    this.pendingRemoteUserIds = this.pendingRemoteUserIds.filter((u) => u !== remoteUserId)

    // Cancel any scheduled re-subscribe for this peer (fresh session next).
    const timer = this.resubscribeTimers.get(remoteUserId)
    if (timer) clearTimeout(timer)
    this.resubscribeTimers.delete(remoteUserId)
    this.remoteSubscribeNoTracks.delete(remoteUserId)
    this.resubscribeAttempts.delete(remoteUserId)

    this.connectedPeerIds.delete(remoteUserId)

    // Let UnifiedVideoCall drop the row in remoteUsers. user-joined will
    // rebuild it when the new cf-session arrives — seamless to the user.
    this.emit('user-left', remoteUserId)
  }

  private handleRemoteTrack(event: RTCTrackEvent): void {
    const rawStream = event.streams[0]
    const mid = event.transceiver?.mid ?? undefined

    // 1) Deterministic: map by transceiver mid (Cloudflare returns one mid per pulled track).
    // 2) Fallback: stream id (in case Cloudflare groups both tracks under the same MediaStream).
    // 3) Last resort: heuristic on pendingRemoteUserIds (single-peer calls only).
    let userId = mid ? this.midToUserId.get(mid) : undefined
    if (!userId && rawStream) {
      userId = this.streamIdToUserId.get(rawStream.id)
    }

    let userIdFromPending = false
    if (!userId) {
      const fromCfMap = Array.from(this.cfToUserIdMap.values())[0] as string | undefined
      if (fromCfMap) {
        userId = fromCfMap
      } else if (this.pendingRemoteUserIds[0]) {
        userId = this.pendingRemoteUserIds[0]
        userIdFromPending = true
      } else {
        userId = rawStream ? rawStream.id : event.track.id
      }
    }

    if (rawStream) {
      this.streamIdToUserId.set(rawStream.id, userId)
    }

    let userStream = this.userToStream.get(userId)
    if (!userStream) {
      userStream = new MediaStream()
      this.userToStream.set(userId, userStream)
      if (userIdFromPending) {
        this.pendingRemoteUserIds.shift()
      }
    }

    // Añadir el track al stream unificado del usuario
    if (!userStream.getTracks().find(t => t.id === event.track.id)) {
      userStream.addTrack(event.track)
    }

    this.debugLogger.info('Remote track received', { userId, trackKind: event.track.kind, tracksCount: userStream.getTracks().length, trackId: event.track.id, mid })
    
    // Breaking referential equality so React triggers the useCallLifecycleEffects hook and updates srcObject
    const clonedStreamForReact = new MediaStream(userStream.getTracks())
    this.userToStream.set(userId, clonedStreamForReact)
    
    this.emit('remote-stream', clonedStreamForReact, userId)

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
    if (this.sbHandle) {
      this.sbHandle.send(data)
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return
    this.connectionState = state
    this.debugLogger.info('Overall connection state changed', { state })
    this.emit('connection-state', state)
  }
}

