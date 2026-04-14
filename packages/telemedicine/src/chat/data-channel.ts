/**
 * Chat via WebRTC DataChannel — message send/receive and channel lifecycle.
 */

import type { ChatMessage } from '../webrtc-client'

interface PeerState {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
}

interface ChatManagerContext {
  userId: string
  userName?: string
  userType: 'doctor' | 'patient' | 'nurse' | 'guest'
  getPeerConnections: () => Map<string, PeerState>
  emit: (event: 'chat-message' | 'chat-ready', data: unknown) => void
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void
    warn: (msg: string, ctx?: Record<string, unknown>) => void
    error: (msg: string, error: unknown, ctx?: Record<string, unknown>) => void
  }
}

export class ChatManager {
  private readonly ctx: ChatManagerContext

  constructor(ctx: ChatManagerContext) {
    this.ctx = ctx
  }

  shouldCreateChatChannel(remoteUserId: string): boolean {
    return this.ctx.userId.localeCompare(remoteUserId) < 0
  }

  attachDataChannel(remoteUserId: string, channel: RTCDataChannel): void {
    const peerState = this.ctx.getPeerConnections().get(remoteUserId)
    if (!peerState) return

    peerState.dataChannel = channel

    channel.onopen = () => {
      this.ctx.log.info('Chat channel opened', { remoteUserId })
      this.emitChatReady()
    }

    channel.onclose = () => {
      this.ctx.log.info('Chat channel closed', { remoteUserId })
      if (peerState.dataChannel === channel) {
        peerState.dataChannel = null
      }
      this.emitChatReady()
    }

    channel.onerror = (event) => {
      this.ctx.log.error('Chat channel error', event, { remoteUserId })
    }

    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') return

      try {
        const parsed = JSON.parse(event.data) as ChatMessage
        if (!parsed || parsed.senderId === this.ctx.userId || typeof parsed.text !== 'string') return
        this.ctx.emit('chat-message', parsed)
      } catch (error) {
        this.ctx.log.warn('Ignoring invalid chat payload', { error, remoteUserId })
      }
    }

    this.emitChatReady()
  }

  emitChatReady(): void {
    this.ctx.emit('chat-ready', this.isChatReady())
  }

  sendChatMessage(text: string): boolean {
    const trimmedText = text.trim()
    if (!trimmedText) return false

    const payload: ChatMessage = {
      id: `${this.ctx.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: trimmedText,
      senderId: this.ctx.userId,
      senderType: this.ctx.userType,
      senderName: this.ctx.userName,
      timestamp: Date.now(),
    }

    let delivered = false

    for (const [remoteUserId, peerState] of this.ctx.getPeerConnections()) {
      const channel = peerState.dataChannel
      if (channel?.readyState !== 'open') {
        this.ctx.log.warn('Chat channel not ready', { remoteUserId })
        continue
      }

      try {
        channel.send(JSON.stringify(payload))
        delivered = true
      } catch (error) {
        this.ctx.log.error('Failed sending chat message', error, { remoteUserId })
      }
    }

    return delivered
  }

  isChatReady(): boolean {
    for (const [, peerState] of this.ctx.getPeerConnections()) {
      if (peerState.dataChannel?.readyState === 'open') return true
    }
    return false
  }
}
