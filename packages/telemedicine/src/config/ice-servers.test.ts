import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchTurnCredentials,
  getExampleIceServersConfig,
  getIceServersConfig,
  getProductionICEServers,
  hasStunIceServer,
  hasTurnIceServer,
  ICE_STUN_ONLY,
  validateIceServersConfig,
} from './ice-servers'

vi.mock('@autamedica/shared', () => ({
  getClientEnvOrDefault: vi.fn((_key: string, fallback: string) => fallback),
  getOptionalClientEnv: vi.fn(() => undefined),
  getServerEnvOrDefault: vi.fn((_key: string, fallback: string) => fallback),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('ICE Servers Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getIceServersConfig', () => {
    it('should return default STUN servers when no env vars are set', () => {
      // Mock empty environment
      vi.stubGlobal('process', { env: {} })
      vi.stubGlobal('window', undefined)

      const servers = getIceServersConfig()

      expect(servers).toHaveLength(5) // 5 default Google STUN servers
      expect(servers[0].urls).toBe('stun:stun.l.google.com:19302')
      expect(servers.every(server =>
        typeof server.urls === 'string' && server.urls.startsWith('stun:')
      )).toBe(true)
    })

    it('should parse ICE servers from JSON env var', () => {
      const testServers = [
        { urls: 'stun:test.example.com:19302' },
        { urls: 'turn:turn.example.com:3478', username: 'test', credential: 'pass' }
      ]

      vi.stubGlobal('process', {
        env: {
          PUBLIC_ICE_SERVERS: JSON.stringify(testServers)
        }
      })

      const servers = getIceServersConfig()

      expect(servers).toHaveLength(2)
      expect(servers[0].urls).toBe('stun:test.example.com:19302')
      expect(servers[1].urls).toBe('turn:turn.example.com:3478')
      expect(servers[1].username).toBe('test')
      expect(servers[1].credential).toBe('pass')
    })

    it('should handle malformed JSON gracefully', () => {
      vi.stubGlobal('process', {
        env: {
          PUBLIC_ICE_SERVERS: 'invalid-json'
        }
      })

      // Should fall back to defaults without throwing
      const servers = getIceServersConfig()
      expect(servers).toHaveLength(5) // Default servers
    })

    it('should filter out invalid server configurations', () => {
      const testServers = [
        { urls: 'stun:valid.example.com:19302' },
        { invalid: 'server' }, // Missing urls
        { urls: 'http://invalid-protocol.com' }, // Invalid protocol
        { urls: 'turn:valid.example.com:3478', username: 'test' }
      ]

      vi.stubGlobal('process', {
        env: {
          PUBLIC_ICE_SERVERS: JSON.stringify(testServers)
        }
      })

      const servers = getIceServersConfig()

      expect(servers).toHaveLength(2) // Only valid servers
      expect(servers[0].urls).toBe('stun:valid.example.com:19302')
      expect(servers[1].urls).toBe('turn:valid.example.com:3478')
    })

    it('should add TURN server from separate env vars', () => {
      vi.stubGlobal('process', {
        env: {
          TURN_SERVER_URL: 'turn:turn.example.com:3478',
          TURN_USERNAME: 'testuser',
          TURN_PASSWORD: 'testpass'
        }
      })

      const servers = getIceServersConfig()

      // Should have TURN server first (priority), then default STUN servers
      expect(servers[0].urls).toBe('turn:turn.example.com:3478')
      expect(servers[0].username).toBe('testuser')
      expect(servers[0].credential).toBe('testpass')
      expect(servers.length).toBeGreaterThan(5) // TURN + default STUNs
    })
  })

  describe('validateIceServersConfig', () => {
    it('should return false for empty or invalid arrays', () => {
      expect(validateIceServersConfig([])).toBe(false)
      expect(validateIceServersConfig(null as any)).toBe(false)
      expect(validateIceServersConfig(undefined as any)).toBe(false)
    })

    it('should return true for valid configuration', () => {
      const servers = [
        { urls: 'stun:stun.example.com:19302' },
        { urls: 'turn:turn.example.com:3478', username: 'test', credential: 'pass' }
      ]

      expect(validateIceServersConfig(servers)).toBe(true)
    })

    it('should warn about missing STUN servers', () => {
      const servers = [
        { urls: 'turn:turn.example.com:3478', username: 'test', credential: 'pass' }
      ]

      // Still returns true (config is usable), but logs a warning internally
      expect(validateIceServersConfig(servers)).toBe(true)
    })

    it('should warn about missing TURN servers', () => {
      const servers = [
        { urls: 'stun:stun.example.com:19302' }
      ]

      // Still returns true (config is usable), but logs a warning internally
      expect(validateIceServersConfig(servers)).toBe(true)
    })
  })

  describe('hasTurnIceServer', () => {
    it('returns true when TURN or TURNS urls are present', () => {
      expect(
        hasTurnIceServer([
          { urls: 'stun:stun.example.com:19302' },
          { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'] },
        ]),
      ).toBe(true)
    })

    it('returns false for stun-only configs', () => {
      expect(
        hasTurnIceServer([
          { urls: 'stun:stun.example.com:19302' },
          { urls: 'stun:stun2.example.com:19302' },
        ]),
      ).toBe(false)
    })
  })

  describe('hasStunIceServer', () => {
    it('returns true when stun urls are present', () => {
      expect(
        hasStunIceServer([
          { urls: 'stun:stun.example.com:19302' },
          { urls: 'turn:turn.example.com:3478' },
        ]),
      ).toBe(true)
    })

    it('returns false when config only has turn servers', () => {
      expect(
        hasStunIceServer([
          { urls: 'turn:turn.example.com:3478' },
        ]),
      ).toBe(false)
    })
  })

  describe('fetchTurnCredentials', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('should return TURN servers on successful fetch', async () => {
      const turnServers: RTCIceServer[] = [
        { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
        { urls: 'stun:stun.example.com:19302' },
      ]

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, iceServers: turnServers }),
      })

      const result = await fetchTurnCredentials('/api/turn-credentials')

      expect(result).toEqual(turnServers)
    })

    it('should include credentials: include in fetch call', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, iceServers: [{ urls: 'turn:t.com:3478' }] }),
      })
      globalThis.fetch = mockFetch

      await fetchTurnCredentials('/api/turn-credentials')

      expect(mockFetch).toHaveBeenCalledWith('/api/turn-credentials', {
        cache: 'no-store',
        credentials: 'include',
      })
    })

    it('should return STUN-only fallback on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchTurnCredentials()

      expect(result).toEqual(ICE_STUN_ONLY)
      expect(result).toHaveLength(2)
      expect(result.every(s => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
        return urls.every(u => u.startsWith('stun:'))
      })).toBe(true)
    })

    it('should return STUN-only fallback on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const result = await fetchTurnCredentials()

      expect(result).toEqual(ICE_STUN_ONLY)
    })

    it('should log warning on network failure', async () => {
      const { logger } = await import('@autamedica/shared')
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      await fetchTurnCredentials('/api/turn-credentials')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[fetchTurnCredentials] TURN fetch failed'),
        expect.objectContaining({ apiUrl: '/api/turn-credentials' }),
      )
    })

    it('should log warning on non-200 response', async () => {
      const { logger } = await import('@autamedica/shared')
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })

      await fetchTurnCredentials('/api/turn-credentials')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TURN endpoint returned 403'),
        expect.objectContaining({ apiUrl: '/api/turn-credentials' }),
      )
    })

    it('should return STUN-only when response ok is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false }),
      })

      const result = await fetchTurnCredentials()

      expect(result).toEqual(ICE_STUN_ONLY)
    })

    it('should return STUN-only when iceServers array is empty', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, iceServers: [] }),
      })

      const result = await fetchTurnCredentials()

      expect(result).toEqual(ICE_STUN_ONLY)
    })

    it('should use default apiUrl when none provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, iceServers: [{ urls: 'turn:t.com:3478' }] }),
      })
      globalThis.fetch = mockFetch

      await fetchTurnCredentials()

      expect(mockFetch).toHaveBeenCalledWith('/api/turn-credentials', expect.any(Object))
    })
  })

  describe('getProductionICEServers', () => {
    it('should include default STUN servers when no TURN configured', () => {
      vi.stubGlobal('process', { env: {} })

      const servers = getProductionICEServers()

      expect(servers).toHaveLength(2) // ICE_STUN_ONLY has 2 servers
      expect(hasStunIceServer(servers)).toBe(true)
      expect(hasTurnIceServer(servers)).toBe(false)
    })

    it('should merge TURN servers with existing STUN servers', () => {
      vi.stubGlobal('process', {
        env: {
          PUBLIC_TURN_URLS: 'turn:turn.example.com:3478,turns:turn.example.com:5349',
          PUBLIC_TURN_USERNAME: 'myuser',
          PUBLIC_TURN_CREDENTIAL: 'mysecret',
        },
      })

      const servers = getProductionICEServers()

      expect(hasStunIceServer(servers)).toBe(true)
      expect(hasTurnIceServer(servers)).toBe(true)
      // 2 STUN + 1 TURN entry (with 2 urls)
      expect(servers).toHaveLength(3)
      const turnEntry = servers.find(s => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
        return urls.some(u => u.startsWith('turn:'))
      })
      expect(turnEntry).toBeDefined()
      expect(turnEntry?.username).toBe('myuser')
      expect(turnEntry.credential).toBe('mysecret')
      expect(turnEntry.urls).toEqual(['turn:turn.example.com:3478', 'turns:turn.example.com:5349'])
    })

    it('should log warning when TURN env vars are missing', async () => {
      const { logger } = await import('@autamedica/shared')
      vi.stubGlobal('process', { env: {} })

      getProductionICEServers()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No TURN servers configured'),
      )
    })

    it('should not add TURN when only partial env vars are set', () => {
      vi.stubGlobal('process', {
        env: {
          PUBLIC_TURN_URLS: 'turn:turn.example.com:3478',
          // Missing username and credential
        },
      })

      const servers = getProductionICEServers()

      expect(hasTurnIceServer(servers)).toBe(false)
      expect(servers).toHaveLength(2) // STUN only
    })
  })

  describe('hasTurnIceServer — edge cases', () => {
    it('returns false for empty array', () => {
      expect(hasTurnIceServer([])).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(hasTurnIceServer(null as any)).toBe(false)
      expect(hasTurnIceServer(undefined as any)).toBe(false)
    })

    it('handles turns: protocol', () => {
      expect(hasTurnIceServer([{ urls: 'turns:turn.example.com:5349' }])).toBe(true)
    })
  })

  describe('hasStunIceServer — edge cases', () => {
    it('returns false for empty array', () => {
      expect(hasStunIceServer([])).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(hasStunIceServer(null as any)).toBe(false)
      expect(hasStunIceServer(undefined as any)).toBe(false)
    })

    it('handles array-form urls', () => {
      expect(hasStunIceServer([{ urls: ['stun:stun.example.com:19302'] }])).toBe(true)
    })
  })

  describe('getExampleIceServersConfig', () => {
    it('should return valid JSON string', () => {
      const example = getExampleIceServersConfig()

      expect(() => JSON.parse(example)).not.toThrow()

      const parsed = JSON.parse(example)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
      expect(parsed[0].urls).toBeDefined()
    })

    it('should include both STUN and TURN examples', () => {
      const example = getExampleIceServersConfig()
      const parsed = JSON.parse(example)

      const hasStun = parsed.some((server: any) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        return urls.some((url: string) => typeof url === 'string' && url.startsWith('stun:'))
      })
      const hasTurn = parsed.some((server: any) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        return urls.some((url: string) => typeof url === 'string' && url.startsWith('turn:'))
      })

      expect(hasStun).toBe(true)
      expect(hasTurn).toBe(true)
    })
  })
})
