import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './request'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

vi.mock('@/lib/patients/api/patient-context', () => ({ resolvePatientContext: vi.fn() }))

vi.mock('@autamedica/shared', () => {
  const logMock = { warn: vi.fn(), error: vi.fn((...args: unknown[]) => console.error('[test logger]', ...args)), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logMock.child.mockReturnValue(logMock)
  return { logger: logMock }
})

const { supabaseMock, paymentSwitchesMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } } as {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
    auth: { getUser: ReturnType<typeof vi.fn> }
  },
  paymentSwitchesMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

vi.mock('@/lib/payments/operational-switches', () => ({
  getOperationalPaymentSwitches: paymentSwitchesMock,
}))

const TEST_SECRET = 'test-guest-secret-super-secure-at-least-32-chars!'

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => TEST_SECRET),
}))

// Keep API tests deterministic; recovery-token cryptography has its own unit tests.
vi.mock('@/lib/pharmacy/guest-queue-recovery', () => ({
  createGuestQueueRecoveryToken: vi.fn(() => 'a'.repeat(64)),
  hashGuestQueueRecoveryToken: vi.fn(async () => 'b'.repeat(64)),
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
  update: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
}

function pricingRow(country: 'AR' | 'BR') {
  return country === 'BR'
    ? { country_code: 'BR', currency: 'BRL', consultation_price_minor: 7900, doctor_fee_minor: 4000, partner_commission_minor: 1000, require_payment_before_dispatch: true }
    : { country_code: 'AR', currency: 'ARS', consultation_price_minor: 1500000, doctor_fee_minor: 800000, partner_commission_minor: 200000, require_payment_before_dispatch: true }
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
    update: vi.fn(),
    or: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.maybeSingle.mockReturnValue(chain)
  chain.single.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  chain.update.mockReturnValue(chain)
  chain.or.mockReturnValue(chain)
  return chain
}

function makeContext(options?: {
  body?: unknown
  session?: { user: { id: string } } | null
  jordanEnabled?: boolean
  bearerToken?: string
}): Parameters<typeof POST>[0] {
  const rawBody = options?.body !== undefined
    ? options.body
    : {
        careCountry: 'AR',
        patientDni: '38123456',
        patientPhone: '+5491122334455',
        patientName: 'Ana Gomez',
        tier: 'general',
      };
  const body = typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
    && (rawBody as { careCountry?: string }).careCountry === 'AR'
    && !Object.prototype.hasOwnProperty.call(rawBody, 'patientGenderCode')
    ? { ...rawBody, patientGenderCode: 'M' }
    : rawBody;
  const request = new Request('http://localhost/api/pharmacy/dispatch/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-care-country': typeof rawBody === 'object' && rawBody !== null && 'careCountry' in rawBody ? String((rawBody as { careCountry?: string }).careCountry ?? '') : 'AR',
      ...(options?.bearerToken ? { authorization: options.bearerToken } : {}),
    },
    body: JSON.stringify(body),
  })

  return {
    request,
    locals: {
      session: options?.session !== undefined ? options.session : null,
      runtime: { env: { GUEST_TOKEN_SECRET: TEST_SECRET, ENABLE_JORDAN_PAYMENTS: options?.jordanEnabled ? 'true' : 'false' } },
    },
  } as unknown as Parameters<typeof POST>[0]
}

describe('API: /api/pharmacy/dispatch/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock.rpc.mockResolvedValue({ data: 1, error: null })
    paymentSwitchesMock.mockResolvedValue({
      jordan_qr_payments_enabled: true,
      pharmacy_express_payments_enabled: true,
      global_pix_mp_payments_enabled: true,
    })
    vi.mocked(resolvePatientContext).mockImplementation(async (request, locals) => {
      const careCountry = request.headers.get('x-test-care-country')
      const sessionUserId = (locals as { session?: { user?: { id?: string } } } | undefined)?.session?.user?.id
      const bearerUserId = request.headers.get('authorization') ? '11111111-1111-4111-8111-111111111111' : null
      return {
        userId: sessionUserId ?? bearerUserId ?? 'patient-auth-user-99',
        patientId: 'patient-row-99',
        careCountry: careCountry === 'BR' ? 'BR' : 'AR',
      }
    })
  })

  it('does not create a dispatch or checkout when the canonical capacity RPC reports no available doctor', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 0, error: null })
    supabaseMock.from.mockImplementation((table: string) => table === 'pharmacy_dispatch_pricing_configs'
      ? buildTableChain(pricingRow('BR'))
      : buildTableChain(null))

    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', qrSourceCode: 'SANTANA_DO_LIVRAMENTO_01',
        patientPhone: '+5551987654321', patientName: 'Paciente sintético',
      },
    }))

    expect(response.status).toBe(409)
    expect((await response.json()).error.message).toBe('no_doctors_available_now')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_country_on_duty_capacity', { p_care_country: 'BR' })
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('rechaza una solicitud sin país explícito antes de consultar la base', async () => {
    const response = await POST(makeContext({
      body: { patientDni: '38123456', patientPhone: '+5491122334455', patientName: 'Solo demo' },
    }))
    expect(response.status).toBe(400)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('binds signed-in native Brazilian QR intake to the verified bearer user and returns scoped recovery', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const partnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null })
    const dispatchRow = {
      id: '22222222-2222-4222-8222-222222222222',
      cloudflare_room_id: 'cf-room-native-1', care_country: 'BR',
      status: 'searching', patient_name: 'Paciente BR', requested_by_user_id: ownerId,
      patient_id: 'patient-row-99',
      referral_partner_id: partnerId,
    }
    const dispatchTable = buildTableChain(dispatchRow)
    const recoveryTable = buildTableChain(null)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('BR'))
      if (table === 'commercial_referral_partners') return buildTableChain({ id: partnerId })
      if (table === 'pharmacy_dispatch_requests') return dispatchTable
      if (table === 'pharmacy_guest_dispatch_sessions') return recoveryTable
      if (table === 'patients') return buildTableChain({ id: 'patient-row-99' })
      return buildTableChain(null)
    })
    const response = await POST(makeContext({
      bearerToken: 'Bearer valid-native-patient-jwt',
      session: null,
      jordanEnabled: true,
      body: {
        careCountry: 'BR', lgpdConsent: true, patientCpf: '12345678909',
        patientPhone: '+5551987654321', patientName: 'Paciente BR',
        referralCode: 'JORDAN',
      },
    }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.recoveryToken).toMatch(/^[0-9a-f]{64}$/)
    expect(supabaseMock.auth.getUser).toHaveBeenCalledWith('valid-native-patient-jwt')
    expect(dispatchTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      requested_by_user_id: ownerId, care_country: 'BR', referral_partner_id: partnerId,
      lgpd_consent: true,
      telemedicine_consent_at: expect.any(String),
      telemedicine_consent_version: 'br-pharmacy-express-telemedicine-v1',
    }))
    expect(dispatchTable.insert.mock.calls[0][0]).not.toHaveProperty('patient_gender_code')
    expect(recoveryTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      request_id: dispatchRow.id, token_sha256: expect.any(String),
    }))
  })

  it('rejects an invalid native bearer before writing any clinical or referral data', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null }, error: { message: 'invalid JWT' },
    })
    const response = await POST(makeContext({
      bearerToken: 'Bearer forged-native-jwt',
      jordanEnabled: true,
      body: { careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', patientPhone: '+5551987654321', referralCode: 'JORDAN' },
    }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('denies conflicting browser session and native bearer ownership', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'native-patient' } }, error: null,
    })
    const response = await POST(makeContext({
      bearerToken: 'Bearer valid-native-jwt',
      jordanEnabled: true,
      session: { user: { id: 'different-browser-patient' } },
      body: { careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', patientPhone: '+5551987654321', referralCode: 'JORDAN' },
    }))
    expect(response.status).toBe(403)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('rejects malformed Authorization headers rather than silently creating a guest', async () => {
    const response = await POST(makeContext({
      bearerToken: 'TokenNotBearer random',
      body: { careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', patientPhone: '+5551987654321' },
    }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })


  it('rejects a Brazilian browser intake without explicit telemedicine consent', async () => {
    supabaseMock.from.mockImplementation((table: string) => table === 'pharmacy_dispatch_pricing_configs'
      ? buildTableChain(pricingRow('BR'))
      : buildTableChain(null))
    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, patientCpf: '12345678909',
        patientPhone: '+5551987654321', patientName: 'Paciente BR',
      },
    }))
    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toBe('telemedicine_consent_required')
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('crea un dispatch brasileño usando CPF y no DNI', async () => {
    const dispatch = {
      id: 'dispatch-br-synthetic',
      patient_id: 'patient-row-br-cpf',
      patient_cpf: '12345678909',
      care_country: 'BR',
      cloudflare_room_id: 'cf-room-general-8909-test',
      status: 'searching',
    }
    const table = buildTableChain(dispatch)
    const patientTable = buildTableChain({ id: 'patient-row-br-cpf' })
    supabaseMock.from.mockImplementation((tableName: string) => {
      if (tableName === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('BR'))
      if (tableName === 'pharmacy_dispatch_requests') return table
      if (tableName === 'patients') return patientTable
      return buildTableChain(null)
    })

    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true,
        patientCpf: '12345678909',
        patientPhone: '+5551987654321',
        patientName: 'PACIENTE DEMO',
        tier: 'general',
      },
    }))
    expect(response.status).toBe(200)
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({
      care_country: 'BR',
      patient_cpf: '12345678909',
      patient_dni: null,
      lgpd_consent: true,
      requested_by_user_id: 'patient-auth-user-99',
    }))
    expect(table.insert.mock.calls[0][0]).not.toHaveProperty('patient_gender_code')
  })

  it('rechaza CPF brasileño incompleto', async () => {
    const response = await POST(makeContext({
      body: { careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '1234', patientPhone: '+5551987654321' },
    }))
    expect(response.status).toBe(400)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('devuelve 400 si el DNI es inválido o menor a 5 caracteres', async () => {
    const response = await POST(
      makeContext({
        body: {
          careCountry: 'AR',
          patientDni: '12',
          patientPhone: '+5491122334455',
        },
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toBe('DNI inválido')
  })

  it('devuelve 400 si el teléfono es inválido o menor a 6 dígitos', async () => {
    const response = await POST(
      makeContext({
        body: {
          careCountry: 'AR',
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
          careCountry: 'AR',
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
          careCountry: 'AR',
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
          careCountry: 'AR',
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
          careCountry: 'AR',
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
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('AR'))
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(insertedRow, null)
      }
      return buildTableChain(null, null)
    })

    const response = await POST(
      makeContext({
        body: {
          careCountry: 'AR',
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
    const argentinaInsert = supabaseMock.from.mock.results
      .map((result) => result.value)
      .find((table) => table?.insert?.mock?.calls?.length)?.insert.mock.calls[0][0] as Record<string, unknown>
    expect(argentinaInsert).toHaveProperty('patient_gender_code', 'M')
    expect(argentinaInsert).not.toHaveProperty('lgpd_consent')
  })
  it('atribuye un QR Jordan válido a la solicitud sin inventar farmacia', async () => {
    const partnerId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const row = {
      id: 'dispatch-jordan-demo',
      patient_id: 'patient-row-jordan',
      cloudflare_room_id: 'cf-room-test',
      patient_name: 'Paciente sintético',
      status: 'searching',
    }
    const dispatchTable = buildTableChain(row)
    const patientTable = buildTableChain({ id: 'patient-row-jordan' })
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('BR'))
      if (table === 'commercial_referral_partners') return buildTableChain({ id: partnerId })
      if (table === 'pharmacy_dispatch_requests') return dispatchTable
      if (table === 'patients') return patientTable
      return buildTableChain(null)
    })

    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909',
        patientPhone: '+5551999998888', patientName: 'Paciente sintético',
        referralCode: 'JORDAN', qrSourceCode: 'SANTANA_DO_LIVRAMENTO_01',
      },
      jordanEnabled: true,
    }))
    expect(response.status).toBe(200)
    expect(dispatchTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      referral_partner_id: partnerId,
      referral_source_code: 'SANTANA_DO_LIVRAMENTO_01',
      care_country: 'BR',
      pharmacy_id: null,
      patient_dni: null,
    }))
  })

  it('rechaza Jordan sin checkout habilitado antes de crear una solicitud', async () => {
    paymentSwitchesMock.mockResolvedValue({
      jordan_qr_payments_enabled: false,
      pharmacy_express_payments_enabled: true,
      global_pix_mp_payments_enabled: true,
    })
    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', patientName: 'Paciente sintético',
        patientPhone: '+5551999998888', referralCode: 'JORDAN',
      },
    }))
    expect(response.status).toBe(503)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('accepts Jordan general consultation in Argentina and rejects specialist tiers', async () => {
    const partnerId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const dispatch = buildTableChain({
      id: 'dispatch-jordan-ar-demo', cloudflare_room_id: 'cf-room-jordan-ar',
      patient_name: 'Paciente AR', status: 'searching',
    })
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('AR'))
      if (table === 'commercial_referral_partners') return buildTableChain({ id: partnerId })
      if (table === 'pharmacy_dispatch_requests') return dispatch
      return buildTableChain(null)
    })
    const ar = await POST(makeContext({
      body: {
        careCountry: 'AR', patientDni: '38123456', patientName: 'Paciente AR',
        patientPhone: '+549112345678', referralCode: 'JORDAN',
      },
      jordanEnabled: true,
    }))
    expect(ar.status).toBe(200)
    expect(dispatch.insert).toHaveBeenCalledWith(expect.objectContaining({
      care_country: 'AR', referral_partner_id: partnerId, patient_dni: '38123456',
    }))
    expect(dispatch.insert.mock.calls[0][0]).not.toHaveProperty('telemedicine_consent_at')
    expect(dispatch.insert.mock.calls[0][0]).not.toHaveProperty('telemedicine_consent_version')
    supabaseMock.from.mockClear()
    const specialist = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909',
        patientName: 'Paciente BR', patientPhone: '+5551999998888',
        referralCode: 'JORDAN', tier: 'cardiologia',
      },
      jordanEnabled: true,
    }))
    expect(specialist.status).toBe(400)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('creates a guest QR request without an auth.users account and returns recovery credentials', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue(null)
    const dispatchRow = {
      id: 'guest-dispatch-qr-123',
      care_country: 'AR',
      patient_id: null,
      requested_by_user_id: null,
      patient_dni: '38123456',
      patient_name: 'Ana Gomez',
      patient_phone: '+5491122334455',
      status: 'searching',
    }
    const dispatchTable = buildTableChain(dispatchRow)
    const recoveryTable = buildTableChain(null)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('AR'))
      if (table === 'pharmacy_dispatch_requests') return dispatchTable
      if (table === 'pharmacy_guest_dispatch_sessions') return recoveryTable
      return buildTableChain(null)
    })

    const response = await POST(makeContext())
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.request.id).toBe(dispatchRow.id)
    expect(payload.data.accessToken).toBeDefined()
    expect(payload.data.recoveryToken).toMatch(/^[0-9a-f]{64}$/)
    expect(dispatchTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      care_country: 'AR',
      patient_id: null,
      requested_by_user_id: null,
      patient_dni: '38123456',
      patient_cpf: null,
      patient_name: 'Ana Gomez',
      patient_phone: '+5491122334455',
    }))
    expect(recoveryTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      request_id: dispatchRow.id,
      token_sha256: expect.any(String),
    }))
  })


  it('preserves Brazilian guest intake without an auth.users account and stores consent evidence', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue(null)
    const dispatchRow = {
      id: 'guest-dispatch-br-123',
      care_country: 'BR',
      patient_id: 'guest-br-patient-row',
      requested_by_user_id: null,
      patient_cpf: '12345678909',
      patient_dni: null,
      status: 'pending_payment',
      patient_name: 'Paciente BR convidado',
      patient_phone: '+5551987654321',
    }
    const dispatchTable = buildTableChain(dispatchRow)
    const patientTable = buildTableChain({ id: 'guest-br-patient-row' })
    const recoveryTable = buildTableChain(null)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_pricing_configs') return buildTableChain(pricingRow('BR'))
      if (table === 'pharmacy_dispatch_requests') return dispatchTable
      if (table === 'patients') return patientTable
      if (table === 'pharmacy_guest_dispatch_sessions') return recoveryTable
      return buildTableChain(null)
    })
    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true,
        patientCpf: '12345678909', patientPhone: '+5551987654321',
        patientName: 'Paciente BR convidado',
      },
    }))
    expect(response.status).toBe(200)
    expect(dispatchTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      care_country: 'BR', patient_id: null, requested_by_user_id: null,
      patient_cpf: '12345678909', patient_dni: null, lgpd_consent: true,
      telemedicine_consent_at: expect.any(String),
      telemedicine_consent_version: 'br-pharmacy-express-telemedicine-v1',
    }))
    expect(patientTable.update).toHaveBeenCalledWith(expect.objectContaining({
      lgpd_consent: true,
      telemedicine_consent_at: expect.any(String),
      telemedicine_consent_version: 'br-pharmacy-express-telemedicine-v1',
    }))
    expect(recoveryTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      request_id: dispatchRow.id, token_sha256: expect.any(String),
    }))
  })

  it('does not infer a missing patient care country', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue({ userId: 'p', patientId: 'p-row', careCountry: null })
    const response = await POST(makeContext())
    expect(response.status).toBe(409)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('rejects a request country that differs from the authenticated patient country', async () => {
    vi.mocked(resolvePatientContext).mockResolvedValue({ userId: 'p', patientId: 'p-row', careCountry: 'AR' })
    const response = await POST(makeContext({ body: { careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909', patientPhone: '+5551987654321' } }))
    expect(response.status).toBe(403)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('no acredita origen de Jordan si no existe código QR', async () => {
    const dispatchTable = buildTableChain({
      id: 'dispatch-no-ref-demo', cloudflare_room_id: 'cf-room-demo', status: 'searching',
    })
    supabaseMock.from.mockImplementation((tableName: string) => tableName === 'pharmacy_dispatch_pricing_configs'
      ? buildTableChain(pricingRow('AR')) : dispatchTable)
    const response = await POST(makeContext())
    expect(response.status).toBe(200)
    expect(dispatchTable.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_partner_id: null }))
    expect(supabaseMock.from).not.toHaveBeenCalledWith('commercial_referral_partners')
  })

  it('rechaza referralCode manipulados antes de realizar cualquier escritura', async () => {
    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909',
        patientPhone: '+5551999998888', patientName: 'Paciente sintético',
        referralCode: 'jordan<script>',
      },
    }))
    expect(response.status).toBe(400)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })

  it('no inserta una atribución si el QR no corresponde a un socio activo', async () => {
    const dispatchTable = buildTableChain(null)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'commercial_referral_partners') return buildTableChain(null)
      return dispatchTable
    })
    const response = await POST(makeContext({
      body: {
        careCountry: 'BR', lgpdConsent: true, telemedicineConsent: true, patientCpf: '12345678909',
        patientPhone: '+5551999998888', patientName: 'Paciente sintético',
        referralCode: 'FAKEPARTNER',
      },
    }))
    expect(response.status).toBe(400)
    expect(dispatchTable.insert).not.toHaveBeenCalled()
  })

  it('nunca devuelve detalles clínicos presentes en errores SQL', async () => {
    const table = buildTableChain(null, { code: '23514', message: 'PRIVATE CLINICAL DETAILS 123456789' })
    supabaseMock.from.mockImplementation((tableName: string) => tableName === 'pharmacy_dispatch_pricing_configs'
      ? buildTableChain(pricingRow('AR')) : table)

    const response = await POST(makeContext())
    expect(response.status).toBe(500)
    const json = JSON.stringify(await response.json())
    expect(json).not.toContain('PRIVATE CLINICAL DETAILS')
    expect(json).not.toContain('123456789')
    const { logger } = await import('@autamedica/shared')
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('PRIVATE CLINICAL DETAILS')
  })

})
