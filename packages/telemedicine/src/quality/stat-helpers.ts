/** Pure helpers for extracting values from RTCStats reports. */

export function getStatNumber(stat: RTCStats, key: string): number | null {
  const value = (stat as unknown as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : null
}

export function getStatString(stat: RTCStats, key: string): string | null {
  const value = (stat as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export function getStatBoolean(stat: RTCStats, key: string): boolean | null {
  const value = (stat as unknown as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : null
}

export function getStatKind(stat: RTCStats): 'audio' | 'video' | null {
  const kind = getStatString(stat, 'kind') ?? getStatString(stat, 'mediaType')
  if (kind === 'audio' || kind === 'video') return kind
  return null
}

export function computeBitrateKbps(currentBytes: number, previousBytes: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0 || currentBytes < previousBytes) return null
  return ((currentBytes - previousBytes) * 8) / elapsedMs
}

export function roundMetric(value: number | null, digits = 1): number | null {
  if (value === null || Number.isNaN(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
