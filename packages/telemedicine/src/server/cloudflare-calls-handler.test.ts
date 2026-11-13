import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCloudflareCallsProxy } from './cloudflare-calls-handler'

const env = { appId: 'cf-synthetic', appSecret: 'synthetic-secret' }
const request = (path: string, method = 'POST') =>
  new Request('http://localhost/api/doctors/cloudflare-calls', {
    method: 'POST',
    body: JSON.stringify({ roomId: 'room-test', path, method, body: {} }),
  })

describe('Cloudflare SFU path validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects upstream URL injection and unknown operations without fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const path of ['../../admin', 'sessions/new?foo=1', 'https://attacker.test/', 'sessions/x/tracks/delete']) {
      const result = await handleCloudflareCallsProxy(request(path), env)
      expect(result.status).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid HTTP method per operation', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await handleCloudflareCallsProxy(request('sessions/new', 'PUT'), env)).status).toBe(400)
    expect((await handleCloudflareCallsProxy(request('sessions/session-1/renegotiate', 'POST'), env)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards only whitelisted operations to Cloudflare', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    expect((await handleCloudflareCallsProxy(request('sessions/new'), env)).status).toBe(200)
    expect((await handleCloudflareCallsProxy(request('sessions/synthetic-123/renegotiate', 'PUT'), env)).status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('https://rtc.live.cloudflare.com/v1/apps/cf-synthetic/sessions/new')
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })
})
