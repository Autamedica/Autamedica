import { logger } from '@autamedica/shared'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Typed fetch wrapper for internal API routes.
 *
 * - Always sends `credentials: 'include'` (session cookies).
 * - Auto-serialises body as JSON.
 * - Parses the standard `{ success, data, error }` envelope.
 * - Returns `T` directly on success.
 * - Throws `ApiError` on HTTP or envelope error.
 */
export async function fetchApi<T>(
  url: string,
  options?: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  },
): Promise<T> {
  const method = options?.method ?? (options?.body ? 'POST' : 'GET')

  const headers: Record<string, string> = { ...options?.headers }
  if (options?.body) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  // Try to parse JSON regardless of status — errors also come as JSON
  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const errorMsg =
      json?.error?.message ?? json?.error ?? `HTTP ${res.status}`
    const errorCode = json?.error?.code ?? undefined
    logger.error(`[fetchApi] ${method} ${url} → ${res.status}:`, errorMsg)
    throw new ApiError(errorMsg, res.status, errorCode)
  }

  // Envelope: { success: true, data: T }
  if (json && typeof json === 'object' && 'success' in json) {
    if (!json.success) {
      const errorMsg = json.error?.message ?? json.error ?? 'Request failed'
      const errorCode = json.error?.code ?? undefined
      throw new ApiError(errorMsg, res.status, errorCode)
    }
    return json.data as T
  }

  // Non-envelope JSON (rare, but support it)
  return json as T
}
