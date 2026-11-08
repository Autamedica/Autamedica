// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { CloudflareCallsSession } from './session'

describe('CloudflareCallsSession lifecycle races', () => {
  it('ignores a late subscription after close without emitting a fatal error', async () => {
    const onError = vi.fn()
    const session = new CloudflareCallsSession({
      apiProxyUrl: '/api/patients/cloudflare-calls',
      roomId: 'room-test',
      onTrack: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onError,
    })

    await session.close()

    await expect(session.subscribeToSession('remote-session')).resolves.toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })
})
