/** Messages the client sends to the server */
export type ClientMessage =
  | { type: 'join'; from: string; data: { userType: string } }
  | { type: 'leave' }
  | { type: 'offer'; to: string; data: unknown }
  | { type: 'answer'; to: string; data: unknown }
  | { type: 'ice-candidate'; to: string; data: unknown }
  | { type: 'cf-session'; from: string; data: unknown }
  | { type: 'chat'; from: string; data: unknown }
  | { type: 'clinical-mode'; from: string; data: unknown }

/** Messages the server sends to the client */
export type ServerMessage =
  | { type: 'room-state'; data: { users: Array<{ id: string; userType: string }> } }
  | { type: 'user-joined'; from: string; data: { userType: string } }
  | { type: 'user-left'; from: string }
  | { type: 'offer'; from: string; data: unknown }
  | { type: 'answer'; from: string; data: unknown }
  | { type: 'ice-candidate'; from: string; data: unknown }
  | { type: 'cf-session'; from: string; data: unknown }
  | { type: 'chat'; from: string; data: unknown }
  | { type: 'clinical-mode'; from: string; data: unknown }
  | { type: 'error'; data: string }

/** User metadata stored in Durable Object storage */
export interface UserMeta {
  userId: string
  userType: string
}

export type GeminiLiveCheckpoint = 'partial' | 'final'
export type GeminiLiveSessionMode = 'general' | 'guided_checkpoint'

export interface GeminiLivePatientContext {
  name: string | null
  age: number | null
  completedSections: string[]
  sectionData?: Record<string, Record<string, unknown>>
}

export interface GeminiLiveSessionConfig {
  mode: GeminiLiveSessionMode
  checkpoint?: GeminiLiveCheckpoint
  patient: GeminiLivePatientContext
  guidanceQuestions: string[]
  coverageGaps: string[]
  coverageSummary?: string
  maxModelTurns: number
}

export type GeminiLiveClientMessage =
  | { type: 'session_config'; data: GeminiLiveSessionConfig }

/** Worker environment bindings */
export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace
  GEMINI_LIVE_ROOM: DurableObjectNamespace
  GEMINI_API_KEY: string
}
