/**
 * Guest Call Token — Edge-compatible JWT (HMAC-SHA256)
 *
 * Signs and verifies self-contained tokens for guest video call access.
 * Uses Web Crypto API exclusively — works on Cloudflare Workers, Deno, Node 20+.
 * Zero external dependencies.
 */

export interface GuestTokenPayload {
  callId: string
  roomId: string
  guestName: string
  role: 'guest'
  iat: number
  exp: number
}

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const
const TOKEN_TTL_SECONDS = 7200 // 2 hours

function base64urlEncode(data: Uint8Array): string {
  const binString = Array.from(data, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binString = atob(padded)
  return Uint8Array.from(binString, (c) => c.charCodeAt(0))
}

function textEncode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textEncode(secret).buffer as ArrayBuffer, ALGORITHM, false, ['sign', 'verify'])
}

const HEADER = base64urlEncode(textEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))

export async function signGuestToken(
  payload: { callId: string; roomId: string; guestName: string },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: GuestTokenPayload = {
    ...payload,
    role: 'guest',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }

  const payloadB64 = base64urlEncode(textEncode(JSON.stringify(fullPayload)))
  const signingInput = `${HEADER}.${payloadB64}`

  const key = await importKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, textEncode(signingInput).buffer as ArrayBuffer)

  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`
}

export async function verifyGuestToken(
  token: string,
  secret: string,
): Promise<GuestTokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, payloadB64, signatureB64] = parts
  const signingInput = `${header}.${payloadB64}`

  let key: CryptoKey
  try {
    key = await importKey(secret)
  } catch {
    return null
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(signatureB64).buffer as ArrayBuffer,
    textEncode(signingInput).buffer as ArrayBuffer,
  )

  if (!valid) return null

  let payload: GuestTokenPayload
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(payloadB64))
    payload = JSON.parse(decoded)
  } catch {
    return null
  }

  if (payload.role !== 'guest') return null
  if (!payload.callId || !payload.roomId || !payload.guestName) return null
  if (typeof payload.exp !== 'number') return null

  const now = Math.floor(Date.now() / 1000)
  if (now > payload.exp) return null

  return payload
}
