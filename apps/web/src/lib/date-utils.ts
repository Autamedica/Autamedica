const DEFAULT_LOCALE = 'es-AR'

/**
 * Format a duration in seconds to a human-readable string.
 * Examples: "45s", "2m 5s", "1h 3m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`
}

/**
 * Relative time from a date string. Spanish output.
 * Examples: "ahora", "5m", "3h", "2d"
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/**
 * Format a date string to a locale-aware date (no time).
 *
 * Default:  day numeric, month short, year numeric → "21 mar 2026"
 * Options override Intl.DateTimeFormatOptions.
 */
export function formatDate(
  dateStr: string | undefined | null,
  opts?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
  if (!dateStr) return ''
  try {
    const { locale, ...dtfOpts } = opts ?? {}
    return new Intl.DateTimeFormat(locale ?? DEFAULT_LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...dtfOpts,
    }).format(new Date(dateStr))
  } catch {
    return ''
  }
}

/**
 * Format a date string to a locale-aware date WITH time.
 * Default: day numeric, month short, year numeric, hour 2-digit, minute 2-digit
 */
export function formatDateTime(
  dateStr: string | undefined | null,
  opts?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
  if (!dateStr) return ''
  try {
    const { locale, ...dtfOpts } = opts ?? {}
    return new Intl.DateTimeFormat(locale ?? DEFAULT_LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...dtfOpts,
    }).format(new Date(dateStr))
  } catch {
    return ''
  }
}

/**
 * Format a date string to time only.
 * Default: hour 2-digit, minute 2-digit → "14:30"
 */
export function formatTime(
  dateStr: string | Date | undefined | null,
  opts?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
  if (!dateStr) return ''
  try {
    const { locale, ...dtfOpts } = opts ?? {}
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    return new Intl.DateTimeFormat(locale ?? DEFAULT_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      ...dtfOpts,
    }).format(date)
  } catch {
    return ''
  }
}
