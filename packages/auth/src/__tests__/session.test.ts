import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock: @autamedica/shared ───────────────────────────────────────
vi.mock('@autamedica/shared', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  ensureServerEnv: vi.fn((key: string) => `mock-${key}`),
}))

// ─── Mock: @autamedica/types ────────────────────────────────────────
vi.mock('@autamedica/types', () => ({
  toISODateString: vi.fn((date: Date) => date.toISOString()),
}))

// ─── Mock: @supabase/ssr (used by ../server.ts) ────────────────────
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  })),
}))

import {
  getSession,
  getCurrentUser,
  hasRole,
  hasPortalAccess,
  requireSession,
  requirePortalAccess,
  signOut,
  RedirectError,
} from '../session'

// ─── Helpers ────────────────────────────────────────────────────────

/** Crea un Request con cookie header para simular autenticación */
function createMockRequest(cookies = ''): Request {
  const headers = new Headers()
  if (cookies) {
    headers.set('cookie', cookies)
  }
  return new Request('http://localhost:3000/', { headers })
}

/** Datos de sesión de Supabase típicos */
function makeSupabaseSession(overrides: {
  role?: string
  id?: string
  email?: string
  emailConfirmed?: boolean
} = {}) {
  const {
    role = 'patient',
    id = 'user-123',
    email = 'test@autamedica.com',
    emailConfirmed = true,
  } = overrides

  return {
    data: {
      session: {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id,
          email,
          email_confirmed_at: emailConfirmed ? '2025-01-01' : null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          user_metadata: { role },
        },
      },
    },
    error: null,
  }
}

function makeNoSession() {
  return { data: { session: null }, error: null }
}

// ─── Tests ──────────────────────────────────────────────────────────
describe('Session Management', () => {
  const mockRequest = createMockRequest('sb-auth-token=abc123')

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  })

  // ────────────────────────────────────────────────────────────────
  // getSession
  // ────────────────────────────────────────────────────────────────
  describe('getSession', () => {
    it('should return user session when valid', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession())

      const session = await getSession(mockRequest)

      expect(session).not.toBeNull()
      expect(session?.user.id).toBe('user-123')
      expect(session?.user.email).toBe('test@autamedica.com')
      expect(session?.user.role).toBe('patient')
      expect(session?.accessToken).toBe('test-token')
      expect(session?.refreshToken).toBe('test-refresh')
    })

    it('should return null when no session exists', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      const session = await getSession(mockRequest)
      expect(session).toBeNull()
    })

    it('should return null on Supabase error', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: new Error('Connection failed'),
      })

      const session = await getSession(mockRequest)
      expect(session).toBeNull()
    })

    it('should normalize company_admin to organization_admin', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'company_admin' }))

      const session = await getSession(mockRequest)
      expect(session?.user.role).toBe('organization_admin')
    })

    it('should default to patient for unknown roles', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'invalid_role' }))

      const session = await getSession(mockRequest)
      expect(session?.user.role).toBe('patient')
    })

    it('should default to patient when no role in metadata', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-no-role',
              email: 'norole@test.com',
              email_confirmed_at: null,
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: {},
            },
          },
        },
        error: null,
      })

      const session = await getSession(mockRequest)
      expect(session?.user.role).toBe('patient')
    })

    it('should return null on exception', async () => {
      mockGetSession.mockRejectedValue(new Error('Unexpected error'))

      const session = await getSession(mockRequest)
      expect(session).toBeNull()
    })

    it('should set emailVerified based on email_confirmed_at', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ emailConfirmed: false }))

      const session = await getSession(mockRequest)
      expect(session?.user.emailVerified).toBe(false)
    })

    it('should handle empty refresh token', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: '',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'test@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'patient' },
            },
          },
        },
        error: null,
      })

      const session = await getSession(mockRequest)
      expect(session?.refreshToken).toBe('')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // requireSession
  // ────────────────────────────────────────────────────────────────
  describe('requireSession', () => {
    it('should return session when user is authenticated', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      const session = await requireSession(mockRequest)
      expect(session.user.role).toBe('doctor')
      expect(session.accessToken).toBe('test-token')
    })

    it('should throw RedirectError when no session exists', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      await expect(requireSession(mockRequest)).rejects.toThrow(RedirectError)
    })

    it('should redirect to central login URL', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      try {
        await requireSession(mockRequest)
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toContain('/auth/login')
      }
    })

    it('should include returnTo in redirect URL when provided', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      try {
        await requireSession(mockRequest, '/dashboard')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toContain('returnTo=%2Fdashboard')
      }
    })

    it('should NOT include returnTo for auth paths', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      try {
        await requireSession(mockRequest, '/auth/callback')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).not.toContain('returnTo')
      }
    })
  })

  // ────────────────────────────────────────────────────────────────
  // requirePortalAccess
  // ────────────────────────────────────────────────────────────────
  describe('requirePortalAccess', () => {
    it('should return session when user has portal access', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      const session = await requirePortalAccess(mockRequest, 'doctors')
      expect(session.user.role).toBe('doctor')
    })

    it('should throw RedirectError when no session (unauthenticated)', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      await expect(requirePortalAccess(mockRequest, 'doctors')).rejects.toThrow(RedirectError)
    })

    it('should throw RedirectError when patient tries to access doctors portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'patient' }))

      try {
        await requirePortalAccess(mockRequest, 'doctors')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        // Patient should be redirected to /patients (their default portal)
        expect(redirectError.url).toBe('/patients')
      }
    })

    it('should throw RedirectError when doctor tries to access patients portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      try {
        await requirePortalAccess(mockRequest, 'patients')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toBe('/doctors')
      }
    })

    it('should allow platform_admin to access any portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'platform_admin' }))

      const session = await requirePortalAccess(mockRequest, 'doctors')
      expect(session.user.role).toBe('platform_admin')
    })

    it('should allow platform_admin to access patients portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'platform_admin' }))

      const session = await requirePortalAccess(mockRequest, 'patients')
      expect(session.user.role).toBe('platform_admin')
    })

    it('should allow platform_admin to access admin portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'platform_admin' }))

      const session = await requirePortalAccess(mockRequest, 'admin')
      expect(session.user.role).toBe('platform_admin')
    })

    it('should allow organization_admin to access companies portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'organization_admin' }))

      const session = await requirePortalAccess(mockRequest, 'companies')
      expect(session.user.role).toBe('organization_admin')
    })

    it('should allow organization_admin to access admin portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'organization_admin' }))

      const session = await requirePortalAccess(mockRequest, 'admin')
      expect(session.user.role).toBe('organization_admin')
    })

    it('should redirect patient trying to access admin portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'patient' }))

      try {
        await requirePortalAccess(mockRequest, 'admin')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toBe('/patients')
      }
    })

    it('should redirect company to correct portal when accessing admin', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'company' }))

      try {
        await requirePortalAccess(mockRequest, 'admin')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toBe('/companies')
      }
    })
  })

  // ────────────────────────────────────────────────────────────────
  // signOut
  // ────────────────────────────────────────────────────────────────
  describe('signOut', () => {
    it('should call supabase signOut and throw RedirectError to /', async () => {
      mockSignOut.mockResolvedValue({ error: null })

      try {
        await signOut(mockRequest)
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toBe('/')
      }

      expect(mockSignOut).toHaveBeenCalledOnce()
    })

    it('should still redirect even when signOut has an error', async () => {
      mockSignOut.mockResolvedValue({ error: new Error('Sign out failed') })

      try {
        await signOut(mockRequest)
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError)
        const redirectError = error as RedirectError
        expect(redirectError.url).toBe('/')
      }

      expect(mockSignOut).toHaveBeenCalledOnce()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // getCurrentUser
  // ────────────────────────────────────────────────────────────────
  describe('getCurrentUser', () => {
    it('should return user when session exists', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      const user = await getCurrentUser(mockRequest)
      expect(user).not.toBeNull()
      expect(user?.role).toBe('doctor')
    })

    it('should return null when no session', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      const user = await getCurrentUser(mockRequest)
      expect(user).toBeNull()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // hasRole
  // ────────────────────────────────────────────────────────────────
  describe('hasRole', () => {
    it('should return true when user has matching role', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      expect(await hasRole(mockRequest, 'doctor')).toBe(true)
    })

    it('should return false when user has different role', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'patient' }))

      expect(await hasRole(mockRequest, 'doctor')).toBe(false)
    })

    it('should return false when no session', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      expect(await hasRole(mockRequest, 'doctor')).toBe(false)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // hasPortalAccess
  // ────────────────────────────────────────────────────────────────
  describe('hasPortalAccess', () => {
    it('should return true when doctor has access to doctors portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'doctor' }))

      expect(await hasPortalAccess(mockRequest, 'doctors')).toBe(true)
    })

    it('should return false when patient tries to access doctors portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'patient' }))

      expect(await hasPortalAccess(mockRequest, 'doctors')).toBe(false)
    })

    it('should return false when no user session', async () => {
      mockGetSession.mockResolvedValue(makeNoSession())

      expect(await hasPortalAccess(mockRequest, 'patients')).toBe(false)
    })

    it('should return true for platform_admin on any portal', async () => {
      mockGetSession.mockResolvedValue(makeSupabaseSession({ role: 'platform_admin' }))

      expect(await hasPortalAccess(mockRequest, 'patients')).toBe(true)
      expect(await hasPortalAccess(mockRequest, 'doctors')).toBe(true)
      expect(await hasPortalAccess(mockRequest, 'companies')).toBe(true)
      expect(await hasPortalAccess(mockRequest, 'admin')).toBe(true)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // RedirectError
  // ────────────────────────────────────────────────────────────────
  describe('RedirectError', () => {
    it('should have correct name and url properties', () => {
      const error = new RedirectError('/test')
      expect(error.name).toBe('RedirectError')
      expect(error.url).toBe('/test')
      expect(error.message).toBe('Redirect to /test')
    })

    it('should be instanceof Error', () => {
      const error = new RedirectError('/test')
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(RedirectError)
    })
  })
})
