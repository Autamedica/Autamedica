// Call status types matching database enum
export type CallStatus =
  | 'requested'   // created by doctor
  | 'ringing'     // notified to patient
  | 'accepted'    // patient accepted
  | 'declined'    // patient declined
  | 'canceled'    // doctor canceled/expired
  | 'connecting'  // SDP/ICE exchange
  | 'connected'   // WebRTC OK
  | 'ended'       // hung up or timeout

export interface Call {
  id: string
  room_id: string
  doctor_id: string
  patient_id: string
  status: CallStatus
  created_at: string
  accepted_at?: string
  ended_at?: string
  reason?: string
  appointment_id?: string
}

export interface CallEvent {
  id: number
  call_id: string
  at: string
  type: string
  payload?: Record<string, unknown>
}

// WebSocket message types for signaling
export interface WSMessage {
  type: string
  [key: string]: unknown
}

// Control messages (user channel)
export interface InviteMessage extends WSMessage {
  type: 'invite'
  callId: string
  roomId: string
  from: { doctorId: string; name?: string }
  to: { patientId: string }
}

export interface AcceptMessage extends WSMessage {
  type: 'accept'
  callId: string
  roomId: string
  by: 'patient'
}

export interface DeclineMessage extends WSMessage {
  type: 'decline'
  callId: string
  reason?: string
}

export interface CancelMessage extends WSMessage {
  type: 'cancel'
  callId: string
}

export interface EndMessage extends WSMessage {
  type: 'end'
  callId: string
}

// WebRTC signaling messages (room channel)
export interface JoinMessage extends WSMessage {
  type: 'join'
  userId: string
}

export interface OfferMessage extends WSMessage {
  type: 'offer'
  sdp: string
  from?: string
}

export interface AnswerMessage extends WSMessage {
  type: 'answer'
  sdp: string
  from?: string
}

export interface CandidateMessage extends WSMessage {
  type: 'candidate'
  candidate: RTCIceCandidate
  from?: string
}

export type ControlMessage = InviteMessage | AcceptMessage | DeclineMessage | CancelMessage | EndMessage
export type SignalingMessage = JoinMessage | OfferMessage | AnswerMessage | CandidateMessage

/** Classified failure codes for call join/session errors. */
export type CallFailureCode =
  | 'signaling_timeout'
  | 'signaling_reconnect_exhausted'
  | 'sfu_connection_failed'
  | 'session_publish_failed'
  | 'remote_media_timeout'
  | 'camera_permission_denied'
  | 'microphone_permission_denied'
  | 'media_acquisition_failed'
  | 'turn_unavailable'
  | 'network_offline'
  | 'unknown'

/** Classified reasons for call termination. */
export type CallEndReason =
  | 'user_ended'
  | 'remote_ended'
  | 'connection_closed'
  | 'page_closed'
  | 'network_lost'
  | 'timeout'
  | 'error'