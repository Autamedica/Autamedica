import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIRoute } from 'astro'
const mocks = vi.hoisted(() => ({ context: vi.fn(), list: vi.fn(), db: {} }))
vi.mock('@/lib/patients/api/patient-context', () => ({ resolvePatientContext: mocks.context }))
vi.mock('@/lib/patients/services/doctors.service', () => ({ doctorsService: { listActiveDoctors: mocks.list } }))
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: () => mocks.db }))
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
import { GET } from './index'
const request = new Request('https://patients.autamedica.com/api/patients/doctors?country=BR&locale=pt')
const invoke = () => GET({ request, locals: {} } as Parameters<APIRoute>[0])
describe('patient doctor directory country authority', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]) })
  it('uses persisted AR despite a BR query parameter', async () => {
    mocks.context.mockResolvedValue({ patientId: 'patient', careCountry: 'AR' })
    expect((await invoke()).status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(mocks.db, 'AR')
  })
  it('uses persisted BR', async () => {
    mocks.context.mockResolvedValue({ patientId: 'patient', careCountry: 'BR' })
    expect((await invoke()).status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(mocks.db, 'BR')
  })
  it('blocks missing country before executing a privileged directory query', async () => {
    mocks.context.mockResolvedValue({ patientId: 'patient', careCountry: null })
    expect((await invoke()).status).toBe(409)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('requires authentication', async () => {
    mocks.context.mockResolvedValue(null)
    expect((await invoke()).status).toBe(401)
    expect(mocks.list).not.toHaveBeenCalled()
  })
})

