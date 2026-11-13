/** Secrets and authorization for internal FCM sender. No client JWT or anon key is privileged. */
export interface PushAuthSecrets {
  cronSecret?: string | null
  serviceRoleKey?: string | null
  dispatchSecret?: string | null
  anonKey?: string | null
}

function equalWithoutEarlyExit(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isAuthorizedPushRequest(header: string | null, secrets: PushAuthSecrets): boolean {
  const token = /^Bearer ([^\s]+)$/i.exec(header ?? "")?.[1]
  if (!token) return false

  const candidates = [secrets.cronSecret, secrets.serviceRoleKey, secrets.dispatchSecret]
  return candidates.some(
    (candidate) =>
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate !== secrets.anonKey &&
      equalWithoutEarlyExit(token, candidate),
  )
}
