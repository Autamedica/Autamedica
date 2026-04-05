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
 * - **Returns `data` directly** — NOT the envelope.
 * - Throws `ApiError` on HTTP or envelope error.
 *
 * @typeParam T The type of the `data` field INSIDE the envelope.
 *   WRONG: `fetchApi<{ success: boolean; data: Foo }>`  ← T is NOT the envelope
 *   RIGHT: `fetchApi<Foo>`                               ← T is the unwrapped data
 */
export async function fetchApi<T>(
  url: string,
  options?: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
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
    signal: options?.signal,
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

/**
 * Fetch a binary blob from an internal API route.
 *
 * Same credential handling as `fetchApi`, but returns the raw
 * `Blob` instead of parsed JSON — useful for PDF downloads.
 */
export async function fetchBlob(
  url: string,
  options?: { signal?: AbortSignal },
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(url, {
    credentials: 'include',
    signal: options?.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(text || `HTTP ${res.status}`, res.status)
  }

  const disposition = res.headers.get('Content-Disposition')
  const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? null
  return { blob: await res.blob(), filename }
}
