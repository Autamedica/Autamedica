import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './search-options'
import { signGuestToken } from '@/lib/calls/lib/guest-token'

const { adminMock, patientContextMock } = vi.hoisted(() => ({
  adminMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  patientContextMock: { resolve: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => adminMock),
}))
vi.mock('@/lib/patients/api/patient-context', () => ({
  resolvePatientContext: patientContextMock.resolve,
}))
vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => 'test-guest-secret-with-more-than-32-characters'),
}))
vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const secret = 'test-guest-secret-with-more-than-32-characters'
const requestRecord = {
  id: 'request-1',
  patient_id: null,
  requested_by_user_id: null,
  care_country: 'AR',
  cloudflare_room_id: 'room-1',
  status: 'searching',
  search_started_at: new Date(Date.now() - 16 * 60_000).toISOString(),
  international_search_enabled: false,
}

function tableChain(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.maybeSingle.mockResolvedValue({ data, error: null })
  return chain
}

async function makeContext(method: 'GET' | 'POST', body?: unknown) {
  const token = await signGuestToken(
    { callId: requestRecord.id, roomId: requestRecord.cloudflare_room_id, guestName: 'Paciente test' },
    secret,
  )
  return {
    params: { id: requestRecord.id },
    request: new Request(`https://autamedica.test/api/pharmacy/dispatch/request-1/search-options`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-guest-token': token,
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
    locals: { runtime: { env: { GUEST_TOKEN_SECRET: secret } }, session: null },
  } as unknown as Parameters<typeof GET>[0]
}

describe('pharmacy dispatch staged search API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminMock.from.mockReturnValue(tableChain(requestRecord))
    adminMock.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_pharmacy_dispatch_international_capacity') {
        return {
          data: {
            available: true,
            eligible_doctors: 2,
            routes: [{ doctor_country: 'BR', doctor_currency: 'BRL', eligible_doctors: 2 }],
          },
          error: null,
        }
      }
      return {
        data: {
          success: true,
          code: 'INTERNATIONAL_SEARCH_STARTED',
          search_started_at: new Date().toISOString(),
          international_search_enabled: true,
        },
        error: null,
      }
    })
    patientContextMock.resolve.mockResolvedValue(null)
  })

  it('returns only aggregate cross-border capacity to a matching device guest token', async () => {
    const response = await GET(await makeContext('GET'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.availability.eligible_doctors).toBe(2)
    expect(body.data.availability.routes[0].doctor_country).toBe('BR')
    expect(adminMock.rpc).toHaveBeenCalledWith(
      'get_pharmacy_dispatch_international_capacity',
      { p_dispatch_id: requestRecord.id },
    )
  })

  it('advances the search only after the patient device token is validated', async () => {
    const response = await POST(await makeContext('POST', { mode: 'international' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.international_search_enabled).toBe(true)
    expect(adminMock.rpc).toHaveBeenCalledWith(
      'advance_pharmacy_dispatch_search',
      { p_dispatch_id: requestRecord.id, p_mode: 'international' },
    )
  })

  it('rejects invalid mode values before invoking the dispatch engine', async () => {
    const response = await POST(await makeContext('POST', { mode: 'force_cross_border' }))
    expect(response.status).toBe(400)
    expect(adminMock.rpc).not.toHaveBeenCalled()
  })

  it('does not expose availability without a device credential or patient ownership', async () => {
    const context = await makeContext('GET')
    const response = await GET({
      ...context,
      request: new Request('https://autamedica.test/api/pharmacy/dispatch/request-1/search-options'),
    } as Parameters<typeof GET>[0])
    expect(response.status).toBe(401)
    expect(adminMock.rpc).not.toHaveBeenCalled()
  })

  it('does not allow an unrelated authenticated patient to advance another request', async () => {
    patientContextMock.resolve.mockResolvedValue({
      userId: 'other-user',
      patientId: 'other-patient',
      careCountry: 'AR',
    })
    const context = await makeContext('POST', { mode: 'continue_local' })
    const response = await POST({
      ...context,
      request: new Request('https://autamedica.test/api/pharmacy/dispatch/request-1/search-options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'continue_local' }),
      }),
    } as Parameters<typeof POST>[0])
    expect(response.status).toBe(401)
    expect(adminMock.rpc).not.toHaveBeenCalled()
  })
})
