import {
  getClientEnvOrDefault,
  getOptionalClientEnv,
  getServerEnvOrDefault,
  isProduction,
  logger,
} from '@autamedica/shared'

/** Lee ICE desde env (cliente o server) */
export function loadIceServers(): RTCIceServer[] {
  const raw =
    getOptionalClientEnv('NEXT_PUBLIC_ICE_SERVERS') ??
    getServerEnvOrDefault('ICE_SERVERS_JSON', '[]')
  try { return JSON.parse(raw) } catch { return [] }
}

/** STUN-only por defecto (para desarrollo) */
export const ICE_STUN_ONLY: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
]

/**
 * STUN+TURN production-ready configuration
 * Usa variables de entorno para credenciales TURN
 */
export function getProductionICEServers(): RTCIceServer[] {
  const iceServers: RTCIceServer[] = [...ICE_STUN_ONLY]

  // TURN servers desde environment variables
  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL

  if (turnUrls && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.split(','),
      username: turnUsername,
      credential: turnCredential,
    })
  } else {
    // Fallback a servidores TURN públicos temporales (solo desarrollo)
    if (isProduction()) {
      logger.warn('⚠️ No TURN servers configured. Using public fallback (not recommended for production)')
    }
    iceServers.push({
      urls: ['turns:global.relay.metered.ca:443?transport=tcp'],
      username: 'demo',
      credential: 'demo',
    })
  }

  return iceServers
}

/**
 * TURN servers recomendados para producción
 * Configurar con Twilio, Cloudflare Calls, o servidor propio
 *
 * Ejemplo con Twilio:
 * NEXT_PUBLIC_TURN_URLS=turn:global.turn.twilio.com:3478?transport=udp,turn:global.turn.twilio.com:3478?transport=tcp,turn:global.turn.twilio.com:443?transport=tcp
 * NEXT_PUBLIC_TURN_USERNAME=<twilio-sid>
 * NEXT_PUBLIC_TURN_CREDENTIAL=<twilio-credential>
 *
 * Ejemplo con servidor propio (coturn):
 * NEXT_PUBLIC_TURN_URLS=turn:turn.autamedica.com:3478,turns:turn.autamedica.com:5349
 * NEXT_PUBLIC_TURN_USERNAME=autamedica
 * NEXT_PUBLIC_TURN_CREDENTIAL=<secure-credential>
 */
export const ICE_WITH_TURN: RTCIceServer[] = getProductionICEServers()

/** Señalización URL desde env */
export function loadSignalingUrl(): string {
  return getClientEnvOrDefault(
    'NEXT_PUBLIC_SIGNALING_URL',
    'wss://autamedica-signaling-server.ecucondor.workers.dev/connect'
  )
}

/** Default Google STUN servers */
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

/**
 * Returns ICE servers config from environment variables.
 * Priority: NEXT_PUBLIC_ICE_SERVERS JSON → TURN_SERVER_URL vars → defaults
 */
export function getIceServersConfig(): RTCIceServer[] {
  // Try JSON env var first
  const raw =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ICE_SERVERS) || ''

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[]
      const valid = parsed.filter((s) => {
        const url = Array.isArray(s.urls) ? s.urls[0] : s.urls
        return typeof url === 'string' && (url.startsWith('stun:') || url.startsWith('turn:') || url.startsWith('turns:'))
      })
      if (valid.length > 0) return valid
    } catch {
      // fall through to defaults
    }
  }

  // Try separate TURN env vars
  const turnUrl =
    typeof process !== 'undefined' && process.env?.TURN_SERVER_URL
  const turnUsername =
    typeof process !== 'undefined' && process.env?.TURN_USERNAME
  const turnPassword =
    typeof process !== 'undefined' && process.env?.TURN_PASSWORD

  if (turnUrl) {
    return [
      {
        urls: turnUrl,
        ...(turnUsername ? { username: turnUsername } : {}),
        ...(turnPassword ? { credential: turnPassword } : {}),
      },
      ...DEFAULT_STUN_SERVERS,
    ]
  }

  return [...DEFAULT_STUN_SERVERS]
}

/**
 * Validates an ICE servers config array.
 * Returns true if valid (has at least one server with a valid url).
 */
export function validateIceServersConfig(servers: RTCIceServer[]): boolean {
  if (!Array.isArray(servers) || servers.length === 0) return false

  const hasStun = servers.some((s) => {
    const url = Array.isArray(s.urls) ? s.urls[0] : s.urls
    return typeof url === 'string' && url.startsWith('stun:')
  })
  const hasTurn = servers.some((s) => {
    const url = Array.isArray(s.urls) ? s.urls[0] : s.urls
    return typeof url === 'string' && (url.startsWith('turn:') || url.startsWith('turns:'))
  })

  if (!hasStun) console.warn('No STUN servers configured. ICE may fail in some networks.')
  if (!hasTurn) console.warn('No TURN servers configured. Connections behind strict NAT may fail.')

  return true
}

/**
 * Returns a JSON example string for ICE servers configuration.
 */
export function getExampleIceServersConfig(): string {
  return JSON.stringify([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
  ], null, 2)
}