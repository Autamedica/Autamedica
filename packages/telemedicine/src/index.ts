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
  hasTurnIceServer,
  hasStunIceServer,
} from './config/ice-servers'

export {
  createSignaling
} from './signaling/factory'

// Legacy WebRTC Core (keep for compatibility)
export { WebRTCClient } from './webrtc-client'
export type {
  WebRTCConfig,
  WebRTCEvents,
  DeviceInfo,
  WarmUpResult,
  CallQualitySummary,
  CallQualityTimelineEntry,
  CallQualityWorstMetrics,
  CallQualityAverageMetrics,
  DataChannelControlMessage,
} from './webrtc-client'

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
export { ReconnectingOverlay } from './components/ReconnectingOverlay'
export type { ReconnectingOverlayProps } from './components/ReconnectingOverlay'
export type { CallSessionBootstrap, CallSessionRole, CallSessionRuntime } from './call-session/types'

// Provider factory
export { createCallProvider } from './providers/factory'
export type { CallClient, CreateCallProviderOptions } from './providers/factory'

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

// Structured Logging (correlation IDs)
export { createCallLogger, createCallLogCollector } from './logging'
export type {
  CallLogger,
  CallLogContext,
  CallLogEntry,
  CallLogLevel,
  CallLogCategory,
  CallLogCollector,
  CallSummary,
  CallMetrics,
  ParticipantInfo,
  QualityTimelineEntry,
  EventTimelineEntry,
} from './logging'

// Hooks
export { useTelemedicineClient, useMediaControls, useRtcStats, useAudioTranscription, useCallRecording, useCallReport, useNetworkPreflight, useTurnCredentials } from './hooks'
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
  RtcStatsHook,
  TranscriptSegment,
  AudioTranscriptionState,
  AudioTranscriptionActions,
  CallRecordingState,
  CallRecordingActions,
  CallRecordingHook,
  CallReportState,
  UseNetworkPreflightReturn,
} from './hooks'

// Signaling
export { createSignalingTransport, createSignalingTransportFromEnv } from './signaling'
export type { SignalingTransport, SignalingConfig, SignalingImplementation } from './signaling'

// Configuration
export { getIceServersConfig, validateIceServersConfig } from './config'
export type { IceServerConfig } from './config'

// Audio Filter — 3-band parametric EQ for microphone
export { AudioFilterProcessor, DEFAULT_AUDIO_FILTER } from './audio-filter'
export type { AudioFilterConfig, AudioFilterBand } from './audio-filter'

// Tuning — centralized WebRTC engine constants
export {
  INITIAL_VIDEO_BITRATE,
  TARGET_VIDEO_BITRATE,
  BITRATE_RAMP_DURATION_MS,
  BITRATE_RAMP_INTERVAL_MS,
  BWE_HEADROOM_FACTOR,
  BWE_ADJUST_THROTTLE_MS,
  QUALITY_DEGRADE_THROTTLE_MS,
  CPU_REDUCTION_FACTOR,
  BW_REDUCTION_FACTOR,
  HIGH_PACKET_LOSS_THRESHOLD,
  QUALITY_POLL_INTERVAL_MS,
  QUALITY_LOG_INTERVAL_MS,
  AUDIO_SILENT_THRESHOLD,
  AUDIO_SILENT_ALERT_MS,
  QUALITY_THRESHOLDS,
  MAX_ICE_RESTART_ATTEMPTS,
  ICE_RESTART_BACKOFF_BASE_MS,
  POOR_QUALITY_THRESHOLD_MS,
  RECOVERY_THRESHOLD_MS,
  QUALITY_WARMUP_MS,
  REMOTE_MEDIA_TIMEOUT_MS,
  TURN_REFRESH_INTERVAL_MS,
} from './tuning'

// Media optimizations
export {
  getAdaptiveConstraints,
  applyContentHints,
  applyScreenShareHint,
  acquireWakeLock,
  releaseWakeLock,
  isWakeLockActive,
  setupWakeLockVisibilityHandler,
  setupVisibilityVideoPause,
  detectBrowser,
  getPreferredVideoCodecs,
  getPreferredAudioCodecs,
  patchVideoPlayback,
} from './media-optimizations'
export type { BrowserCapabilities } from './media-optimizations'

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
