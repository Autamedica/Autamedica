import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCTOR_ROLES, withAuthRole } from './api-auth'

const { state, factory } = vi.hoisted(() => {
  const state = {
    role: 'doctor',
    clinician: { active: true, license_number: 'CRM-VERIFIED-SYNTHETIC' } as
      { active: boolean; license_number: string | null } | null,
    doctorQueryCount: 0,
  }
  const factory = vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: {
          id: 'synthetic-user',
          app_metadata: {},
          user_metadata: { role: 'doctor' },
        } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'profiles') return { data: { role: state.role }, error: null }
            if (table === 'doctors') {
              state.doctorQueryCount += 1
              return { data: state.clinician, error: null }
            }
            throw new Error('Unexpected DB table ' + table)
          },
        }),
      }),
    }),
  }))
  return { state, factory }
})
vi.mock('@/lib/supabase', () => ({
  createAstroServerClientFromRequest: factory,
  createAstroAdminClient: factory,
}))

describe('withAuthRole clinical doctor authorization', () => {
  beforeEach(() => {
    state.role = 'doctor'
    state.clinician = { active: true, license_number: 'CRM-VERIFIED-SYNTHETIC' }
    state.doctorQueryCount = 0
    factory.mockClear()
  })

  it.each([
    { active: false, license_number: 'CRM-TEST' },
    { active: true, license_number: 'PENDING' },
    { active: true, license_number: 'PENDING-111' },
    { active: true, license_number: '' },
  ])('denies a clinically unauthorized doctor even if signup metadata says doctor: %j', async (record) => {
    state.clinician = record
    const result = await withAuthRole(
      new Request('http://localhost/api/doctors/prescriptions'), DOCTOR_ROLES,
    )
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
    expect(state.doctorQueryCount).toBe(1)
  })

  it('permits cleared clinician and verifies the doctor record', async () => {
    const result = await withAuthRole(
      new Request('http://localhost/api/doctors/on-duty/claim'), DOCTOR_ROLES,
    )
    expect(result).not.toBeInstanceOf(Response)
    expect(state.doctorQueryCount).toBe(1)
  })

  it('keeps nonclinical onboarding accessible to a pending applicant', async () => {
    state.clinician = { active: false, license_number: 'PENDING-222' }
    const result = await withAuthRole(
      new Request('http://localhost/api/doctors/profile'), DOCTOR_ROLES,
    )
    expect(result).not.toBeInstanceOf(Response)
    expect(state.doctorQueryCount).toBe(0)
  })

  it('never promotes forged user metadata if profile role is a patient', async () => {
    state.role = 'patient'
    const result = await withAuthRole(
      new Request('http://localhost/api/doctors/prescriptions'), DOCTOR_ROLES,
    )
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
    expect(state.doctorQueryCount).toBe(0)
  })
})
