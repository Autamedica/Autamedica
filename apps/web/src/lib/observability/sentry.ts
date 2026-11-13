import * as Sentry from '@sentry/astro'
import { registerLogReporter, type LogEntry } from '@autamedica/shared'
import { getRuntimeEnvValue, resolvePublicSentryDsn } from '@/lib/runtime-env'

type RuntimeEnvRecord = Record<string, unknown> | null | undefined

interface CaptureMeta {
  runtimeEnv?: RuntimeEnvRecord
  layer?: string
  surface: string
  owner?: string
  tags?: Record<string, string | number | boolean | null | undefined>
  context?: Record<string, unknown>
  fingerprint?: string[]
}

const BLOCKED_FIELD_NAMES = new Set([
  'authorization',
  'cpf',
  'token',
  'token_hash',
  'access_token',
  'refresh_token',
  'id_token',
  'otp',
  'otp_hash',
  'recovery_token',
  'password',
  'api-key',
  'secret-key',
  'data_nascimento',
  'set-cookie',
  'cookie',
  'cookies',
  'body',
  'payload',
  'headers',
  'state',
  'clinical_data',
  'message',
  'notes',
  'details',
  'metadata',
  'description',
  'anamnesis',
  'chat',
  'patient_name',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'document',
  'dni',
  'address',
  'birth_date',
  'date_of_birth',
  'pdf',
  'qr',
  'signed_pdf_url',
  'file_url',
])

const CLIENT_INIT_KEY = '__AUTAMEDICA_SENTRY_CLIENT_INIT__'
const SERVER_INIT_KEY = '__AUTAMEDICA_SENTRY_SERVER_INIT__'
const LOGGER_BRIDGE_KEY = '__AUTAMEDICA_SENTRY_LOGGER_BRIDGE__'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringValue(source: RuntimeEnvRecord, key: string): string | undefined {
  const value = source?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getSentryDsn(runtimeEnv?: RuntimeEnvRecord): string | undefined {
  return (
    readStringValue(runtimeEnv, 'PUBLIC_SENTRY_DSN') ??
    (typeof window !== 'undefined' ? window.__ENV?.PUBLIC_SENTRY_DSN : undefined) ??
    getRuntimeEnvValue('PUBLIC_SENTRY_DSN') ??
    resolvePublicSentryDsn(runtimeEnv)
  )
}

const SENSITIVE_AUTH_QUERY_KEY = /^(?:code|token|token_hash|access_token|refresh_token|id_token|otp|otp_hash|recovery_token|password|secret|api[_-]?key)$/i;
const SENSITIVE_AUTH_PATH = /\/auth\/reset-password\/?$/i;

function redactSensitiveUrl(value: string): string {
  try {
    const url = new URL(value);
    if (SENSITIVE_AUTH_PATH.test(url.pathname)) {
      // Reset links may contain single-use OTP hashes or PKCE codes.
      // Keep only the origin and path in telemetry.
      return url.origin + url.pathname;
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_AUTH_QUERY_KEY.test(key) || /(?:token|secret|password)/i.test(key)) {
        url.searchParams.set(key, '[Redacted]');
      }
    }

    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (Array.from(hashParams.keys()).some((key) =>
      SENSITIVE_AUTH_QUERY_KEY.test(key) || /(?:token|secret|password)/i.test(key),
    )) {
      url.hash = '';
    }

    return url.toString();
  } catch {
    return value.replace(/([?&#](?:code|token(?:_hash)?|access_token|refresh_token|id_token|otp(?:_hash)?|recovery_token|password|secret|api[_-]?key)=)[^&#\s"'<>]*/gi, '$1[Redacted]');
  }
}

function redactMemedText(value: string): string {
  return value
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)*memed\.com\.br[^\s"'<>]*/gi, '[Memed URL redacted]')
    .replace(/([?&#](?:api-key|secret-key|token|token_hash|access_token|refresh_token|id_token|code|otp|otp_hash|recovery_token|password|secret)=)[^&#\s"'<>]*/gi, '$1[Redacted]');
}
function redactTelemetry(value: unknown): unknown {
  if (typeof value === 'string') return redactMemedText(value);
  if (Array.isArray(value)) return value.map((item) => redactTelemetry(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      ['cpf', 'api-key', 'secret-key', 'token', 'token_hash', 'access_token', 'refresh_token', 'id_token', 'otp', 'otp_hash', 'recovery_token', 'password', 'data_nascimento'].includes(key.toLowerCase())
        ? (typeof item === 'number' ? 0 : '[Redacted]') : redactTelemetry(item)]));
  }
  return value;
}

function truncate(value: string, max = 240): string {
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max)}...[truncated]`
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return '[TruncatedDepth]'
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(redactMemedText(value.message)),
      stack: value.stack ? truncate(redactMemedText(value.stack), 1000) : undefined,
    }
  }

  if (typeof value === 'string') {
    return truncate(redactMemedText(value))
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1))
  }

  if (!isPlainObject(value)) {
    return String(value)
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    sanitized[key] = BLOCKED_FIELD_NAMES.has(normalizedKey)
      ? '[Redacted]'
      : sanitizeValue(nestedValue, depth + 1)
  }

  return sanitized
}

function sanitizeEvent<T>(event: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sentry event structure requires dynamic property access for sanitization
  const mutableEvent = event as Record<string, any>

  if (typeof mutableEvent.request?.url === 'string') mutableEvent.request.url = redactSensitiveUrl(mutableEvent.request.url);
  if (Array.isArray(mutableEvent.spans)) {
    mutableEvent.spans = mutableEvent.spans.map((span: Record<string, unknown>) => redactTelemetry(span));
  }
  if (mutableEvent.exception) mutableEvent.exception = redactTelemetry(mutableEvent.exception);
  if (mutableEvent.request) {
    delete mutableEvent.request.data

    if (isPlainObject(mutableEvent.request.headers)) {
      delete mutableEvent.request.headers.Authorization
      delete mutableEvent.request.headers.authorization
      delete mutableEvent.request.headers.Cookie
      delete mutableEvent.request.headers.cookie
      delete mutableEvent.request.headers['Set-Cookie']
      delete mutableEvent.request.headers['set-cookie']
    }
  }

  if (mutableEvent.user) {
    delete mutableEvent.user.email
    delete mutableEvent.user.username
    delete mutableEvent.user.ip_address
  }

  if (mutableEvent.extra) {
    mutableEvent.extra = sanitizeValue(mutableEvent.extra)
  }

  if (mutableEvent.contexts) {
    mutableEvent.contexts = sanitizeValue(mutableEvent.contexts)
  }

  if (Array.isArray(mutableEvent.breadcrumbs)) {
    mutableEvent.breadcrumbs = mutableEvent.breadcrumbs.map((breadcrumb: Record<string, unknown>) =>
      sanitizeValue(breadcrumb),
    )
  }

  return mutableEvent as T
}

function ensureError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error
  }

  if (isPlainObject(error)) {
    const message = typeof error.message === 'string' ? error.message : fallbackMessage
    const normalized = new Error(message)
    if (typeof error.stack === 'string') {
      normalized.stack = error.stack
    }
    return normalized
  }

  return new Error(typeof error === 'string' ? error : fallbackMessage)
}

function extractErrorFromLogEntry(entry: LogEntry): Error | null {
  for (const arg of entry.extraArgs) {
    if (arg instanceof Error) {
      return arg
    }

    if (isPlainObject(arg) && arg.error instanceof Error) {
      return arg.error
    }
  }

  if (isPlainObject(entry.payload) && typeof entry.payload.error === 'string') {
    return new Error(entry.payload.error)
  }

  return null
}

function setScopeMetadata(
  scope: {
    setTag: (key: string, value: string) => void
    setContext: (name: string, context: Record<string, unknown>) => void
    setFingerprint: (fingerprint: string[]) => void
  },
  meta: CaptureMeta,
): void {
  scope.setTag('surface', meta.surface)

  if (meta.layer) {
    scope.setTag('layer', meta.layer)
  }

  if (meta.owner) {
    scope.setTag('owner', meta.owner)
  }

  if (meta.tags) {
    for (const [key, value] of Object.entries(meta.tags)) {
      if (value !== null && typeof value !== 'undefined') {
        scope.setTag(key, String(value))
      }
    }
  }

  if (meta.context) {
    scope.setContext('autamedica', sanitizeValue(meta.context) as Record<string, unknown>)
  }

  if (meta.fingerprint && meta.fingerprint.length > 0) {
    scope.setFingerprint(meta.fingerprint)
  }
}

function ensureLoggerBridge(): void {
  const registry = globalThis as Record<string, unknown>
  if (registry[LOGGER_BRIDGE_KEY]) {
    return
  }

  registerLogReporter((entry) => {
    if (entry.level !== 'error') {
      return
    }

    const error = extractErrorFromLogEntry(entry)

    Sentry.withScope((scope) => {
      scope.setTag('logger_level', entry.level)
      scope.setTag('runtime', typeof window === 'undefined' ? 'server' : 'client')
      scope.setContext('logger', {
        message: entry.message,
        ...(entry.context ? { context: sanitizeValue(entry.context) } : {}),
        ...(entry.payload ? { payload: sanitizeValue(entry.payload) } : {}),
        ...(entry.extraArgs.length > 0 ? { extraArgs: sanitizeValue(entry.extraArgs) } : {}),
      })

      if (error) {
        Sentry.captureException(error)
      } else {
        Sentry.captureMessage(entry.message, 'error')
      }
    })
  })

  registry[LOGGER_BRIDGE_KEY] = true
}

export function initClientSentry(runtimeEnv?: RuntimeEnvRecord): void {
  if (typeof window === 'undefined') {
    return
  }

  const registry = globalThis as Record<string, unknown>
  if (registry[CLIENT_INIT_KEY]) {
    return
  }

  const dsn = getSentryDsn(runtimeEnv)
  if (!dsn) {
    return
  }

  ensureLoggerBridge()
  registry[CLIENT_INIT_KEY] = true
}

export function initServerSentry(runtimeEnv?: RuntimeEnvRecord): void {
  if (typeof window !== 'undefined') {
    return
  }

  const registry = globalThis as Record<string, unknown>
  if (registry[SERVER_INIT_KEY]) {
    return
  }

  const dsn = getSentryDsn(runtimeEnv)
  if (!dsn) {
    return
  }

  ensureLoggerBridge()
  registry[SERVER_INIT_KEY] = true
}

export function captureSentryException(error: unknown, meta: CaptureMeta): string | undefined {
  if (typeof window === 'undefined') {
    initServerSentry(meta.runtimeEnv)
  } else {
    initClientSentry(meta.runtimeEnv)
  }

  const dsn = getSentryDsn(meta.runtimeEnv)
  if (!dsn) {
    return undefined
  }

  return Sentry.withScope((scope) => {
    setScopeMetadata(scope, meta)
    return Sentry.captureException(ensureError(error, meta.surface))
  })
}

export { sanitizeEvent }

