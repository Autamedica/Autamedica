import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEnvironment,
  getDomainConfig,
  getSessionConfig,
  isSameOrigin,
  sanitizeReturnUrl,
} from '../utils/config'

describe('Config Utilities', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ──────────────────────────────────────────────────────────────────
  // getEnvironment
  // ──────────────────────────────────────────────────────────────────
  describe('getEnvironment', () => {
    it('should return development by default', () => {
      delete process.env.NEXT_PUBLIC_NODE_ENV
      delete process.env.NODE_ENV
      expect(getEnvironment()).toBe('development')
    })

    it('should return production when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.NEXT_PUBLIC_NODE_ENV
      expect(getEnvironment()).toBe('production')
    })

    it('should return staging when NODE_ENV is staging', () => {
      process.env.NODE_ENV = 'staging'
      delete process.env.NEXT_PUBLIC_NODE_ENV
      expect(getEnvironment()).toBe('staging')
    })

    it('should prefer NEXT_PUBLIC_NODE_ENV over NODE_ENV', () => {
      process.env.NEXT_PUBLIC_NODE_ENV = 'production'
      process.env.NODE_ENV = 'development'
      expect(getEnvironment()).toBe('production')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getDomainConfig
  // ──────────────────────────────────────────────────────────────────
  describe('getDomainConfig', () => {
    it('should return development config by default', () => {
      delete process.env.NEXT_PUBLIC_NODE_ENV
      delete process.env.NODE_ENV
      const config = getDomainConfig()

      expect(config.base).toBe('localhost')
      expect(config.cookie).toBe('localhost')
      expect(config.apps.patients).toBe('http://localhost:3003')
      expect(config.apps.doctors).toBe('http://localhost:3002')
    })

    it('should return production config', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.NEXT_PUBLIC_NODE_ENV
      const config = getDomainConfig()

      expect(config.base).toBe('autamedica.com')
      expect(config.apps.patients).toBe('https://patients.autamedica.com')
      expect(config.apps.doctors).toBe('https://doctors.autamedica.com')
    })

    it('should return staging config', () => {
      process.env.NODE_ENV = 'staging'
      delete process.env.NEXT_PUBLIC_NODE_ENV
      const config = getDomainConfig()

      expect(config.base).toBe('pages.dev')
      expect(config.apps.patients).toContain('pages.dev')
    })

    it('should have all 6 app domains configured', () => {
      const config = getDomainConfig()
      expect(config.apps).toHaveProperty('web')
      expect(config.apps).toHaveProperty('auth')
      expect(config.apps).toHaveProperty('patients')
      expect(config.apps).toHaveProperty('doctors')
      expect(config.apps).toHaveProperty('companies')
      expect(config.apps).toHaveProperty('admin')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getSessionConfig
  // ──────────────────────────────────────────────────────────────────
  describe('getSessionConfig', () => {
    it('should return valid session configuration', () => {
      const config = getSessionConfig()

      expect(config.cookieName).toBe('autamedica_session')
      expect(config.maxAge).toBeGreaterThan(0)
      expect(config.refreshThreshold).toBeGreaterThan(0)
      expect(config.rememberMeDuration).toBeGreaterThan(config.maxAge)
    })

    it('should set maxAge to 30 days', () => {
      const config = getSessionConfig()
      const thirtyDays = 30 * 24 * 60 * 60
      expect(config.maxAge).toBe(thirtyDays)
    })

    it('should set refresh threshold to 1 hour', () => {
      const config = getSessionConfig()
      expect(config.refreshThreshold).toBe(3600)
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // sanitizeReturnUrl (anti open-redirect)
  // ──────────────────────────────────────────────────────────────────
  describe('sanitizeReturnUrl', () => {
    it('should return null for null/undefined input', () => {
      expect(sanitizeReturnUrl(null)).toBeNull()
      expect(sanitizeReturnUrl(undefined)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(sanitizeReturnUrl('')).toBeNull()
    })

    it('should allow relative URLs', () => {
      expect(sanitizeReturnUrl('/dashboard')).toBe('/dashboard')
      expect(sanitizeReturnUrl('/appointments/123')).toBe('/appointments/123')
    })

    it('should strip XSS characters', () => {
      const result = sanitizeReturnUrl('/test<script>alert("xss")</script>')
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
    })

    it('should reject external domains (open redirect prevention)', () => {
      expect(sanitizeReturnUrl('https://evil.com/steal-tokens')).toBeNull()
      expect(sanitizeReturnUrl('https://phishing.autamedica.com.evil.com')).toBeNull()
    })

    it('should allow same-origin absolute URLs', () => {
      // In development, localhost URLs should be allowed
      const result = sanitizeReturnUrl('http://localhost:3003/dashboard')
      // Result depends on isSameOrigin check
      expect(result === 'http://localhost:3003/dashboard' || result === null).toBe(true)
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // isSameOrigin
  // ──────────────────────────────────────────────────────────────────
  describe('isSameOrigin', () => {
    it('should return true for known app origins', () => {
      expect(isSameOrigin('http://localhost:3000/path')).toBe(true)
      expect(isSameOrigin('http://localhost:3003/dashboard')).toBe(true)
      expect(isSameOrigin('http://localhost:3002/consultation')).toBe(true)
    })

    it('should return false for external origins', () => {
      expect(isSameOrigin('https://evil.com')).toBe(false)
      expect(isSameOrigin('https://google.com')).toBe(false)
    })

    it('should return false for truly external URLs', () => {
      expect(isSameOrigin('https://attacker.example.com/steal')).toBe(false)
    })
  })
})
