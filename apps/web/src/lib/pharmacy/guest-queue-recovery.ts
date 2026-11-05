/**
 * Anonymous pharmacy queue recovery: a random 256-bit device-held secret,
 * distinct from the short-lived video/clinical access JWT.
 *
 * Only the SHA-256 digest is stored on the server. Never send this value as
 * a URL parameter, or include it in logs, telemetry or push notifications.
 */
export const GUEST_QUEUE_RECOVERY_DAYS = 30

export function createGuestQueueRecoveryToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashGuestQueueRecoveryToken(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('invalid_guest_recovery_token')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyGuestQueueRecoveryToken(
  token: string,
  expectedHash: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token) || !/^[0-9a-f]{64}$/.test(expectedHash)) return false
  const actualHash = await hashGuestQueueRecoveryToken(token)
  // Constant-work comparison; the server never stores or returns the token.
  let difference = 0
  for (let i = 0; i < 64; i++) {
    difference |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  }
  return difference === 0
}
