/**
 * PeerConnectionFactory — creates and configures RTCPeerConnection instances
 * with all event handlers (ontrack, onicecandidate, onnegotiationneeded, etc.).
 * Extracted from WebRTCClient to isolate peer connection lifecycle.
 */

import type { createTelemedicineLogger } from './debug'
import type { MediaManager } from './media-manager'
import type { QualityMonitor } from './quality-monitor'

const MAX_ICE_RESTART_ATTEMPTS = 3
const ICE_RESTART_BACKOFF_BASE_MS = 2_000
const CHAT_CHANNEL_LABEL = 'autamedica-chat'

export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderType: 'doctor' | 'patient' | 'nurse'
  senderName?: string
  timestamp: number
}

export interface PeerState {
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

export interface PeerConnectionFactoryCallbacks {
  emit: (event: string, ...args: unknown[]) => void
  sendSignalingMessage: (message: Record<string, unknown>) => void
  emitChatReady: () => void
}

export class PeerConnectionFactory {
  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
    private readonly media: MediaManager,
    private readonly qualityMonitor: QualityMonitor,
    private readonly callbacks: PeerConnectionFactoryCallbacks,
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

  ensurePeerConnection(
    userId: string,
    iceServers: RTCIceServer[],
    localUserId: string,
    localUserType: 'doctor' | 'patient' | 'nurse',
    peerConnections: Map<string, PeerState>,
  ): PeerState {
    let peerState = peerConnections.get(userId)
    if (peerState) {
      return peerState
    }

    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 1,
    })
    const isPolite = localUserType !== 'doctor'
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
      const stream = event.streams?.[0]
      this.logInfo('Received remote track', {
        peerId: userId,
        kind: event.track.kind,
        muted: event.track.muted,
        trackCount: stream?.getTracks().length ?? 0,
      })
      // Emit immediately — the video element layer (ActiveCallLayout) handles
      // the Chrome muted-track timing bug via track.onunmute + new MediaStream().
      if (stream) {
        this.callbacks.emit('remote-stream', stream, userId)
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.sendSignalingMessage({
          type: 'ice-candidate',
          to: userId,
          data: event.candidate,
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
        this.callbacks.emit('peer-connected', {
          peerId: userId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConnections.delete(userId)
        this.qualityMonitor.deletePeer(userId)
        this.callbacks.emitChatReady()
      }
    }

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      this.logInfo('ICE connection state changed', { peerId: userId, iceConnectionState: iceState })
      this.callbacks.emit('ice-state-change', { peerId: userId, state: iceState })

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
          if (peerConnections.has(userId) && pc.iceConnectionState === 'failed') {
            pc.restartIce()
          }
        }, backoffMs)
      }
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
      this.attachDataChannel(userId, event.channel, peerConnections, localUserId)
    }

    // Debounce negotiationneeded — Chrome can fire it multiple times in quick
    // succession (addTrack + setCodecPreferences + createDataChannel). We coalesce
    // them into a single offer by delaying slightly.
    let negotiationTimer: ReturnType<typeof setTimeout> | null = null

    pc.onnegotiationneeded = () => {
      if (!peerState) return

      if (negotiationTimer) {
        // Already scheduled — coalesce
        return
      }

      negotiationTimer = setTimeout(async () => {
        negotiationTimer = null
        if (!peerState) return

        try {
          if (pc.signalingState !== 'stable') {
            this.logInfo('Skipping negotiationneeded: not stable', {
              peerId: userId,
              signalingState: pc.signalingState,
            })
            return
          }

          peerState.isMakingOffer = true
          await pc.setLocalDescription()

          if (pc.localDescription) {
            this.callbacks.sendSignalingMessage({
              type: 'offer',
              to: userId,
              data: pc.localDescription,
            })
          }
        } catch (error) {
          this.logError('Failed handling negotiationneeded', error, { peerId: userId })
        } finally {
          if (peerState) {
            peerState.isMakingOffer = false
          }
        }
      }, 0)  // setTimeout(0) — coalesce microtask batches
    }

    this.media.attachLocalTracks(pc)
    peerConnections.set(userId, peerState)

    const shouldCreate = this.shouldCreateChatChannel(localUserId, userId, isPolite)
    this.logInfo('Data channel decision', { localUserId, remoteUserId: userId, shouldCreate, isPolite })
    if (shouldCreate) {
      const outgoingChannel = pc.createDataChannel(CHAT_CHANNEL_LABEL, { ordered: true })
      this.logInfo('Created outgoing data channel', { label: CHAT_CHANNEL_LABEL, remoteUserId: userId })
      this.attachDataChannel(userId, outgoingChannel, peerConnections, localUserId)
    }

    this.callbacks.emitChatReady()
    this.qualityMonitor.collectNow()
    return peerState
  }

  private shouldCreateChatChannel(_localUserId: string, _remoteUserId: string, isPolite: boolean): boolean {
    // The IMPOLITE peer (doctor) must create the data channel.
    // If the polite peer creates it, the channel is included in their offer,
    // which gets discarded during Perfect Negotiation collision resolution —
    // the data channel is never negotiated and stays in "connecting" forever.
    return !isPolite
  }

  attachDataChannel(
    remoteUserId: string,
    channel: RTCDataChannel,
    peerConnections: Map<string, PeerState>,
    localUserId: string,
  ): void {
    const peerState = peerConnections.get(remoteUserId)
    if (!peerState) {
      return
    }

    peerState.dataChannel = channel

    channel.onopen = () => {
      this.logInfo('Chat channel opened', { remoteUserId, label: channel.label, readyState: channel.readyState })
      this.callbacks.emitChatReady()
    }
    this.logInfo('Data channel attached', { remoteUserId, label: channel.label, readyState: channel.readyState })

    channel.onclose = () => {
      this.logInfo('Chat channel closed', { remoteUserId })
      if (peerState.dataChannel === channel) {
        peerState.dataChannel = null
      }
      this.callbacks.emitChatReady()
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
        if (!parsed || parsed.senderId === localUserId || typeof parsed.text !== 'string') {
          return
        }
        this.callbacks.emit('chat-message', parsed)
      } catch (error) {
        this.logWarn('Ignoring invalid chat payload', { error, remoteUserId })
      }
    }

    this.callbacks.emitChatReady()
  }
}
