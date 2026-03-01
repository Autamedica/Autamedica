import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock: next/navigation ─────────────────────────────────────────
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

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
}))

// ─── Mock: @autamedica/types ────────────────────────────────────────
vi.mock('@autamedica/types', () => ({
  toISODateString: vi.fn((date: Date) => date.toISOString()),
}))

// ─── Mock: Supabase server client ───────────────────────────────────
const mockGetSession = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()

vi.mock('../server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  })),
}))

import { getSession, getCurrentUser, hasRole, hasPortalAccess } from '../session'

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSession', () => {
    it('should return user session when valid', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
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

      const session = await getSession()

      expect(session).not.toBeNull()
      expect(session?.user.id).toBe('user-123')
      expect(session?.user.email).toBe('test@autamedica.com')
      expect(session?.user.role).toBe('patient')
      expect(session?.accessToken).toBe('test-token')
    })

    it('should return null when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const session = await getSession()
      expect(session).toBeNull()
    })

    it('should return null on Supabase error', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: new Error('Connection failed'),
      })

      const session = await getSession()
      expect(session).toBeNull()
    })

    it('should normalize company_admin to organization_admin', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-456',
              email: 'admin@company.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'company_admin' },
            },
          },
        },
        error: null,
      })

      const session = await getSession()
      expect(session?.user.role).toBe('organization_admin')
    })

    it('should default to patient for unknown roles', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-789',
              email: 'user@test.com',
              email_confirmed_at: null,
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'invalid_role' },
            },
          },
        },
        error: null,
      })

      const session = await getSession()
      expect(session?.user.role).toBe('patient')
    })

    it('should return null on exception', async () => {
      mockGetSession.mockRejectedValue(new Error('Unexpected error'))

      const session = await getSession()
      expect(session).toBeNull()
    })
  })

  describe('getCurrentUser', () => {
    it('should return user when session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'test@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'doctor' },
            },
          },
        },
        error: null,
      })

      const user = await getCurrentUser()
      expect(user).not.toBeNull()
      expect(user?.role).toBe('doctor')
    })

    it('should return null when no session', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const user = await getCurrentUser()
      expect(user).toBeNull()
    })
  })

  describe('hasRole', () => {
    it('should return true when user has matching role', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'doctor@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'doctor' },
            },
          },
        },
        error: null,
      })

      expect(await hasRole('doctor')).toBe(true)
    })

    it('should return false when user has different role', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'patient@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'patient' },
            },
          },
        },
        error: null,
      })

      expect(await hasRole('doctor')).toBe(false)
    })
  })

  describe('hasPortalAccess', () => {
    it('should return true when doctor has access to doctors portal', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'doctor@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'doctor' },
            },
          },
        },
        error: null,
      })

      expect(await hasPortalAccess('doctors')).toBe(true)
    })

    it('should return false when patient tries to access doctors portal', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'user-123',
              email: 'patient@autamedica.com',
              email_confirmed_at: '2025-01-01',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              user_metadata: { role: 'patient' },
            },
          },
        },
        error: null,
      })

      expect(await hasPortalAccess('doctors')).toBe(false)
    })

    it('should return false when no user session', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      expect(await hasPortalAccess('patients')).toBe(false)
    })
  })
})
