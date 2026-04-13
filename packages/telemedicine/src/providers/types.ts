import type { StreamQualityMetrics, StreamQualitySummary, CallQualitySummary } from '../quality-monitor'
import type { ChatMessage, DataChannelControlMessage } from '../peer-connection-factory'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

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
  'quality-report': (metrics: StreamQualityMetrics) => void
}

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
