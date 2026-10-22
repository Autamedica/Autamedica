import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

const { createClient } = await import('@supabase/supabase-js');

describe('authenticateSocket', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects when no token is provided (production mode)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', undefined);

    expect(result.authenticated).toBe(false);
    expect(result.userId).toBeUndefined();
  });

  it('allows connection without token in development with SKIP_AUTH', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_AUTH', 'true');

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123');

    expect(result.authenticated).toBe(true);
    expect(result.userId).toBe('user-123');
    expect(result.role).toBe('patient');
  });

  it('rejects connection when Supabase is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'some-token');

    expect(result.authenticated).toBe(false);
  });

  it('rejects when Supabase getUser returns error', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockGetUser },
    } as unknown as ReturnType<typeof createClient>);

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'bad-token');

    expect(result.authenticated).toBe(false);
  });

  it('rejects when userId does not match the JWT subject', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'different-user', user_metadata: { role: 'doctor' } } },
      error: null,
    });

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockGetUser },
    } as unknown as ReturnType<typeof createClient>);

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'valid-token');

    expect(result.authenticated).toBe(false);
  });

  it('authenticates only when the verified database profile is doctor', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123', user_metadata: { role: 'doctor' } } },
      error: null,
    });

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: table === 'profiles'
                ? { role: 'doctor' }
                : { active: true, license_number: 'CRM-SYNTHETIC' },
              error: null,
            }),
          }),
        }),
      })),
    } as unknown as ReturnType<typeof createClient>);

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'valid-token');

    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      'https://test.supabase.co', 'test-anon-key',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer valid-token' } } }),
    );
    expect(result.authenticated).toBe(true);
    expect(result.userId).toBe('user-123');
    expect(result.role).toBe('doctor');
  });

  it.each([
    [{ active: false, license_number: 'CRM-TEST' }, 'inactive'],
    [{ active: true, license_number: 'PENDING-111' }, 'active placeholder'],
    [{ active: true, license_number: '' }, 'missing license'],
  ])('rejects %s doctor claiming clinical signaling access: %s', async (record) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', user_metadata: { role: 'doctor' } } },
        error: null,
      }) },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: table === 'profiles' ? { role: 'doctor' } : record,
              error: null,
            }),
          }),
        }),
      })),
    } as unknown as ReturnType<typeof createClient>);

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'valid-token');
    expect(result.authenticated).toBe(false);
  });

  it('rejects forged doctor role when the verified database profile is patient', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', user_metadata: { role: 'doctor' } } }, error: null,
      }) },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'patient' }, error: null }),
        }) }),
      })),
    } as unknown as ReturnType<typeof createClient>);
    const { authenticateSocket } = await import('../auth.js');
    expect((await authenticateSocket('user-123', 'valid-token')).role).toBe('patient');
  });

  it('uses the trusted patient profile when metadata has no role', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123', user_metadata: {} } },
      error: null,
    });

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'patient' }, error: null }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createClient>);

    const { authenticateSocket } = await import('../auth.js');
    const result = await authenticateSocket('user-123', 'valid-token');

    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      'https://test.supabase.co', 'test-anon-key',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer valid-token' } } }),
    );
    expect(result.authenticated).toBe(true);
    expect(result.role).toBe('patient');
  });
});

describe('verifyJWT', () => {
  const JWT_SECRET = 'test-secret-key-for-unit-tests';

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns decoded payload for a valid token', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', JWT_SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const token = jwt.sign({ sub: 'user-123', role: 'doctor' }, JWT_SECRET);

    const { verifyJWT } = await import('../auth.js');
    const decoded = verifyJWT(token) as Record<string, unknown>;

    expect(decoded).toBeTruthy();
    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('doctor');
  });

  it('returns null for a token signed with a different secret', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', JWT_SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const token = jwt.sign({ sub: 'user-123' }, 'wrong-secret');

    const { verifyJWT } = await import('../auth.js');
    const decoded = verifyJWT(token);

    expect(decoded).toBeNull();
  });

  it('returns null for an expired token', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', JWT_SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const token = jwt.sign({ sub: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' });

    const { verifyJWT } = await import('../auth.js');
    const decoded = verifyJWT(token);

    expect(decoded).toBeNull();
  });

  it('returns null when JWT secret is not configured', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const token = jwt.sign({ sub: 'user-123' }, 'any-secret');

    const { verifyJWT } = await import('../auth.js');
    const decoded = verifyJWT(token);

    expect(decoded).toBeNull();
  });

  it('returns null for a malformed token string', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', JWT_SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const { verifyJWT } = await import('../auth.js');
    const decoded = verifyJWT('not.a.valid.jwt.token');

    expect(decoded).toBeNull();
  });
});
