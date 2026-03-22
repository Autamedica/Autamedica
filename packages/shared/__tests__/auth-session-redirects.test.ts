import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { getSession } from '../src/auth/session';
import { buildSafeLoginUrl } from '../src/security/redirects';

const ENV_KEYS = [
  'SUPABASE_JWT_SECRET',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_ALLOWED_REDIRECTS',
  'PUBLIC_BASE_URL_AUTH',
  'PUBLIC_AUTH_URL',
  'PUBLIC_BASE_URL_WEB',
  'PUBLIC_SITE_URL',
  'PUBLIC_BASE_URL_WEB_APP',
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

interface MockCookieRequest {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

function createMockRequest(cookies: Record<string, string>): MockCookieRequest {
  return {
    cookies: {
      get(name: string) {
        const value = cookies[name];
        return value ? { value } : undefined;
      },
    },
  };
}

async function signToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('shared auth/session + security/redirects', () => {
  let envSnapshot: EnvSnapshot = {};

  beforeEach(() => {
    envSnapshot = {};
    for (const key of ENV_KEYS) {
      envSnapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rebuilds chunked Supabase cookies and verifies JWT session', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.PUBLIC_SUPABASE_URL = 'https://qxjjrpksmwwrmubhvjew.supabase.co';

    const token = await signToken('test-secret', { role: 'doctor', email: 'doctor@autamedica.com' });
    const midpoint = Math.floor(token.length / 2);

    const request = createMockRequest({
      'sb-qxjjrpksmwwrmubhvjew-auth-token.0': token.slice(0, midpoint),
      'sb-qxjjrpksmwwrmubhvjew-auth-token.1': token.slice(midpoint),
    });

    const session = await getSession(request);

    expect(session).not.toBeNull();
    expect(session?.user.id).toBe('user-123');
    expect(session?.user.role).toBe('doctor');
    expect(session?.user.email).toBe('doctor@autamedica.com');
  });

  it('extracts access_token from base64 encoded session cookie payload', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.PUBLIC_SUPABASE_URL = 'https://qxjjrpksmwwrmubhvjew.supabase.co';

    const token = await signToken('test-secret', {
      app_metadata: { role: 'company_admin' },
      email: 'company@autamedica.com',
    });
    const encodedSession = Buffer.from(JSON.stringify({ access_token: token }), 'utf-8').toString('base64url');

    const request = createMockRequest({
      'sb-qxjjrpksmwwrmubhvjew-auth-token': encodeURIComponent(`base64-${encodedSession}`),
    });

    const session = await getSession(request);

    expect(session).not.toBeNull();
    expect(session?.user.role).toBe('company_admin');
    expect(session?.user.email).toBe('company@autamedica.com');
  });

  it('builds login URL from auth base env and never from legacy web-app base', () => {
    process.env.PUBLIC_BASE_URL_AUTH = 'https://auth.autamedica.com';
    process.env.PUBLIC_BASE_URL_WEB_APP = 'https://autamedica-web-app.pages.dev';
    process.env.PUBLIC_ALLOWED_REDIRECTS = 'https://doctors.autamedica.com';

    const loginUrl = new URL(
      buildSafeLoginUrl('doctors', 'https://doctors.autamedica.com/dashboard', 'session_expired')
    );

    expect(loginUrl.origin).toBe('https://auth.autamedica.com');
    expect(loginUrl.pathname).toBe('/auth/login');
    expect(loginUrl.searchParams.get('portal')).toBe('doctors');
    expect(loginUrl.searchParams.get('returnTo')).toBe('https://doctors.autamedica.com/dashboard');
    expect(loginUrl.searchParams.get('error')).toBe('session_expired');
  });

  it('uses localhost:3005 as fallback auth origin for local returnTo', () => {
    process.env.PUBLIC_ALLOWED_REDIRECTS = 'http://localhost:3001';

    const loginUrl = new URL(buildSafeLoginUrl('doctors', 'http://localhost:3001/dashboard'));

    expect(loginUrl.origin).toBe('http://localhost:3005');
    expect(loginUrl.searchParams.get('returnTo')).toBe('http://localhost:3001/dashboard');
  });

  it('removes unsafe external returnTo values', () => {
    process.env.PUBLIC_BASE_URL_AUTH = 'https://www.autamedica.com';

    const loginUrl = new URL(buildSafeLoginUrl('patients', 'https://evil.example/phishing'));

    expect(loginUrl.origin).toBe('https://www.autamedica.com');
    expect(loginUrl.searchParams.get('portal')).toBe('patients');
    expect(loginUrl.searchParams.has('returnTo')).toBe(false);
  });
});
