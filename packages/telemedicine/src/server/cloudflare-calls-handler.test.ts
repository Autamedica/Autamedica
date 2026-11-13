import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleCloudflareCallsProxy } from './cloudflare-calls-handler'

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const env = { appId: 'safe-test-app', appSecret: 'synthetic-provider-credential' }

function request(path: unknown, method: unknown = 'POST'): Request {
  return new Request('https://example.invalid/api/calls/guest/cloudflare-calls', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, method, body: { test: true } }),
  })
}

describe('Cloudflare Calls account credential proxy operation allowlist', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ sessionId: 'safe' }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('rejects arbitrary deletion and generic provider API routes', async () => {
    for (const [path, method] of [
      ['sessions/test-session-1', 'DELETE'],
      ['sessions/test-session-1/tracks/new', 'GET'],
      ['../other-app/sessions/new', 'POST'],
      ['sessions/new?impersonate=true', 'POST'],
      ['https://external.invalid/sessions/new', 'POST'],
      ['sessions/other/../../tokens', 'PUT'],
    ]) {
      const answer = await handleCloudflareCallsProxy(request(path, method), env)
      expect(answer.status).toBe(403)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows only real SDK session setup and scoped track operations', async () => {
    for (const [path, method] of [
      ['sessions/new', 'POST'],
      ['sessions/synthetic-test-session/tracks/new', 'POST'],
      ['sessions/synthetic-test-session/renegotiate', 'PUT'],
      ['sessions/synthetic-test-session/tracks/close', 'PUT'],
    ]) {
      const answer = await handleCloudflareCallsProxy(request(path, method), env)
      expect(answer.status).toBe(200)
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://rtc.live.cloudflare.com/v1/apps/safe-test-app/sessions/new',
    )
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer synthetic-provider-credential')
    }
  })

  it('fails closed when a method or path has unexpected type', async () => {
    expect((await handleCloudflareCallsProxy(request({ value: 'sessions/new' }), env)).status).toBe(400)
    expect((await handleCloudflareCallsProxy(request('sessions/new', ['POST']), env)).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
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
