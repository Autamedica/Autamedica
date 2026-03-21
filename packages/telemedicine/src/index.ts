// Call management system
export type {
  CallStatus,
  Call,
  CallEvent,
  WSMessage,
  ControlMessage,
  SignalingMessage,
  InviteMessage,
  AcceptMessage,
  DeclineMessage,
  CancelMessage,
  EndMessage,
  JoinMessage,
  OfferMessage,
  AnswerMessage,
  CandidateMessage
} from './calls/types'

export {
  CallService,
  createCallService,
  generateRoomId
} from './calls/service'

export {
  SignalingClient,
  createSignalingClient
} from './signaling/client'

export {
  WebRTCPeer
} from './webrtc/peer'

// New exports for config and factory
export {
  loadIceServers,
  ICE_STUN_ONLY,
  ICE_WITH_TURN,
  loadSignalingUrl,
  fetchTurnCredentials,
} from './config/ice-servers'

export {
  createSignaling
} from './signaling/factory'

// Legacy WebRTC Core (keep for compatibility)
export { WebRTCClient } from './webrtc-client'
export type { WebRTCConfig, WebRTCEvents, DeviceInfo, WarmUpResult } from './webrtc-client'

// Cloudflare Calls SFU (streaming relay via Cloudflare edge)
export { CloudflareCallsClient, CloudflareCallsSession } from './cloudflare-calls'
export type { CloudflareCallsClientConfig, CFSessionConfig, CFSessionDescription } from './cloudflare-calls'

// Alias for TelemedicineClient (used in hooks)
export { WebRTCClient as TelemedicineClient } from './webrtc-client'

export { HttpWebRTCClient } from './http-webrtc-client'

// UI Components
export { UnifiedVideoCall } from './unified-video-call'
export type { UnifiedVideoCallProps } from './unified-video-call'
export { TelemedicineDebugPanel } from './telemedicine-debug-panel'
export type { TelemedicineDebugPanelProps } from './telemedicine-debug-panel'

// Types
export type { SignalKind, Signal } from './types'
export { isSignal } from './types'

// Debug
export {
  createTelemedicineLogger,
  recordTelemedicineDebugEvent,
  readTelemedicineDebugEvents,
  clearTelemedicineDebugEvents,
  subscribeToTelemedicineDebugEvents,
} from './debug'
export type {
  TelemedicineDebugContext,
  TelemedicineDebugFilter,
  TelemedicineDebugLevel,
  TelemedicineDebugRecord,
} from './debug'

// Hooks
export { useTelemedicineClient, useMediaControls, useRtcStats } from './hooks'
export { useTurnCredentials } from './hooks/useTurnCredentials'
export type {
  TelemedicineClientState,
  TelemedicineClientActions,
  TelemedicineClientHook,
  MediaControlsState,
  MediaControlsActions,
  MediaControlsHook,
  RtcStatsData,
  RtcStatsState,
  RtcStatsActions,
  RtcStatsHook
} from './hooks'

// Signaling
export { createSignalingTransport, createSignalingTransportFromEnv } from './signaling'
export type { SignalingTransport, SignalingConfig, SignalingImplementation } from './signaling'

// Configuration
export { getIceServersConfig, validateIceServersConfig } from './config'
export type { IceServerConfig } from './config'

// Re-export common types
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'
export type MediaConstraints = {
  video: boolean | MediaTrackConstraints
  audio: boolean | MediaTrackConstraints
}

// Telemedicine types for signaling
export type TelemedicineRole = 'doctor' | 'patient' | 'nurse' | 'unknown'

// Legacy message types (keep for compatibility)
export interface LegacyOfferMessage {
  from: string
  to?: string
  data: RTCSessionDescriptionInit
}

export interface LegacyAnswerMessage {
  from: string
  to?: string
  data: RTCSessionDescriptionInit
}

export interface IceCandidateMessage {
  from: string
  to?: string
  data: RTCIceCandidateInit
}
