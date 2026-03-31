/** Messages the client sends to the server */
export type ClientMessage =
  | { type: 'join'; from: string; data: { userType: string } }
  | { type: 'leave' }
  | { type: 'offer'; to: string; data: unknown }
  | { type: 'answer'; to: string; data: unknown }
  | { type: 'ice-candidate'; to: string; data: unknown }

/** Messages the server sends to the client */
export type ServerMessage =
  | { type: 'room-state'; data: { users: Array<{ id: string; userType: string }> } }
  | { type: 'user-joined'; from: string; data: { userType: string } }
  | { type: 'user-left'; from: string }
  | { type: 'offer'; from: string; data: unknown }
  | { type: 'answer'; from: string; data: unknown }
  | { type: 'ice-candidate'; from: string; data: unknown }
  | { type: 'error'; data: string }

/** User metadata stored in Durable Object storage */
export interface UserMeta {
  userId: string
  userType: string
}

/** Worker environment bindings */
export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace
  GEMINI_LIVE_ROOM: DurableObjectNamespace
  GEMINI_API_KEY: string
}
