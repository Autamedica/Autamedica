import { describe, expect, it } from 'vitest'
import {
  isClinicalPatientId,
  isDoctorAssignedToRoom,
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
})
