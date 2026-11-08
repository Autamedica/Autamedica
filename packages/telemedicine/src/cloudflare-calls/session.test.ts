// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { CloudflareCallsSession } from './session'

describe('CloudflareCallsSession lifecycle races', () => {
  it('sends the actual room scope with every web SFU request', async () => {
    const originalFetch = globalThis.fetch
    const proxy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'synthetic-session' }),
    })
    globalThis.fetch = proxy as typeof globalThis.fetch
    try {
      const session = new CloudflareCallsSession({
        apiProxyUrl: '/api/doctors/cloudflare-calls',
        roomId: 'cf-room-br-jordan',
        onTrack: vi.fn(),
        onConnectionStateChange: vi.fn(),
      })
      await (session as unknown as { cfApi: (method: string, path: string, body?: unknown) => Promise<unknown> })
        .cfApi('POST', 'sessions/new', {})
      const payload = JSON.parse(proxy.mock.calls[0][1].body as string)
      expect(payload.roomId).toBe('cf-room-br-jordan')
      expect(payload.path).toBe('sessions/new')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

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
