import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEmit, mockFindById, mockUpdateCallStatus } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
  mockFindById: vi.fn(),
  mockUpdateCallStatus: vi.fn(),
}))

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  domainEvents: { emit: mockEmit },
}))

vi.mock('@/lib/calls/repos/call-response.repo', () => ({
  callResponseRepo: {
    findById: mockFindById,
    updateCallStatus: mockUpdateCallStatus,
  },
}))

vi.mock('@/lib/calls/lib/consultation-credits', () => ({
  decrementFreeConsultation: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/calls/lib/doctor-videoconsulta-credits', () => ({
  decrementDoctorVideoconsulta: vi.fn().mockResolvedValue(undefined),
}))

import { persistCallStatusService } from './persist-call-status.service'

const VIEWER = {
  userId: 'doctor-user-1',
  doctorProfileId: 'doctor-1',
  patientProfileId: null,
}

const BASE_CALL = {
  id: 'call-1',
  room_id: 'room-1',
  doctor_id: 'doctor-1',
  patient_id: 'patient-1',
  status: 'connected' as const,
  created_at: '2026-04-17T10:00:00.000Z',
  accepted_at: '2026-04-17T10:00:30.000Z',
  ended_at: null,
  reason: null,
  appointment_id: null,
}

const fakeDb = {} as any

describe('persistCallStatusService — call.ended emit', () => {
  beforeEach(() => {
    mockEmit.mockClear()
    mockFindById.mockReset()
    mockUpdateCallStatus.mockReset()
    mockUpdateCallStatus.mockResolvedValue(true)
  })

  it('emits call.ended once with computed durationSeconds when transitioning to ended', async () => {
    mockFindById.mockResolvedValue(BASE_CALL)

    // Freeze time to produce a deterministic duration: 10 minutes after accepted_at.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T10:10:30.000Z'))

    try {
      const result = await persistCallStatusService.persist(fakeDb, fakeDb, {
        callId: 'call-1',
        status: 'ended',
        viewer: VIEWER,
      })

      expect(result.kind).toBe('ok')
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('call.ended', {
        callId: 'call-1',
        roomId: 'room-1',
        durationSeconds: 600,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT emit when the transition is idempotent (call already ended)', async () => {
    mockFindById.mockResolvedValue({ ...BASE_CALL, status: 'ended' })

    const result = await persistCallStatusService.persist(fakeDb, fakeDb, {
      callId: 'call-1',
      status: 'ended',
      viewer: VIEWER,
    })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.data.changed).toBe(false)
    }
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does NOT emit call.ended for non-ended transitions', async () => {
    mockFindById.mockResolvedValue({ ...BASE_CALL, status: 'accepted' })

    await persistCallStatusService.persist(fakeDb, fakeDb, {
      callId: 'call-1',
      status: 'connecting',
      viewer: VIEWER,
    })

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('falls back to created_at for duration when accepted_at is missing', async () => {
    mockFindById.mockResolvedValue({ ...BASE_CALL, accepted_at: undefined })

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T10:01:00.000Z'))

    try {
      await persistCallStatusService.persist(fakeDb, fakeDb, {
        callId: 'call-1',
        status: 'ended',
        viewer: VIEWER,
      })

      expect(mockEmit).toHaveBeenCalledWith('call.ended', {
        callId: 'call-1',
        roomId: 'room-1',
        durationSeconds: 60,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('swallows emit errors without breaking the status transition', async () => {
    mockFindById.mockResolvedValue(BASE_CALL)
    mockEmit.mockRejectedValueOnce(new Error('handler down'))

    const result = await persistCallStatusService.persist(fakeDb, fakeDb, {
      callId: 'call-1',
      status: 'ended',
      viewer: VIEWER,
    })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.data.changed).toBe(true)
    }
    expect(mockEmit).toHaveBeenCalledTimes(1)
  })

  it('does not consume or emit twice when another participant wins the closing update', async () => {
    mockFindById.mockResolvedValueOnce(BASE_CALL)
      .mockResolvedValueOnce({ ...BASE_CALL, status: 'ended' })
    mockUpdateCallStatus.mockResolvedValue(false)
    const result = await persistCallStatusService.persist(fakeDb, fakeDb, {
      callId: 'call-1', status: 'ended', viewer: VIEWER,
    })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') expect(result.data.changed).toBe(false)
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('returns conflict if a concurrent transition produced a different state', async () => {
    mockFindById.mockResolvedValueOnce({ ...BASE_CALL, status: 'accepted' })
      .mockResolvedValueOnce({ ...BASE_CALL, status: 'canceled' })
    mockUpdateCallStatus.mockResolvedValue(false)
    const result = await persistCallStatusService.persist(fakeDb, fakeDb, {
      callId: 'call-1', status: 'connecting', viewer: VIEWER,
    })
    expect(result.kind).toBe('conflict')
    expect(mockEmit).not.toHaveBeenCalled()
  })

})

