import type { WarmUpResult, WebRTCEvents } from '../webrtc-client'

/**
 * Minimal contract that both WebRTCClient and CloudflareCallsClient satisfy.
 *
 * Only methods that BOTH clients already implement are included.
 * Extend this interface when CloudflareCallsClient gains parity on
 * getConnectionState, enumerateDevices, isChatReady, etc.
 */
export interface CallProvider {
  // Lifecycle
  warmUp(constraints?: MediaStreamConstraints): Promise<WarmUpResult>
  connect(roomId?: string): Promise<void>
  disconnect(): Promise<void>

  // Media
  getLocalStream(): MediaStream | null
  toggleAudio(enabled?: boolean): boolean
  toggleVideo(enabled?: boolean): boolean
  switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void>

  // Chat
  sendChatMessage(text: string): boolean

  // Events
  on<E extends keyof WebRTCEvents>(event: E, handler: WebRTCEvents[E]): () => void
}
