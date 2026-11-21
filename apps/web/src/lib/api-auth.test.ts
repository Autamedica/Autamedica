import { describe, expect, it, vi, beforeEach } from 'vitest';
import { withAuth, isAuthed } from './api-auth';

const mockBearerGetUser = vi.fn();
const mockCookieGetUser = vi.fn();
const mockCreateAstroBearerClient = vi.fn();
const mockCreateAstroServerClientFromRequest = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(),
  createAstroBearerClient: (...args: unknown[]) => mockCreateAstroBearerClient(...args),
  createAstroServerClientFromRequest: (...args: unknown[]) => mockCreateAstroServerClientFromRequest(...args),
}));

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAstroBearerClient.mockReturnValue({
      auth: { getUser: mockBearerGetUser },
    });
    mockCreateAstroServerClientFromRequest.mockReturnValue({
      auth: { getUser: mockCookieGetUser },
    });
  });

  it('authenticates valid Authorization: Bearer tokens via Supabase Auth without cookies', async () => {
    const fakeUser = { id: 'doctor-user-1', email: 'doctor@autamedica.test' };
    mockBearerGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const request = new Request('https://www.autamedica.com/api/doctors/patients/eventual', {
      method: 'POST',
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' },
    });

    const result = await withAuth(request);
    expect(isAuthed(result)).toBe(true);
    if (isAuthed(result)) {
      expect(result.user.id).toBe('doctor-user-1');
    }
    expect(mockCreateAstroBearerClient).toHaveBeenCalledWith(
      'eyJhbGciOiJIUzI1NiJ9.payload.sig',
      undefined,
    );
    expect(mockBearerGetUser).toHaveBeenCalledWith('eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(mockCreateAstroServerClientFromRequest).not.toHaveBeenCalled();
  });

  it('fails closed with 401 when Authorization header is malformed instead of falling back to cookies', async () => {
    const request = new Request('https://www.autamedica.com/api/doctors/patients/eventual', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    const result = await withAuth(request);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
    expect(mockCreateAstroBearerClient).not.toHaveBeenCalled();
    expect(mockCreateAstroServerClientFromRequest).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase Auth rejects the Bearer token', async () => {
    mockBearerGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid jwt' } });

    const request = new Request('https://www.autamedica.com/api/doctors/patients/eventual', {
      method: 'POST',
      headers: { Authorization: 'Bearer expired.jwt.token' },
    });

    const result = await withAuth(request);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it('preserves cookie-based authentication when no Authorization header is sent', async () => {
    const fakeUser = { id: 'web-doctor-2', email: 'web@autamedica.test' };
    mockCookieGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const request = new Request('https://www.autamedica.com/api/doctors/patients/eventual', {
      method: 'GET',
      headers: { cookie: 'sb-access-token=cookie-val' },
    });

    const result = await withAuth(request);
    expect(isAuthed(result)).toBe(true);
    if (isAuthed(result)) {
      expect(result.user.id).toBe('web-doctor-2');
    }
    expect(mockCreateAstroServerClientFromRequest).toHaveBeenCalledTimes(1);
    expect(mockCreateAstroBearerClient).not.toHaveBeenCalled();
  });
});
