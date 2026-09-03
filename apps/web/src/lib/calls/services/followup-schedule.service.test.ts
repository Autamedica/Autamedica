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

describe('followupScheduleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('schedules 48h followup in ES-LATAM when call ends with Argentine phone', async () => {
    const fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'calls') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'call-123',
                room_id: 'room-abc',
                doctor_id: 'doc-1',
                patient_id: 'pat-1',
                appointment_id: 'appt-1',
                created_at: '2026-09-01T10:00:00Z',
                accepted_at: '2026-09-01T10:01:00Z',
                ended_at: '2026-09-01T10:30:00Z',
              },
              error: null,
            }),
          }
        }
        if (table === 'patients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pat-1', user_id: 'user-pat-1' },
              error: null,
            }),
          }
        }
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'doc-1', user_id: 'user-doc-1' },
              error: null,
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: val === 'user-pat-1'
                  ? { first_name: 'Martha', last_name: 'González', phone: '+5491140001111', country: 'AR' }
                  : { first_name: 'Bruno', last_name: 'Médico' },
                error: null,
              }),
            })),
          }
        }
        if (table === 'appointment_followups') {
          return {
            upsert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'followup-xyz', status: 'pending' },
              error: null,
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

    const result = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-123',
    })
    expect(result.ok).toBe(true)
    expect(result.patientName).toBe('Martha')
    expect(result.doctorName).toBe('Bruno Médico')
    expect(result.dedupeKey).toBe('followup_48h:call:call-123')
    expect(result.message).toBe(
      'Hola Martha, te contactamos de parte del Dr. Bruno Médico por AutaMedica. ¿Cómo te venís sintiendo tras iniciar el tratamiento? Respondé: 1 - Mejor | 2 - Igual | 3 - Peor'
    )
    expect(mockEmit).toHaveBeenCalledWith('appointment.followup_48h', expect.objectContaining({
      callId: 'call-123',
      patientPhone: '+5491140001111',
      lang: 'es',
    }))
  })

  it('schedules 48h followup in PT-BR when phone is Brazilian (+55)', async () => {
    const fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'calls') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'call-br',
                room_id: 'room-br',
                doctor_id: 'doc-br',
                patient_id: 'pat-br',
                appointment_id: 'appt-br',
              },
              error: null,
            }),
          }
        }
        if (table === 'patients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pat-br', user_id: 'user-pat-br' },
              error: null,
            }),
          }
        }
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'doc-br', user_id: 'user-doc-br' },
              error: null,
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: val === 'user-pat-br'
                  ? { first_name: 'Thiago', last_name: 'Silva', phone: '5511999998888', country: 'BR' }
                  : { first_name: 'Eduardo', last_name: 'Marques' },
                error: null,
              }),
            })),
          }
        }
        if (table === 'appointment_followups') {
          return {
            upsert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'followup-br', status: 'pending' },
              error: null,
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

    const result = await followupScheduleService.schedule48hFollowup(fakeAdmin as any, {
      callId: 'call-br',
    })

    expect(result.ok).toBe(true)
    expect(result.message).toBe(
      'Olá Thiago, aqui é a equipe médica do Dr. Eduardo Marques pela AutaMedica. Passando para checar: como você está se sentindo hoje após o início do tratamento? Responda com: 1 - Melhor | 2 - Igual | 3 - Pior'
    )
    expect(mockEmit).toHaveBeenCalledWith('appointment.followup_48h', expect.objectContaining({
      lang: 'pt-br',
    }))
  })
})
