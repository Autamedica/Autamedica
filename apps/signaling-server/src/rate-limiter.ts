/**
 * Sliding window rate limiter for socket events.
 * Prevents DoS and event flooding per connected socket.
 */

interface RateLimitBucket {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  limit: number
  windowMs: number
}

/** Per-event limits (events per window) */
const EVENT_LIMITS: Record<string, RateLimitConfig> = {
  'join-room':        { limit: 5,   windowMs: 60_000 },
  'leave-room':       { limit: 5,   windowMs: 60_000 },
  'call-init':        { limit: 5,   windowMs: 60_000 },
  'call-end':         { limit: 5,   windowMs: 60_000 },
  'offer':            { limit: 30,  windowMs: 60_000 },
  'answer':           { limit: 30,  windowMs: 60_000 },
  'ice-candidate':    { limit: 120, windowMs: 60_000 },
  'connection-stats': { limit: 20,  windowMs: 60_000 },
}

export class SocketRateLimiter {
  private buckets = new Map<string, Map<string, RateLimitBucket>>()

  /**
   * Returns true if the event is within rate limits, false if throttled.
   */
  check(socketId: string, eventName: string): boolean {
    const config = EVENT_LIMITS[eventName]
    if (!config) return true

    let socketBuckets = this.buckets.get(socketId)
    if (!socketBuckets) {
      socketBuckets = new Map()
      this.buckets.set(socketId, socketBuckets)
    }

    const now = Date.now()
    let bucket = socketBuckets.get(eventName)

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + config.windowMs }
      socketBuckets.set(eventName, bucket)
    }

    bucket.count++
    return bucket.count <= config.limit
  }

  removeSocket(socketId: string): void {
    this.buckets.delete(socketId)
  }
}
