import { describe, expect, it } from 'vitest'
import {
  isClinicalPatientId,
  isDoctorAssignedToRoom,
  resolveRoomParticipants,
  type ResolvedRoomParticipants,
} from './resolve-room'

const assigned: ResolvedRoomParticipants = {
  patientId: '00000000-0000-4000-8000-000000000001',
  doctorId: '00000000-0000-4000-8000-000000000002',
  appointmentId: null,
}

describe('doctor room access', () => {
  it('denies a doctor not assigned to the requested room', () => {
    expect(isDoctorAssignedToRoom(assigned, '00000000-0000-4000-8000-000000000003')).toBe(false)
    expect(isDoctorAssignedToRoom({ ...assigned, doctorId: null }, assigned.doctorId!)).toBe(false)
    expect(isDoctorAssignedToRoom(null, assigned.doctorId!)).toBe(false)
  })

  it('allows only a verified doctor profile ID or that same doctor auth user ID', () => {
    expect(isDoctorAssignedToRoom(assigned, assigned.doctorId!)).toBe(true)
    expect(isDoctorAssignedToRoom(assigned, 'other-profile', assigned.doctorId!)).toBe(true)
    expect(isDoctorAssignedToRoom(assigned, 'other-profile', 'other-user')).toBe(false)
  })

  it('never treats synthetic dispatch identifiers as valid patient UUIDs', () => {
    expect(isClinicalPatientId('dispatch:00000000-0000-4000-8000-000000000003')).toBe(false)
    expect(isClinicalPatientId('00000000-0000-4000-8000-000000000003')).toBe(true)
    expect(isClinicalPatientId(null)).toBe(false)
    expect(isClinicalPatientId('')).toBe(false)
  })

  it('keeps pharmacy triage provenance even if a calls row also has a patient UUID', async () => {
    const queriedTables: string[] = []
    const visitPatientId = '00000000-0000-4000-8000-000000000004'
    const rows = {
      pharmacy_dispatch_requests: {
        id: 'dispatch-demo', patient_id: visitPatientId,
        patient_dni: '00000000', patient_name: 'PATIENT DEMO',
        assigned_doctor_id: 'doctor-self', symptom_summary: 'Synthetic reason',
      },
      calls: {
        patient_id: visitPatientId, doctor_id: 'doctor-self',
        appointment_id: null,
      },
    } as Record<string, unknown>

    const admin = {
      from(table: string) {
        queriedTables.push(table)
        const query = {
          select: (_fields: string) => query,
          eq: (_field: string, _value: string) => query,
          in: (_field: string, _values: string[]) => query,
          order: (_field: string, _options: unknown) => query,
          limit: (_value: number) => query,
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        }
        return query
      },
    } as unknown as Parameters<typeof resolveRoomParticipants>[0]

    const result = await resolveRoomParticipants(admin, 'cf-room-general-demonstration')
    expect(queriedTables).toEqual(['pharmacy_dispatch_requests'])
    expect(result?.patientId).toBe(visitPatientId)
    expect(result?.doctorId).toBe('doctor-self')
    expect(result?.triage?.dispatchRequestId).toBe('dispatch-demo')
  })
})
