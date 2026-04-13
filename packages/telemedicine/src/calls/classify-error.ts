import type { CallFailureCode } from './types'

/**
 * Classify a call error into an actionable failure code.
 * Inspects error message patterns to determine root cause.
 */
export function classifyCallError(error: unknown): CallFailureCode {
  const msg = error instanceof Error ? error.message : String(error)
  const lower = msg.toLowerCase()

  if (lower.includes('signaling timeout')) return 'signaling_timeout'
  if (lower.includes('signaling reconnect exhausted')) return 'signaling_reconnect_exhausted'
  if (lower.includes('sfu connection failed') || lower.includes('cloudflare calls connection failed') || lower.includes('cloudflare calls sfu')) return 'sfu_connection_failed'
  if (lower.includes('session') && lower.includes('publish')) return 'session_publish_failed'
  if (lower.includes('remote_media_timeout') || lower.includes('remote media')) return 'remote_media_timeout'

  if (lower.includes('permission') && lower.includes('video')) return 'camera_permission_denied'
  if (lower.includes('permission') && lower.includes('audio')) return 'microphone_permission_denied'
  if (lower.includes('notallowederror')) {
    if (lower.includes('video')) return 'camera_permission_denied'
    return 'microphone_permission_denied'
  }
  if (lower.includes('notfounderror') || lower.includes('notreadableerror')) return 'media_acquisition_failed'
  if (lower.includes('getusermedia') || lower.includes('no local stream')) return 'media_acquisition_failed'

  if (lower.includes('turn') && lower.includes('unavailable')) return 'turn_unavailable'
  if (lower.includes('offline') || lower.includes('network')) return 'network_offline'
  if (lower.includes('websocket') && lower.includes('failed')) return 'signaling_timeout'

  return 'unknown'
}
