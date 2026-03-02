import { SignalingClient } from './client'

export { createSignaling } from './factory'
export { SignalingClient } from './client'

// Legacy exports for compatibility
export { createSignaling as createSignalingTransport } from './factory'
export { createSignaling as createSignalingTransportFromEnv } from './factory'
export function getSignalingConfigFromEnv() { return { url: 'wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling' } }

export type SignalingTransport = SignalingClient
export type SignalingConfig = { url: string }
export type SignalingImplementation = 'websocket'