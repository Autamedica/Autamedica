export type CallSessionRuntime = 'webrtc-p2p' | 'cloudflare-calls' | 'livekit'

export type CallSessionRole = 'doctor' | 'patient' | 'nurse'

export interface CallSessionBootstrap {
  callId: string
  roomId: string
  appointmentId: string | null
  runtime: CallSessionRuntime
  user: {
    id: string
    role: CallSessionRole
    displayName?: string
  }
  permissions: {
    canJoin: boolean
    canPublishAudio: boolean
    canPublishVideo: boolean
    canUseChat: boolean
    canRecord: boolean
  }
  mediaPolicy: {
    requireCamera: boolean
    requireMicrophone: boolean
    allowAudioOnlyFallback: boolean
  }
  transport: {
    signalingUrl?: string
    iceServers?: RTCIceServer[]
    cloudflareCallsApiUrl?: string | null
  }
  waitingRoom: {
    enabled: boolean
    message?: string
  }
}
