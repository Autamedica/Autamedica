import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/logger.service', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

describe('validateFeatureFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PUBLIC_USE_MOCK_VIDEO', '')
    vi.stubEnv('PUBLIC_USE_LIVEKIT', '')
    vi.stubEnv('PUBLIC_FORCE_WEBRTC_P2P', '')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', '')
    vi.stubEnv('PUBLIC_USE_MOCK_AI', 'true')
  })

  it('skips Cloudflare credential warning when P2P is explicitly forced', async () => {
    vi.stubEnv('PUBLIC_FORCE_WEBRTC_P2P', 'true')

    const { validateFeatureFlags } = await import('./feature-flags')
    const { logger } = await import('../services/logger.service')

    validateFeatureFlags()

    expect(logger.warn).not.toHaveBeenCalledWith(
      'WARNING: Video real requiere Cloudflare Calls (CLOUDFLARE_CALLS_APP_ID) o LiveKit (USE_LIVEKIT=true)',
    )
  })
})
