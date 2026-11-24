import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES,
  MAX_ADMIN_IDLE_TIMEOUT_MINUTES,
  MIN_ADMIN_IDLE_TIMEOUT_MINUTES,
  isAdminSessionIdleExpired,
  isAdminSurfacePath,
  parseAdminLastActiveCookie,
  resolveAdminIdleTimeoutMs,
} from './session-timeout';

describe('admin session-timeout', () => {
  it('defaults idle timeout to 30 minutes', () => {
    expect(resolveAdminIdleTimeoutMs(undefined)).toBe(DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES * 60_000);
    expect(resolveAdminIdleTimeoutMs({ ADMIN_IDLE_TIMEOUT_MINUTES: 'invalid' })).toBe(30 * 60_000);
  });

  it('clamps configured idle timeout to [5, 480] minutes', () => {
    expect(resolveAdminIdleTimeoutMs({ ADMIN_IDLE_TIMEOUT_MINUTES: '1' })).toBe(
      MIN_ADMIN_IDLE_TIMEOUT_MINUTES * 60_000,
    );
    expect(resolveAdminIdleTimeoutMs({ ADMIN_IDLE_TIMEOUT_MINUTES: '15' })).toBe(15 * 60_000);
    expect(resolveAdminIdleTimeoutMs({ ADMIN_IDLE_TIMEOUT_MINUTES: '9999' })).toBe(
      MAX_ADMIN_IDLE_TIMEOUT_MINUTES * 60_000,
    );
  });

  it('parses au_admin_last_active cookie safely', () => {
    expect(parseAdminLastActiveCookie(null)).toBeNull();
    expect(parseAdminLastActiveCookie('foo=bar; au_admin_last_active=1700000000000; baz=1')).toBe(
      1700000000000,
    );
    expect(parseAdminLastActiveCookie('au_admin_last_active=abc')).toBeNull();
    expect(parseAdminLastActiveCookie('au_admin_last_active=-10')).toBeNull();
  });

  it('checks idle expiration against nowMs and timeoutMs', () => {
    expect(isAdminSessionIdleExpired(null, 1_000_000, 60_000)).toBe(false);
    expect(isAdminSessionIdleExpired(1_000_000, 1_060_000, 60_000)).toBe(false);
    expect(isAdminSessionIdleExpired(1_000_000, 1_060_001, 60_000)).toBe(true);
  });

  it('matches only admin UI and API surfaces', () => {
    expect(isAdminSurfacePath('/admin')).toBe(true);
    expect(isAdminSurfacePath('/admin/doctors')).toBe(true);
    expect(isAdminSurfacePath('/api/admin')).toBe(true);
    expect(isAdminSurfacePath('/api/admin/finance')).toBe(true);
    expect(isAdminSurfacePath('/')).toBe(false);
    expect(isAdminSurfacePath('/patients')).toBe(false);
    expect(isAdminSurfacePath('/admin-fake')).toBe(false);
  });
});
