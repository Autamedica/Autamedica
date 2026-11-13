import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIRoute } from 'astro'
const mocks = vi.hoisted(() => ({ context: vi.fn(), pair: vi.fn(), slots: vi.fn(), admin: {} }))
vi.mock('@/lib/patients/api/patient-context', () => ({ resolvePatientContext: mocks.context }))
vi.mock('@/lib/patients/care-country', () => ({ assertCountryPair: mocks.pair }))
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: () => mocks.admin }))
vi.mock('@/lib/doctors/queries/doctor-slots.query', () => ({
  queryDoctorSlots: mocks.slots, DoctorNotFoundError: class extends Error {},
}))
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
import { GET } from './slots'
const invoke = () => GET({
  request: new Request('https://paciente.autamedica.com/api/patients/doctors/doctor/slots?from=2026-11-02&to=2026-11-03'),
  params: { id: 'doctor' }, locals: { supabase: { mustNotReadRawDoctor: true } },
} as unknown as Parameters<APIRoute>[0])
describe('country-authorized doctor availability', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ patientId: 'patient' }); mocks.slots.mockResolvedValue([]) })
  it.each(['AR','BR'])('returns slots for a matching %s patient after country authorization', async (country) => {
    mocks.pair.mockResolvedValue(country)
    expect((await invoke()).status).toBe(200)
    expect(mocks.pair).toHaveBeenCalledWith(mocks.admin, 'patient', 'doctor')
    expect(mocks.slots).toHaveBeenCalledWith(mocks.admin, 'doctor', { dateFrom: '2026-11-02', dateTo: '2026-11-03' })
  })
  it('blocks foreign doctors before querying availability with service privileges', async () => {
    mocks.pair.mockRejectedValue(Object.assign(new Error('care_country'), { code: 'CARE_COUNTRY' }))
    expect((await invoke()).status).toBe(403)
    expect(mocks.slots).not.toHaveBeenCalled()
  })
})
