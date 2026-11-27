import { describe, expect, it } from 'vitest'
import {
  isClinicalPatientId,
  isDoctorAssignedToRoom,
  resolveRoomParticipants,
  type ResolvedRoomParticipants,
} from './resolve-room'

const assignedDoctorId = '00000000-0000-4000-8000-000000000002'

const assigned: ResolvedRoomParticipants = {
  patientId: '00000000-0000-4000-8000-000000000001',
  doctorId: assignedDoctorId,
  appointmentId: null,
}

describe('doctor room access', () => {
  it('denies a doctor not assigned to the requested room', () => {
    expect(isDoctorAssignedToRoom(assigned, '00000000-0000-4000-8000-000000000003')).toBe(false)
    expect(isDoctorAssignedToRoom({ ...assigned, doctorId: null }, assignedDoctorId)).toBe(false)
    expect(isDoctorAssignedToRoom(null, assignedDoctorId)).toBe(false)
  })

  it('allows only a verified doctor profile ID or that same doctor auth user ID', () => {
    expect(isDoctorAssignedToRoom(assigned, assignedDoctorId)).toBe(true)
    expect(isDoctorAssignedToRoom(assigned, 'other-profile', assignedDoctorId)).toBe(true)
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

  it('grants doctorHasPatientAccess using doctor_patient.patient_id without selecting missing id column', async () => {
    const { doctorHasPatientAccess } = await import('./resolve-room')
    const selectedByTable: Record<string, string> = {}

    const admin = {
      from(table: string) {
        const query = {
          select: (fields: string) => {
            selectedByTable[table] = fields
            return query
          },
          eq: (_field: string, _value: unknown) => query,
          in: (_field: string, _values: unknown[]) => query,
          is: (_field: string, _value: unknown) => query,
          gte: (_field: string, _value: unknown) => query,
          order: (_field: string, _options: unknown) => query,
          limit: (_value: number) => query,
          maybeSingle: async () => {
            if (table === 'doctor_patient') {
              return { data: { patient_id: '00000000-0000-4000-8000-000000000001' }, error: null }
            }
            return { data: null, error: null }
          },
        }
        return query
      },
    } as unknown as Parameters<typeof doctorHasPatientAccess>[0]

    const allowed = await doctorHasPatientAccess(
      admin,
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    )

    expect(allowed).toBe(true)
    expect(selectedByTable.doctor_patient).toBe('patient_id')
  })
})
