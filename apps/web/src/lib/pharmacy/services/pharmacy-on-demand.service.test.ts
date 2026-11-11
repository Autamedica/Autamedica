import { describe, expect, it, vi } from 'vitest'
import { PharmacyOnDemandService } from './pharmacy-on-demand.service'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('PharmacyOnDemandService', () => {
  const service = new PharmacyOnDemandService()

  it('creates an on-demand request through the scoped RPC and computes queue position', async () => {
    const mockCount = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockResolvedValue({
          count: 1,
          error: null,
        }),
      }),
    })

    const mockAdmin = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'req-123',
          pharmacy_id: 'ph-456',
          pharmacy_name: 'Farmacia San Martin',
          patient_dni: '38123456',
          patient_name: 'Carlos Gomez',
          patient_phone: '+5491122334455',
          reason: 'Amoxicilina 500mg',
          status: 'pending',
          created_at: '2026-09-18T17:00:00.000Z',
        },
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table === 'pharmacy_consultation_requests') {
          return { select: mockCount }
        }
        return {}
      }),
    } as unknown as SupabaseClient

    const result = await service.createRequest(mockAdmin, {
      pharmacyId: 'ph-456',
      pharmacyName: 'Farmacia San Martin',
      patientDni: '38123456',
      patientName: 'Carlos Gomez',
      patientPhone: '+5491122334455',
      reason: 'Amoxicilina 500mg',
    })

    expect(mockAdmin.rpc).toHaveBeenCalledWith('create_pharmacy_consultation_request', expect.objectContaining({
      p_pharmacy_id: 'ph-456',
      p_patient_dni: '38123456',
      p_patient_phone: '+5491122334455',
    }))
    expect(result.request.id).toBe('req-123')
    expect(result.request.pharmacy_name).toBe('Farmacia San Martin')
    expect(result.queuePosition).toBe(1)
  })

  it('gets request status and generates patient join URL when assigned', async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'pharmacy_consultation_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'req-123',
                    pharmacy_name: 'Farmacia Belgrano',
                    patient_dni: '40111222',
                    patient_name: 'Maria Paz',
                    patient_phone: '+5491199887766',
                    reason: 'Renovacion Enalapril',
                    status: 'assigned',
                    doctor_id: 'doc-789',
                    room_id: 'room_pharm_test_123',
                    guest_invite_id: 'inv-456',
                    created_at: '2026-09-18T17:00:00.000Z',
                    assigned_at: '2026-09-18T17:02:00.000Z',
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'doc-789',
                    user_id: 'user-doc-789',
                    license_number: 'MN-99881',
                    specialty: 'Medicina General',
                    profiles: {
                      first_name: 'Ana',
                      last_name: 'Lopez',
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient

    const status = await service.getRequestStatus(mockAdmin, 'req-123', 'https://paciente.autamedica.com')

    expect(status).not.toBeNull()
    expect(status?.status).toBe('assigned')
    expect(status?.doctor?.name).toBe('Dr. Ana Lopez')
    expect(status?.doctor?.licenseNumber).toBe('MN-99881')
    expect(status?.patientJoinUrl).toBe(
      'https://paciente.autamedica.com/call/join/room_pharm_test_123?invite=inv-456',
    )
  })

  it('toggles doctor on-duty status and creates active duty session', async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'doc-1',
                    user_id: 'user-1',
                    license_number: 'MP-123',
                    specialty: 'Clinica Medica',
                    on_duty_pharmacy: false,
                    on_duty_since: null,
                    profiles: { first_name: 'Juan', last_name: 'Perez' },
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (table === 'doctor_on_duty_sessions') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sess-999' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pharmacy_consultation_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient

    const result = await service.toggleDoctorOnDuty(mockAdmin, 'user-1', true)

    expect(result.onDuty).toBe(true)
    expect(result.activeSessionId).toBe('sess-999')
    expect(result.waitingQueueCount).toBe(2)
  })

  it('claims a request atomically, creating a call and guest invite', async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'doc-1',
                    user_id: 'user-1',
                    license_number: 'MP-123',
                    specialty: 'Clinica Medica',
                    on_duty_pharmacy: true,
                    on_duty_since: '2026-09-18T10:00:00Z',
                    profiles: { first_name: 'Juan', last_name: 'Perez' },
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pharmacy_consultation_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'req-1',
                    status: 'pending',
                    patient_dni: '30111222',
                    patient_name: 'Esteban Gomez',
                    patient_phone: '+5491144445555',
                    reason: 'Ibuprofeno 600mg',
                    pharmacy_name: 'Farmacity 20',
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        }
        if (table === 'calls') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'call-99', room_id: 'room_pharm_test' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'call_guest_invites') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'invite-88' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient

    const claim = await service.claimRequest(mockAdmin, 'user-1', 'req-1', 'https://autamedica.com')

    expect(claim.requestId).toBe('req-1')
    expect(claim.callId).toBe('call-99')
    expect(claim.guestInviteId).toBe('invite-88')
    expect(claim.doctorRoomUrl).toContain('/doctors/call/')
    expect(claim.patientJoinUrl).toContain('/call/join/')
    expect(claim.patient.name).toBe('Esteban Gomez')
  })

  it('completes consultation and generates prefilled prescription URL', async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'doctors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'doc-1',
                    user_id: 'user-1',
                    license_number: 'MP-123',
                    specialty: 'Clinica Medica',
                    on_duty_pharmacy: true,
                    on_duty_since: '2026-09-18T10:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pharmacy_consultation_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'req-1',
                    doctor_id: 'doc-1',
                    patient_dni: '30111222',
                    patient_name: 'Esteban Gomez',
                    reason: 'Ibuprofeno 600mg',
                    pharmacy_name: 'Farmacia Central',
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient

    const result = await service.completeRequest(mockAdmin, 'user-1', 'req-1')

    expect(result.completed).toBe(true)
    expect(result.prescriptionUrl).toContain('/doctors/prescriptions?')
    expect(result.prescriptionUrl).toContain('patientName=Esteban+Gomez')
    expect(result.prescriptionUrl).toContain('patientDni=30111222')
    expect(result.prescriptionUrl).toContain('source=pharmacy_express')
  })
})
