export const ADMIN_LAST_ACTIVE_COOKIE = 'au_admin_last_active';
export const DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES = 30;
export const MIN_ADMIN_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_ADMIN_IDLE_TIMEOUT_MINUTES = 480;

export function resolveAdminIdleTimeoutMs(
  runtimeEnv?: Record<string, unknown> | null,
): number {
  const raw =
    runtimeEnv?.ADMIN_IDLE_TIMEOUT_MINUTES ??
    (typeof process !== 'undefined' ? process.env.ADMIN_IDLE_TIMEOUT_MINUTES : undefined);

  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim().length > 0
        ? Number(raw)
        : Number.NaN;

  const minutes = Number.isFinite(parsed) && parsed > 0
    ? Math.min(MAX_ADMIN_IDLE_TIMEOUT_MINUTES, Math.max(MIN_ADMIN_IDLE_TIMEOUT_MINUTES, parsed))
    : DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES;

  return Math.round(minutes * 60_000);
}

export function parseAdminLastActiveCookie(cookieHeader: string | null): number | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) !== ADMIN_LAST_ACTIVE_COOKIE) continue;
    const rawVal = trimmed.slice(eq + 1).trim();
    const parsed = Number(rawVal);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function isAdminSessionIdleExpired(
  lastActiveMs: number | null,
  nowMs: number,
  timeoutMs: number,
): boolean {
  if (lastActiveMs === null) return false;
  return nowMs - lastActiveMs > timeoutMs;
}

export function isAdminSurfacePath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/')
  );
}
