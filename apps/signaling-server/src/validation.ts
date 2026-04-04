/**
 * Input validation for signaling server socket events.
 * Prevents injection, room hijacking, and malformed data.
 */

const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SDP_TYPES = new Set(['offer', 'answer', 'pranswer', 'rollback'])
const QUALITY_LEVELS = new Set(['excellent', 'good', 'fair', 'poor'])

export function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID_RE.test(value)
}

export function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isValidSDP(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (!SDP_TYPES.has(obj.type as string)) return false
  if (obj.sdp !== undefined && typeof obj.sdp !== 'string') return false
  return true
}

export function isValidIceCandidate(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (obj.candidate !== undefined && typeof obj.candidate !== 'string') return false
  if (obj.sdpMLineIndex !== undefined && obj.sdpMLineIndex !== null && typeof obj.sdpMLineIndex !== 'number') return false
  if (obj.sdpMid !== undefined && obj.sdpMid !== null && typeof obj.sdpMid !== 'string') return false
  return true
}

export function isValidConnectionStats(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.bitrate === 'number' &&
    typeof obj.latency === 'number' &&
    typeof obj.packetLoss === 'number' &&
    QUALITY_LEVELS.has(obj.quality as string)
  )
}
