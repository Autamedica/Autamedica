/**
 * In-memory rate limiter for sensitive API endpoints.
 *
 * Lightweight approach suitable for Cloudflare Pages (no external state).
 * Resets on deploy. For production-grade limiting, use Cloudflare's
 * built-in rate limiting rules.
 */

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/** Periodic cleanup interval — 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}

/**
 * Check whether a request identified by `key` is within the allowed rate.
 *
 * @param key - Unique identifier (e.g. IP + endpoint).
 * @param maxRequests - Max requests allowed within the window.
 * @param windowMs - Time window in milliseconds.
 * @returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}
