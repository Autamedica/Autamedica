import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGuestCallBootstrap } from './useGuestCallSession'

describe('loadGuestCallBootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unwraps the standard API envelope for guest bootstrap', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          callId: 'call_123',
          roomId: 'room_123',
          user: { id: 'guest:call_123', role: 'guest', displayName: 'Paciente externo' },
          permissions: { canJoin: true },
          mediaPolicy: { requireMicrophone: true },
          transport: { cloudflareCallsApiUrl: '/api/calls/guest/cloudflare-calls?token=abc', iceServers: [] },
          waitingRoom: { enabled: false },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadGuestCallBootstrap('room_123', 'guest-token')

    expect(result.callId).toBe('call_123')
    expect(result.user.role).toBe('guest')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/calls/room_123/bootstrap',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer guest-token',
        }),
      }),
    )
  })

  it('throws invalid_call_session when the payload shape is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          roomId: 'room_123',
          user: { id: 'guest:call_123', role: 'guest' },
        },
      }),
    }))

    await expect(loadGuestCallBootstrap('room_123', 'guest-token')).rejects.toThrow('invalid_call_session')
  })
})
