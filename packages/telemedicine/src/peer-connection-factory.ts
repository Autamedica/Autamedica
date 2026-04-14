/**
 * PeerConnectionFactory — creates and configures RTCPeerConnection instances
 * with all event handlers (ontrack, onicecandidate, onnegotiationneeded, etc.).
 * Extracted from WebRTCClient to isolate peer connection lifecycle.
 */

import type { createTelemedicineLogger } from './debug'
import type { MediaManager } from './media-manager'
import type { QualityMonitor } from './quality-monitor'
import type { CallLogger } from './logging/call-logger'

import { MAX_ICE_RESTART_ATTEMPTS, ICE_RESTART_BACKOFF_BASE_MS } from './tuning'
const CHAT_CHANNEL_LABEL = 'autamedica-chat'

export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderType: 'doctor' | 'patient' | 'nurse' | 'guest'
  senderName?: string
  timestamp: number
}

export interface DataChannelControlMessage {
  _control: true
  type: 'clinical-mode' | 'audio-level-alert'
  payload: Record<string, unknown>
  senderId: string
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

function createPeerConnectionError(
  message: string,
  meta: Record<string, unknown>,
  cause?: unknown,
): Error & Record<string, unknown> {
  const wrapped = new Error(message) as Error & Record<string, unknown>
  wrapped.name = 'TelemedicinePeerError'
  if (cause !== undefined) {
    wrapped.cause = cause
  }
  return Object.assign(wrapped, meta)
}

export class PeerConnectionFactory {
  private callLogger?: CallLogger

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
    private readonly media: MediaManager,
    private readonly qualityMonitor: QualityMonitor,
    private readonly callbacks: PeerConnectionFactoryCallbacks,
    options?: { callLogger?: CallLogger },
  ) {
    this.callLogger = options?.callLogger
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

  ensurePeerConnection(
    userId: string,
    iceServers: RTCIceServer[],
    localUserId: string,
    localUserType: 'doctor' | 'patient' | 'nurse' | 'guest',
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
    this.callLogger?.info('ice', 'pc_created', { peerId: userId, isPolite, iceServerCount: iceServers.length })

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
      this.callLogger?.info('ice', 'connection_state_change', {
        peerId: userId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
      })
      if (pc.connectionState === 'connected') {
        this.callLogger?.info('ice', 'connection_established', { peerId: userId })
        this.callbacks.emit('peer-connected', {
          peerId: userId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.callLogger?.warn('ice', 'connection_terminated', { peerId: userId, state: pc.connectionState })
        // Clear the negotiation timer to prevent stale offers after peer removal
        if (negotiationTimer) {
          clearTimeout(negotiationTimer)
          negotiationTimer = null
        }
        // Null out event handlers to prevent callbacks on a dead connection
        pc.ontrack = null
        pc.onicecandidate = null
        pc.onconnectionstatechange = null
        pc.oniceconnectionstatechange = null
        pc.onsignalingstatechange = null
        pc.onnegotiationneeded = null
        pc.ondatachannel = null
        peerConnections.delete(userId)
        this.qualityMonitor.deletePeer(userId)
        this.callbacks.emitChatReady()
      }
    }

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      this.logInfo('ICE connection state changed', { peerId: userId, iceConnectionState: iceState })
      this.callLogger?.info('ice', 'ice_state_change', { peerId: userId, state: iceState })
      this.callbacks.emit('ice-state-change', { peerId: userId, state: iceState })

      if (iceState === 'failed' && peerState) {
        if (peerState.iceRestartCount >= MAX_ICE_RESTART_ATTEMPTS) {
          this.logWarn('ICE restart limit reached, giving up', {
            peerId: userId,
            attempts: peerState.iceRestartCount,
          })
          this.callLogger?.error('ice', 'ice_restart_limit_reached', { peerId: userId, attempts: peerState.iceRestartCount })
          const iceError = createPeerConnectionError(
            `ICE restart exhausted after ${peerState.iceRestartCount} attempts for peer ${userId}`,
            { code: 'ICE_RESTART_EXHAUSTED', peerId: userId, attempts: peerState.iceRestartCount },
          )
          this.callbacks.emit('error', iceError)
          return
        }
        const backoffMs = ICE_RESTART_BACKOFF_BASE_MS * Math.pow(2, peerState.iceRestartCount) + Math.random() * 1000
        peerState.iceRestartCount++
        peerState.lastIceRestartAt = Date.now()
        this.logWarn('ICE connection failed, scheduling restart', {
          peerId: userId,
          attempt: peerState.iceRestartCount,
          backoffMs,
        })
        this.callLogger?.warn('ice', 'ice_restart', { peerId: userId, attempt: peerState.iceRestartCount, backoffMs: Math.round(backoffMs) })
        this.callbacks.emit('reconnecting', {
          peerId: userId,
          attempt: peerState.iceRestartCount,
          maxAttempts: MAX_ICE_RESTART_ATTEMPTS,
        })
        setTimeout(() => {
          if (peerConnections.has(userId) && pc.iceConnectionState === 'failed') {
            this.callLogger?.info('ice', 'ice_restart_attempted', { peerId: userId, attempt: peerState?.iceRestartCount })
            pc.restartIce()
          }
        }, backoffMs)
      }
      if (iceState === 'connected' && peerState) {
        if (peerState.iceRestartCount > 0) {
          this.callbacks.emit('reconnected', {
            peerId: userId,
            afterAttempts: peerState.iceRestartCount,
          })
        }
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
          const offer = await pc.createOffer()
          const { mungeOpusSdp } = await import('./utils/sdp-helpers')
          const mungedSdp = mungeOpusSdp(offer.sdp || '')
          
          await pc.setLocalDescription({ type: offer.type, sdp: mungedSdp })

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
        const parsed = JSON.parse(event.data)
        if (!parsed) return

        // Control messages (clinical-mode, audio-level-alert, etc.)
        if (parsed._control === true) {
          const control = parsed as DataChannelControlMessage
          if (control.senderId === localUserId) return
          this.callbacks.emit('control-message', control)
          return
        }

        // Regular chat messages
        const chat = parsed as ChatMessage
        if (chat.senderId === localUserId || typeof chat.text !== 'string') {
          return
        }
        this.callbacks.emit('chat-message', chat)
      } catch (error) {
        this.logWarn('Ignoring invalid chat payload', { error, remoteUserId })
      }
    }

    this.callbacks.emitChatReady()
  }
}
