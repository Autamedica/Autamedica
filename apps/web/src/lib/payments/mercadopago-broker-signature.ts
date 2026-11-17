import { resolveGuestSecret } from '@/lib/runtime-env'

type RuntimeEnv = Record<string, unknown> | null | undefined

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

function getTimestampMillis(value: string): number | null {
  if (!/^\d{10,13}$/.test(value)) return null
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric)) return null
  return value.length === 10 ? numeric * 1000 : numeric
}

export async function createMercadoPagoBrokerHeaders(
  method: string,
  pathname: string,
  rawBody: string,
  runtimeEnv?: RuntimeEnv,
): Promise<Record<string, string>> {
  const secret = resolveGuestSecret(runtimeEnv)
  if (!secret) throw new Error('mercadopago_broker_signing_secret_missing')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const manifest = [method.toUpperCase(), pathname, timestamp, rawBody].join('\n')
  const signature = await hmacHex(secret, manifest)
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'x-autamedica-broker-timestamp': timestamp,
    'x-autamedica-broker-signature': signature,
  }
}

export async function verifyMercadoPagoBrokerRequest(
  request: Request,
  rawBody: string,
  runtimeEnv?: RuntimeEnv,
): Promise<boolean> {
  const secret = resolveGuestSecret(runtimeEnv)
  const timestamp = request.headers.get('x-autamedica-broker-timestamp') ?? ''
  const supplied = request.headers.get('x-autamedica-broker-signature') ?? ''
  const timestampMillis = getTimestampMillis(timestamp)
  if (!secret || !timestampMillis || Math.abs(Date.now() - timestampMillis) > 5 * 60_000 ||
      !/^[0-9a-f]{64}$/i.test(supplied)) return false

  const pathname = new URL(request.url).pathname
  const manifest = [request.method.toUpperCase(), pathname, timestamp, rawBody].join('\n')
  const expected = await hmacHex(secret, manifest)
  return constantTimeEqual(expected, supplied.toLowerCase())
}
