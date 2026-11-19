import { describe, expect, it } from 'vitest';
import {
  getPasswordRecoveryRedirectUrl,
  getPasswordRecoveryRequestRedirectUrl,
  getPasswordRecoveryTokenHash,
  hasPasswordRecoveryCallback,
} from '../auth/password-recovery';

describe('getPasswordRecoveryRequestRedirectUrl', () => {
  it('normalizes the apex production host to the configured www Site URL', () => {
    expect(
      getPasswordRecoveryRequestRedirectUrl(
        new URL('https://autamedica.com/auth/forgot-password'),
      ),
    ).toBe('https://www.autamedica.com/auth/reset-password');
  });

  it('preserves local and preview origins', () => {
    expect(
      getPasswordRecoveryRequestRedirectUrl(
        new URL('http://localhost:3000/auth/forgot-password'),
      ),
    ).toBe('http://localhost:3000/auth/reset-password');
  });
});

describe('getPasswordRecoveryRedirectUrl', () => {
  it('routes a recovery callback falling back to the Site URL home to the reset page', () => {
    const url = new URL(
      'https://www.autamedica.com/?token_hash=pkce-test-hash&type=recovery',
    );

    expect(getPasswordRecoveryRedirectUrl(url)).toBe(
      'https://www.autamedica.com/auth/reset-password?token_hash=pkce-test-hash&type=recovery',
    );
  });

  it('does not redirect non-recovery links or callbacks without a token hash', () => {
    expect(
      getPasswordRecoveryRedirectUrl(
        new URL('https://www.autamedica.com/?token_hash=some-hash&type=email'),
      ),
    ).toBeNull();
    expect(
      getPasswordRecoveryRedirectUrl(
        new URL('https://www.autamedica.com/?type=recovery'),
      ),
    ).toBeNull();
  });
});

describe('hasPasswordRecoveryCallback', () => {
  it('recognizes a scanner-safe recovery token hash without redeeming it', () => {
    const url = new URL(
      'https://www.autamedica.com/auth/reset-password?token_hash=opaque-hash&type=recovery',
    );

    expect(hasPasswordRecoveryCallback(url)).toBe(true);
    expect(getPasswordRecoveryTokenHash(url)).toBe('opaque-hash');
  });

  it('does not treat a token hash for another email action as password recovery', () => {
    expect(
      getPasswordRecoveryTokenHash(
        new URL('https://www.autamedica.com/auth/reset-password?token_hash=hash&type=email'),
      ),
    ).toBeNull();
  });

  it('rejects an empty recovery token hash', () => {
    expect(
      getPasswordRecoveryTokenHash(
        new URL('https://www.autamedica.com/auth/reset-password?token_hash=%20&type=recovery'),
      ),
    ).toBeNull();
  });

  it('recognizes a Supabase PKCE recovery callback with a code query parameter', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL('https://www.autamedica.com/auth/reset-password?code=one-time-code'),
      ),
    ).toBe(true);
  });

  it('recognizes legacy implicit-flow access tokens in the URL fragment', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL(
          'https://www.autamedica.com/auth/reset-password#access_token=access&refresh_token=refresh&type=recovery',
        ),
      ),
    ).toBe(true);
  });

  it('recognizes an access token in the query string', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL('https://www.autamedica.com/auth/reset-password?access_token=access'),
      ),
    ).toBe(true);
  });

  it('rejects a reset-password URL without an authentication payload', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL('https://www.autamedica.com/auth/reset-password'),
      ),
    ).toBe(false);
  });

  it('rejects empty PKCE codes', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL('https://www.autamedica.com/auth/reset-password?code='),
      ),
    ).toBe(false);
  });

  it('rejects expired or otherwise failed recovery callbacks', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL(
          'https://www.autamedica.com/auth/reset-password?error=access_denied&error_code=otp_expired',
        ),
      ),
    ).toBe(false);
  });

  it('rejects an error in the fragment even when an access token is present', () => {
    expect(
      hasPasswordRecoveryCallback(
        new URL(
          'https://www.autamedica.com/auth/reset-password#error=access_denied&access_token=invalid',
        ),
      ),
    ).toBe(false);
  });
});
