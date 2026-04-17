import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@autamedica/shared', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getServerEnvOrDefault: (name: string, defaultValue?: string) =>
    process.env[name] ?? defaultValue,
}))

vi.mock('@autamedica/telemedicine', () => ({
  getIceServersConfig: () => [{ urls: 'stun:stun.l.google.com:19302' }],
  hasTurnIceServer: () => false,
}))

vi.mock('@autamedica/telemedicine/server', () => ({
  handleTurnCredentials: vi.fn(),
}))

vi.mock('@/lib/calls/repos/call-session.repo', () => ({
  callSessionRepo: {},
}))

function stubProd(value: boolean) {
  // import.meta.env.PROD is a boolean in Vite but vi.stubEnv only accepts string.
  // Bypass the type mismatch since vitest handles it correctly at runtime.
  ;(vi.stubEnv as (k: string, v: unknown) => void)('PROD', value)
}

describe('resolveRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PUBLIC_FORCE_WEBRTC_P2P', '')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', '')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_SECRET', '')
    stubProd(false)
  })

  async function loadResolveRuntime() {
    vi.resetModules()
    const mod = await import('./call-session.backend')
    return mod.resolveRuntime
  }

  it('returns cloudflare-calls when credentials are present', async () => {
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', 'app-123')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_SECRET', 'secret-456')
    const resolveRuntime = await loadResolveRuntime()
    expect(resolveRuntime()).toBe('cloudflare-calls')
  })

  it('returns webrtc-p2p when PUBLIC_FORCE_WEBRTC_P2P is true', async () => {
    vi.stubEnv('PUBLIC_FORCE_WEBRTC_P2P', 'true')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', 'app-123')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_SECRET', 'secret-456')
    const resolveRuntime = await loadResolveRuntime()
    expect(resolveRuntime()).toBe('webrtc-p2p')
  })

  it('returns webrtc-p2p in dev when credentials are missing', async () => {
    const resolveRuntime = await loadResolveRuntime()
    expect(resolveRuntime()).toBe('webrtc-p2p')
  })

  it('throws in production when credentials are missing', async () => {
    stubProd(true)
    const resolveRuntime = await loadResolveRuntime()
    expect(() => resolveRuntime()).toThrow('Cloudflare Calls credentials are required in production')
  })

  it('force P2P takes precedence over production check', async () => {
    vi.stubEnv('PUBLIC_FORCE_WEBRTC_P2P', 'true')
    stubProd(true)
    const resolveRuntime = await loadResolveRuntime()
    expect(resolveRuntime()).toBe('webrtc-p2p')
  })
})
