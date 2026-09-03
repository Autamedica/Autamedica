import { describe, it, expect, vi, beforeEach } from 'vitest'
import { followupScheduleService } from './followup-schedule.service'

const mockEmit = vi.fn()

vi.mock('@autamedica/shared', () => ({
  domainEvents: {
    emit: (...args: unknown[]) => mockEmit(...args),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Adversarial Stress & Edge-Case QA: followupScheduleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Edge Case 1: Corrupt phone format ("55", letters, dirty characters) is safely rejected', async () => {
    const upsertSpy = vi.fn().mockReturnThis()
    const fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'calls') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'call-corrupt', doctor_id: 'doc-1', patient_id: 'pat-1' },
              error: null,
            }),
          }
        }
        if (table === 'patients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pat-1', user_id: 'user-1' },
              error: null,
            }),
          }
        }
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'doc-1', user_id: 'user-doc' },
              error: null,
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { first_name: 'Ana', last_name: 'Pérez', phone: 'invalid-phone-xyz' },
                error: null,
              }),
            }),
          }
        }
        if (table === 'appointment_followups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            upsert: upsertSpy,
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }

    const res = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-corrupt',
    })

    // Corrupt phone is rejected with validation error
    expect(res.ok).toBe(false)
    expect(res.error).toBe('invalid_or_missing_phone')
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('Edge Case 2: Missing phone entirely is safely rejected', async () => {
    const upsertSpy = vi.fn().mockReturnThis()
    const fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'calls') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'call-nophone', doctor_id: 'doc-1', patient_id: 'pat-1' },
              error: null,
            }),
          }
        }
        if (table === 'patients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pat-1', user_id: 'user-1' },
              error: null,
            }),
          }
        }
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'doc-1', user_id: 'user-doc' },
              error: null,
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { first_name: 'Carlos', last_name: 'Silva', phone: '' },
                error: null,
              }),
            }),
          }
        }
        if (table === 'appointment_followups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            upsert: upsertSpy,
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }

    const res = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-nophone',
    })

    expect(res.ok).toBe(false)
    expect(res.error).toBe('invalid_or_missing_phone')
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('Edge Case 3: Deduplication key uses callId or appointmentId appropriately', async () => {
    const fakeAdmin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'f-1', status: 'pending' }, error: null }),
          }),
        }),
      })),
    }

    // Call scheduled only with appointmentId
    const resAppt = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      appointmentId: 'appt-999',
      doctorId: 'doc-1',
      patientId: 'pat-1',
      patientPhone: '+5511999998888',
    })

    // Call scheduled with callId
    const resCall = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-888',
      appointmentId: 'appt-999',
      doctorId: 'doc-1',
      patientId: 'pat-1',
      patientPhone: '+5511999998888',
    })

    expect(resAppt.dedupeKey).toBe('followup_48h:appt:appt-999')
    expect(resCall.dedupeKey).toBe('followup_48h:call:call-888')
  })

  it('Edge Case 4: Idempotency protection prevents re-sending already sent followups', async () => {
    let capturedUpsertPayload: any = null
    const fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'appointment_followups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'existing-f1', status: 'sent' },
                error: null,
              }),
            }),
            upsert: vi.fn((payload: any) => {
              capturedUpsertPayload = payload
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'existing-f1', status: 'pending' },
                    error: null,
                  }),
                }),
              }
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }

    const res = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-100',
      doctorId: 'doc-1',
      patientId: 'pat-1',
      patientPhone: '+5491112345678',
    })

    // Confirms idempotency guard skips DB rewrite and prevents duplicate dispatch
    expect(res.ok).toBe(true)
    expect(res.alreadySent).toBe(true)
    expect(capturedUpsertPayload).toBeNull()
  })
})
