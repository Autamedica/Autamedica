import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { CallService } from './service'

function createCallEventsClient(
  insertImpl: ReturnType<typeof vi.fn>,
): SupabaseClient<Database> {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: insertImpl,
    })),
  } as unknown as SupabaseClient<Database>
}

describe('CallService call_events persistence', () => {
  it('disables future debug_log persistence after an auth error', async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          code: '401',
          message: 'Unauthorized',
          status: 401,
        },
      })
      .mockResolvedValue({
        error: null,
      })

    const service = new CallService(
      'https://example.supabase.co',
      'anon-key',
      createCallEventsClient(insert),
    )

    await expect(
      service.logDebugEvent('call-1', 'info', 'Spec', 'primer intento'),
    ).resolves.toBeUndefined()

    await expect(
      service.logDebugEvent('call-1', 'info', 'Spec', 'segundo intento'),
    ).resolves.toBeUndefined()

    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('keeps persisting call_events when there is no auth error', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })

    const service = new CallService(
      'https://example.supabase.co',
      'anon-key',
      createCallEventsClient(insert),
    )

    await expect(
      service.logEvent('call-2', 'peer_connected', { peerId: 'peer-1' }),
    ).resolves.toBeUndefined()

    await expect(
      service.logDebugEvent('call-2', 'info', 'Spec', 'todo bien'),
    ).resolves.toBeUndefined()

    expect(insert).toHaveBeenCalledTimes(2)
  })
})
