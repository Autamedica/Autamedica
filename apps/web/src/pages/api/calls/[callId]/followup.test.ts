import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from './followup'
import { followupScheduleService } from '@/lib/calls/services/followup-schedule.service'

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'calls') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'call-100',
              doctor: { user_id: 'user-1' },
              patient: { user_id: 'user-2' },
            },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'followup-1',
            call_id: 'call-100',
            status: 'pending',
            scheduled_for: '2026-09-04T10:00:00Z',
            message: 'Hola Martha...',
          },
          error: null,
        }),
      }
    }),
  })),
}))

vi.mock('@/lib/api-auth', () => ({
  withAuth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
  isAuthed: vi.fn().mockReturnValue(true),
  withAuthOrApiKey: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

vi.mock('@autamedica/shared', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('API: /api/calls/[callId]/followup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST schedules 48h followup using followupScheduleService', async () => {
    const spy = vi.spyOn(followupScheduleService, 'schedule48hFollowup').mockResolvedValue({
      ok: true,
      callId: 'call-100',
      scheduledFor: '2026-09-04T10:00:00Z',
      message: 'Hola Martha...',
      status: 'pending',
    })

    const request = new Request('http://localhost/api/calls/call-100/followup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ delayHours: 48 }),
    })

    const response = await POST({
      request,
      params: { callId: 'call-100' },
      locals: {},
    } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.callId).toBe('call-100')
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      callId: 'call-100',
      delayHours: 48,
    }))
  })

  it('GET returns followup details for callId', async () => {
    const request = new Request('http://localhost/api/calls/call-100/followup', {
      method: 'GET',
      headers: { 'x-api-key': 'test-key' },
    })

    const response = await GET({
      request,
      params: { callId: 'call-100' },
      locals: {},
    } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('followup-1')
    expect(body.data.call_id).toBe('call-100')
  })
})
