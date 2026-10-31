import { describe, expect, it } from 'vitest'
import { isDoctorScheduledAppointment } from './appointment-payment-origin'

describe('doctor-created appointment payment exemption', () => {
  const doctorUserId = '00000000-0000-4000-8000-000000000001'
  const patientUserId = '00000000-0000-4000-8000-000000000002'
  const unrelatedUserId = '00000000-0000-4000-8000-000000000003'

  it('permits exemption only when creator equals the assigned doctor user id', () => {
    expect(isDoctorScheduledAppointment(doctorUserId, doctorUserId)).toBe(true)
  })

  it('does not treat an unrelated creator as a doctor booking', () => {
    expect(isDoctorScheduledAppointment(unrelatedUserId, doctorUserId)).toBe(false)
  })

  it('does not treat patient-created bookings as doctor-created', () => {
    expect(isDoctorScheduledAppointment(patientUserId, doctorUserId)).toBe(false)
  })

  it('fails closed when doctor identity or booking provenance is missing', () => {
    expect(isDoctorScheduledAppointment(undefined, doctorUserId)).toBe(false)
    expect(isDoctorScheduledAppointment(doctorUserId, null)).toBe(false)
    expect(isDoctorScheduledAppointment('', doctorUserId)).toBe(false)
  })
})
