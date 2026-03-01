import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock: config ───────────────────────────────────────────────────
vi.mock('../utils/config', () => ({
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
    if (url.includes('localhost')) return url
    return null
  }),
}))

import {
  getCorrectAppUrl,
  getDefaultRedirectUrl,
  getLoginUrl,
  getRedirectUrl,
  isCorrectAppForRole,
} from '../utils/redirect'

describe('Redirect Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────────────────────────
  // isCorrectAppForRole
  // ──────────────────────────────────────────────────────────────────
  describe('isCorrectAppForRole', () => {
    it('should return true for patient in patients app', () => {
      expect(isCorrectAppForRole('patients', 'patient')).toBe(true)
    })

    it('should return true for doctor in doctors app', () => {
      expect(isCorrectAppForRole('doctors', 'doctor')).toBe(true)
    })

    it('should return true for company in companies app', () => {
      expect(isCorrectAppForRole('companies', 'company')).toBe(true)
    })

    it('should return true for company_admin in companies app', () => {
      expect(isCorrectAppForRole('companies', 'company_admin')).toBe(true)
    })

    it('should return true for admin roles in admin app', () => {
      expect(isCorrectAppForRole('admin', 'organization_admin')).toBe(true)
      expect(isCorrectAppForRole('admin', 'admin')).toBe(true)
      expect(isCorrectAppForRole('admin', 'platform_admin')).toBe(true)
    })

    it('should return true for any role in web-app (universal access)', () => {
      expect(isCorrectAppForRole('web-app', 'patient')).toBe(true)
      expect(isCorrectAppForRole('web-app', 'doctor')).toBe(true)
      expect(isCorrectAppForRole('web-app', 'admin')).toBe(true)
      expect(isCorrectAppForRole('web-app', 'platform_admin')).toBe(true)
    })

    it('should return false for patient in doctors app', () => {
      expect(isCorrectAppForRole('doctors', 'patient')).toBe(false)
    })

    it('should return false for doctor in patients app', () => {
      expect(isCorrectAppForRole('patients', 'doctor')).toBe(false)
    })

    it('should return false for patient in admin app', () => {
      expect(isCorrectAppForRole('admin', 'patient')).toBe(false)
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getCorrectAppUrl
  // ──────────────────────────────────────────────────────────────────
  describe('getCorrectAppUrl', () => {
    it('should return patients app URL for patient role', () => {
      const url = getCorrectAppUrl('patient')
      expect(url).toBe('http://localhost:3003')
    })

    it('should return doctors app URL for doctor role', () => {
      const url = getCorrectAppUrl('doctor')
      expect(url).toBe('http://localhost:3002')
    })

    it('should return companies app URL for company role', () => {
      const url = getCorrectAppUrl('company')
      expect(url).toBe('http://localhost:3004')
    })

    it('should return admin app URL for admin roles', () => {
      expect(getCorrectAppUrl('organization_admin')).toBe('http://localhost:3006')
      expect(getCorrectAppUrl('admin')).toBe('http://localhost:3006')
      expect(getCorrectAppUrl('platform_admin')).toBe('http://localhost:3006')
    })

    it('should preserve path when provided', () => {
      const url = getCorrectAppUrl('doctor', '/consultation/123')
      expect(url).toBe('http://localhost:3002/consultation/123')
    })

    it('should not preserve non-path strings', () => {
      const url = getCorrectAppUrl('doctor', 'not-a-path')
      expect(url).toBe('http://localhost:3002')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getDefaultRedirectUrl
  // ──────────────────────────────────────────────────────────────────
  describe('getDefaultRedirectUrl', () => {
    it('should redirect patient to patients root', () => {
      expect(getDefaultRedirectUrl('patient')).toBe('http://localhost:3003/')
    })

    it('should redirect doctor to /dashboard', () => {
      expect(getDefaultRedirectUrl('doctor')).toBe('http://localhost:3002/dashboard')
    })

    it('should redirect company to /dashboard', () => {
      expect(getDefaultRedirectUrl('company')).toBe('http://localhost:3004/dashboard')
    })

    it('should redirect admin to /dashboard', () => {
      expect(getDefaultRedirectUrl('admin')).toBe('http://localhost:3006/dashboard')
      expect(getDefaultRedirectUrl('platform_admin')).toBe('http://localhost:3006/dashboard')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getLoginUrl
  // ──────────────────────────────────────────────────────────────────
  describe('getLoginUrl', () => {
    it('should return auth login URL without returnUrl', () => {
      const url = getLoginUrl()
      expect(url).toBe('http://localhost:3000/auth/login')
    })

    it('should include returnUrl when provided', () => {
      const url = getLoginUrl('/dashboard')
      expect(url).toContain('http://localhost:3000/auth/login')
      expect(url).toContain('returnUrl')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getRedirectUrl
  // ──────────────────────────────────────────────────────────────────
  describe('getRedirectUrl', () => {
    it('should use returnUrl when valid', () => {
      const url = getRedirectUrl('patient', '/appointments/123')
      expect(url).toBe('http://localhost:3003/appointments/123')
    })

    it('should fall back to lastPath when returnUrl is null', () => {
      const url = getRedirectUrl('doctor', null, '/consultation/456')
      expect(url).toBe('http://localhost:3002/consultation/456')
    })

    it('should fall back to default when both are null', () => {
      const url = getRedirectUrl('patient', null, null)
      expect(url).toBe('http://localhost:3003/')
    })
  })
})
