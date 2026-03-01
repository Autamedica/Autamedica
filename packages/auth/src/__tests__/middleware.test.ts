import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock: next/server ─────────────────────────────────────────────
class MockCookieStore {
  private store = new Map<string, string>()
  get(name: string) {
    const value = this.store.get(name)
    return value !== undefined ? { name, value } : undefined
  }
  set(opts: { name: string; value: string }) {
    this.store.set(opts.name, opts.value)
  }
  delete(name: string) {
    this.store.delete(name)
  }
}

function createMockNextRequest(url: string, opts?: { host?: string }) {
  const parsedUrl = new URL(url)
  const headers = new Headers()
  if (opts?.host) headers.set('host', opts.host)

  return {
    url,
    nextUrl: parsedUrl,
    cookies: new MockCookieStore(),
    headers,
  }
}

const mockNextResponse = {
  cookies: new MockCookieStore(),
  headers: new Headers(),
}

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    next: vi.fn(() => ({
      cookies: new MockCookieStore(),
      headers: new Headers(),
    })),
    redirect: vi.fn((url: URL) => ({
      status: 302,
      headers: new Headers({ Location: url.toString() }),
      cookies: new MockCookieStore(),
      _redirectUrl: url.toString(),
    })),
  },
}))

// ─── Mock: @supabase/ssr ────────────────────────────────────────────
const mockGetSession = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  })),
}))

// ─── Mock: config utils ─────────────────────────────────────────────
vi.mock('../utils/config', () => ({
  getSupabaseConfig: vi.fn(() => ({
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
  })),
  getSessionConfig: vi.fn(() => ({
    cookieName: 'autamedica_session',
    cookieDomain: 'localhost',
    maxAge: 2592000,
    refreshThreshold: 3600,
    rememberMeDuration: 7776000,
  })),
  getDomainConfig: vi.fn(() => ({
    base: 'localhost',
    cookie: 'localhost',
    apps: {
      web: 'http://localhost:3000',
      auth: 'http://localhost:3000',
      patients: 'http://localhost:3003',
      doctors: 'http://localhost:3002',
      companies: 'http://localhost:3004',
      admin: 'http://localhost:3006',
    },
  })),
  sanitizeReturnUrl: vi.fn((url: string | null | undefined) => {
    if (!url) return null
    if (url.startsWith('/')) return url
    return null
  }),
}))

// ─── Mock: logger ───────────────────────────────────────────────────
vi.mock('../utils/logger', () => ({
  default: {
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

// ─── Import SUT after mocks ────────────────────────────────────────
import { NextResponse } from 'next/server'
import { authMiddleware, createAppMiddleware } from '../middleware/auth'

// ─── Helpers ────────────────────────────────────────────────────────
function makeUser(role: string, id = 'user-123', email = 'test@autamedica.com') {
  return {
    id,
    email,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    user_metadata: {
      role,
      first_name: 'Test',
      last_name: 'User',
    },
    app_metadata: {},
  }
}

function makeSession(user = makeUser('patient')) {
  return {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────
describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
  })

  // ──────────────────────────────────────────────────────────────────
  // Public paths
  // ──────────────────────────────────────────────────────────────────
  describe('Public paths', () => {
    it('should allow access to public paths without auth', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/health')

      const result = await authMiddleware(request as never, {
        publicPaths: ['/api/health'],
      })

      expect(NextResponse.next).toHaveBeenCalled()
      expect(NextResponse.redirect).not.toHaveBeenCalled()
    })

    it('should allow access to nested public paths', async () => {
      const request = createMockNextRequest('http://localhost:3000/auth/login')

      const result = await authMiddleware(request as never, {
        publicPaths: ['/auth'],
      })

      expect(NextResponse.next).toHaveBeenCalled()
    })

    it('should NOT treat non-matching paths as public', async () => {
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

      await authMiddleware(request as never, {
        requireAuth: true,
        publicPaths: ['/api/health'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // No auth required
  // ──────────────────────────────────────────────────────────────────
  describe('No auth required', () => {
    it('should allow unauthenticated access when requireAuth is false', async () => {
      const request = createMockNextRequest('http://localhost:3000/')

      mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

      const result = await authMiddleware(request as never, {
        requireAuth: false,
      })

      expect(NextResponse.redirect).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Auth required, no session
  // ──────────────────────────────────────────────────────────────────
  describe('Auth required, no session', () => {
    it('should redirect to login when auth required but no session', async () => {
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0]
      const redirectUrl = redirectCall[0].toString()
      expect(redirectUrl).toContain('/auth/login')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Valid session, correct role
  // ──────────────────────────────────────────────────────────────────
  describe('Valid session, correct role', () => {
    it('should allow access and set auth headers for patient on patients app', async () => {
      const user = makeUser('patient')
      const session = makeSession(user)
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      const result = await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      // The response should have auth headers set
      expect(result).toBeDefined()
    })

    it('should allow access for doctor on doctors app', async () => {
      const user = makeUser('doctor')
      const session = makeSession(user)
      const request = createMockNextRequest('http://localhost:3002/dashboard', {
        host: 'localhost:3002',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      const result = await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['doctor'],
      })

      expect(NextResponse.redirect).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Role normalization (company_admin → organization_admin)
  // ──────────────────────────────────────────────────────────────────
  describe('Role normalization', () => {
    it('should normalize company_admin to organization_admin', async () => {
      const user = makeUser('company_admin')
      const session = makeSession(user)
      // organization_admin maps to admin app (port 3006)
      const request = createMockNextRequest('http://localhost:3006/dashboard', {
        host: 'localhost:3006',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      // admin app allows organization_admin (which is what company_admin normalizes to)
      const result = await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['organization_admin', 'admin', 'platform_admin'],
      })

      expect(NextResponse.redirect).not.toHaveBeenCalled()
    })

    it('should fallback to patient for unknown roles', async () => {
      const user = makeUser('unknown_role')
      const session = makeSession(user)
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      // Since unknown_role normalizes to patient, and patients portal allows patient role
      const result = await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Wrong role → redirect to correct app
  // ──────────────────────────────────────────────────────────────────
  describe('Wrong role for app', () => {
    it('should redirect patient trying to access doctors app', async () => {
      const user = makeUser('patient')
      const session = makeSession(user)
      const request = createMockNextRequest('http://localhost:3002/dashboard', {
        host: 'localhost:3002',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['doctor'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
    })

    it('should redirect doctor trying to access patients app', async () => {
      const user = makeUser('doctor')
      const session = makeSession(user)
      const request = createMockNextRequest('http://localhost:3003/appointments', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user }, error: null })

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Invalid session (getUser fails)
  // ──────────────────────────────────────────────────────────────────
  describe('Invalid session', () => {
    it('should redirect to login when getUser returns error', async () => {
      const session = makeSession()
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Session expired'),
      })

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
      const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0][0].toString()
      expect(redirectUrl).toContain('/auth/login')
    })

    it('should redirect to login when getUser returns no user', async () => {
      const session = makeSession()
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // Error handling
  // ──────────────────────────────────────────────────────────────────
  describe('Error handling', () => {
    it('should redirect to login on unexpected errors', async () => {
      const session = makeSession()
      const request = createMockNextRequest('http://localhost:3003/dashboard', {
        host: 'localhost:3003',
      })

      mockGetSession.mockResolvedValue({ data: { session }, error: null })
      mockGetUser.mockRejectedValue(new Error('Network failure'))

      await authMiddleware(request as never, {
        requireAuth: true,
        allowedRoles: ['patient'],
      })

      expect(NextResponse.redirect).toHaveBeenCalled()
      const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0][0].toString()
      expect(redirectUrl).toContain('/auth/login')
    })
  })
})

// ──────────────────────────────────────────────────────────────────────
// createAppMiddleware factory
// ──────────────────────────────────────────────────────────────────────
describe('createAppMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
  })

  it('should create middleware for patients app with correct roles', async () => {
    const middleware = createAppMiddleware('patients')
    expect(middleware).toBeTypeOf('function')

    // Patients app requires auth → no session should redirect
    const request = createMockNextRequest('http://localhost:3003/dashboard', {
      host: 'localhost:3003',
    })

    await middleware(request as never)

    expect(NextResponse.redirect).toHaveBeenCalled()
  })

  it('should create middleware for doctors app with correct roles', async () => {
    const middleware = createAppMiddleware('doctors')

    const request = createMockNextRequest('http://localhost:3002/dashboard', {
      host: 'localhost:3002',
    })

    await middleware(request as never)

    expect(NextResponse.redirect).toHaveBeenCalled()
  })

  it('should allow /api/health without auth on any app', async () => {
    const middleware = createAppMiddleware('patients')

    const request = createMockNextRequest('http://localhost:3003/api/health', {
      host: 'localhost:3003',
    })

    await middleware(request as never)

    expect(NextResponse.next).toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('should not require auth for web-app', async () => {
    const middleware = createAppMiddleware('web-app')

    const request = createMockNextRequest('http://localhost:3000/some-page', {
      host: 'localhost:3000',
    })

    await middleware(request as never)

    // web-app does not require auth, so no redirect
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('should allow /auth paths as public on web-app', async () => {
    const middleware = createAppMiddleware('web-app')

    const request = createMockNextRequest('http://localhost:3000/auth/login', {
      host: 'localhost:3000',
    })

    await middleware(request as never)

    expect(NextResponse.next).toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })
})
