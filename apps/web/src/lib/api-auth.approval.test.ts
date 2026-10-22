import { describe, expect, it } from 'vitest'
import { requiresApprovedDoctorForPath } from './api-auth'

describe('sensitive doctor-route entitlement boundary', () => {
  it.each([
    '/api/doctors/patients',
    '/api/doctors/patients/names',
    '/api/doctors/medical-records',
    '/api/doctors/medical-orders',
    '/api/doctors/prescriptions',
    '/api/doctors/prescriptions/abc/issue',
    '/api/doctors/certificates',
    '/api/doctors/on-duty/queue',
    '/api/doctors/on-duty/claim',
    '/api/doctors/calls/start',
    '/api/doctors/turn-credentials',
    '/api/doctors/clinical-safety-evaluate',
  ])('requires clinician approval for %s', (path) => {
    expect(requiresApprovedDoctorForPath(path)).toBe(true)
  })

  it.each([
    '/api/doctors/onboarding-complete',
    '/api/doctors/profile',
    '/api/doctors/profile/photo',
    '/api/profiles/doctors',
    '/api/doctors/billing/subscription',
    '/api/doctors/accounting/dashboard',
    '/api/patients/profile',
  ])('allows nonclinical onboarding or own account routes while pending: %s', (path) => {
    expect(requiresApprovedDoctorForPath(path)).toBe(false)
  })

  it('does not allow lookalike URLs to inherit the protected path matcher', () => {
    expect(requiresApprovedDoctorForPath('/api/doctors/patients-overview')).toBe(false)
    expect(requiresApprovedDoctorForPath('/api/doctors/prescriptionsnotreal')).toBe(false)
  })
})
