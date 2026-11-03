import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './request'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

vi.mock('@/lib/patients/api/patient-context', () => ({ resolvePatientContext: vi.fn() }))

vi.mock('@autamedica/shared', () => {
  const logMock = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logMock.child.mockReturnValue(logMock)
  return { logger: logMock }
})

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() } as {
    from: ReturnType<typeof vi.fn>
  },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

const TEST_SECRET = 'test-guest-secret-super-secure-at-least-32-chars!'

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => TEST_SECRET),
}))

const VALID_KIOSK_ID = '11111111-1111-4111-8111-111111111111'
const VALID_PHARMACY_ID = '22222222-2222-4222-8222-222222222222'

type TableChain = {
  then: (resolve: (value: unknown) => void) => void
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
}

function buildTableChain(data: unknown, error: unknown = null): TableChain {
  const chain: TableChain = {
    then(resolve: (value: unknown) => void) {
      resolve({ data, error })
    },
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.maybeSingle.mockReturnValue(chain)
  chain.single.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  return chain
}

function makeContext(options?: {
  body?: unknown
  session?: { user: { id: string } } | null
}): Parameters<typeof POST>[0] {
  const request = new Request('http://localhost/api/pharmacy/dispatch/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      options?.body !== undefined
        ? options.body
        : {
            patientDni: '38123456',
            patientPhone: '+5491122334455',
            patientName: 'Ana Gomez',
            tier: 'general',
          },
    ),
  })

  return {
    request,
    locals: {
      session: options?.session !== undefined ? options.session : null,
      runtime: { env: { GUEST_TOKEN_SECRET: TEST_SECRET } },
    },
  } as unknown as Parameters<typeof POST>[0]
}

describe('API: /api/pharmacy/dispatch/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolvePatientContext).mockResolvedValue({ userId: 'patient-auth-user-99', patientId: 'patient-row-99', careCountry: 'AR' })
  })

  it('devuelve 400 si el DNI es inválido o menor a 5 caracteres', async () => {
    const response = await POST(
      makeContext({
        body: {
          patientDni: '12',
          patientPhone: '+5491122334455',
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('Número de documento inválido')
  })

  it('devuelve 400 si el teléfono es inválido o menor a 6 dígitos', async () => {
    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '123',
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('Teléfono celular inválido')
  })

  it('devuelve 400 si kioskId tiene formato UUID inválido', async () => {
    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '+5491122334455',
          kioskId: 'not-a-uuid',
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('ID de kiosco con formato inválido')
  })

  it('devuelve 400 si el kiosco no existe en pharmacy_kiosks', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_kiosks') {
        return buildTableChain(null, null)
      }
      return buildTableChain(null, null)
    })

    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '+5491122334455',
          kioskId: VALID_KIOSK_ID,
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('Kiosco no registrado')
  })

  it('devuelve 400 si el kiosco está inactivo', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_kiosks') {
        return buildTableChain({ id: VALID_KIOSK_ID, active: false, pharmacy_id: null }, null)
      }
      return buildTableChain(null, null)
    })

    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '+5491122334455',
          kioskId: VALID_KIOSK_ID,
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('El kiosco no se encuentra activo')
  })

  it('devuelve 400 si el kiosco pertenece a otra farmacia', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_kiosks') {
        return buildTableChain(
          { id: VALID_KIOSK_ID, active: true, pharmacy_id: '33333333-3333-4333-8333-333333333333' },
          null,
        )
      }
      return buildTableChain(null, null)
    })

    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '+5491122334455',
          kioskId: VALID_KIOSK_ID,
          pharmacyId: VALID_PHARMACY_ID,
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('El kiosco no pertenece a la farmacia indicada')
  })

  it('crea exitosamente la solicitud Gen 2, genera accessToken firmado y cloudflare_room_id', async () => {
    const insertedRow = {
      id: 'dispatch-req-123',
      patient_dni: '38123456',
      patient_phone: '+5491122334455',
      patient_name: 'Ana Gomez',
      tier_requested: 'general',
      cloudflare_room_id: 'cf-room-general-3456-test',
      status: 'searching',
    }

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(insertedRow, null)
      }
      if (table === 'patients') return buildTableChain({ id: 'patient-row-99', care_country: 'AR' })
      return buildTableChain(null, null)
    })

    const response = await POST(
      makeContext({
        body: {
          patientDni: '38123456',
          patientPhone: '+5491122334455',
          patientName: 'Ana Gomez',
          tier: 'general',
        },
        session: { user: { id: 'patient-auth-user-99' } },
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.request.id).toBe('dispatch-req-123')
    expect(body.data.accessToken).toBeDefined()
    expect(body.data.cloudflare_room_id).toBeDefined()
  })
  it('requires authenticated identity before creating a clinical request', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue(null)
    const response = await POST(makeContext())
    expect(response.status).toBe(401)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('does not infer country for an existing unknown patient', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue({ userId: 'p', patientId: 'p-row', careCountry: null })
    const response = await POST(makeContext())
    expect(response.status).toBe(409)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it.each([['AR', 'BR'], ['BR', 'AR']] as const)('blocks QR %s for patient %s before dispatch insert', async (origin, patientCountry) => {
    vi.mocked(resolvePatientContext).mockResolvedValue({ userId: 'p', patientId: 'p-row', careCountry: patientCountry })
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacies') return buildTableChain({ id: VALID_PHARMACY_ID, active: true, deleted_at: null, care_country: origin })
      if (table === 'patients') return buildTableChain({ id: 'p-row', care_country: patientCountry })
      return buildTableChain(null)
    })
    const response = await POST(makeContext({ body: { patientDni: 'CI123456', patientPhone: '+55555555555', pharmacyId: VALID_PHARMACY_ID } }))
    expect(response.status).toBe(403)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

})

