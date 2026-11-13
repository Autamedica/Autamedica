import { describe, expect, it } from 'vitest';
import { getSafeAuthNavigationSearch } from '../auth/safe-auth-navigation';

describe('safe auth navigation query', () => {
  it('preserves only a well-formed role and drops recovery credentials', () => {
    const params = new URLSearchParams(
      'role=patient&token_hash=single-use-otp&type=recovery&code=pkce-code',
    );

    expect(getSafeAuthNavigationSearch(params)).toBe('?role=patient');
  });

  it('drops every query parameter when no valid role is present', () => {
    expect(getSafeAuthNavigationSearch(new URLSearchParams(
      'token_hash=single-use-otp&type=recovery',
    ))).toBe('');
  });

  it('rejects role values that contain query-like payloads', () => {
    expect(getSafeAuthNavigationSearch(new URLSearchParams(
      'role=patient%26token_hash%3Dsecret',
    ))).toBe('');
  });
});
