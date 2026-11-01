import type { ApiErrorCode } from '@autamedica/types'

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } as const

/**
 * Create a successful JSON response.
 * Shape: { success: true, data: T }
 */
export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true as const, data }),
    { status, headers: JSON_HEADERS },
  )
}

/**
 * Create an error JSON response.
 * Shape: { success: false, error: { code, message, details?, timestamp } }
 */
export function jsonFail(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      success: false as const,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        timestamp: new Date().toISOString(),
      },
    }),
    { status, headers: JSON_HEADERS },
  )
}

export const unauthorized = (msg = 'unauthorized') =>
  jsonFail('UNAUTHENTICATED', msg, 401)

export const forbidden = (msg = 'forbidden') =>
  jsonFail('FORBIDDEN', msg, 403)

export const notFound = (msg = 'not_found') =>
  jsonFail('NOT_FOUND', msg, 404)

export const badRequest = (msg: string) =>
  jsonFail('VALIDATION', msg, 400)

export const conflict = (msg: string) =>
  jsonFail('CONFLICT', msg, 409)

export const serviceUnavailable = (msg: string) =>
  jsonFail('SERVICE_UNAVAILABLE', msg, 503)

export const internalError = (msg = 'internal_error', details?: unknown) =>
  jsonFail('INTERNAL', msg, 500, details)

