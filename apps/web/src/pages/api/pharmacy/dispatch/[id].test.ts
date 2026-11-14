import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE, GET } from './[id]'
import { signGuestToken } from '@/lib/calls/lib/guest-token'

vi.mock('@autamedica/shared', () => {
  const logMock = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logMock.child.mockReturnValue(logMock)
  return { logger: logMock }
})

const { supabaseMock, patientContextMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() } as {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  },
  patientContextMock: { resolve: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

vi.mock('@/lib/patients/api/patient-context', () => ({
  resolvePatientContext: patientContextMock.resolve,
}))

const TEST_SECRET = 'test-guest-secret-super-secure-at-least-32-chars!'

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => TEST_SECRET),
}))

const REQUEST_RECORD = {
  id: 'req-1',
  requested_by_user_id: 'patient-user-1',
  assigned_doctor_id: 'doc-row-1',
  status: 'searching',
  patient_id: 'patient-row-1',
  cloudflare_room_id: 'cf-room-1',
  care_country: 'AR',
  patient_dni: '12345678',
  patient_phone: '+5491122334455',
  patient_name: 'Carlos Test',
}

const DOCTOR_ROW = {
  id: 'doc-row-1',
  user_id: 'doctor-user-1',
  license_number: 'MN12345',
  specialty: 'Clínica Médica',
  active: true,
  care_country: 'AR',
  license_type: 'MN',
  uf_brazil: null,
}

const PROFILE_ROW = {
  first_name: 'Martín',
  last_name: 'Gómez',
}

type TableChain = {
  then: (resolve: (value: unknown) => void) => void
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  gt: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function buildTableChain(data: unknown, error: unknown = null): TableChain {
  const chain: TableChain = {
    then(resolve: (value: unknown) => void) {
      resolve({ data, error })
    },
    select: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.gt.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.maybeSingle.mockReturnValue(chain)
  chain.single.mockReturnValue(chain)
  chain.update.mockReturnValue(chain)
  return chain
}

function makeContext(options?: {
  id?: string
  url?: string
  headers?: Record<string, string>
  session?: { user: { id: string } } | null
  method?: string
}): Parameters<typeof GET>[0] {
  const reqUrl = options?.url || 'http://localhost/api/pharmacy/dispatch/req-1'
  const request = new Request(reqUrl, {
    method: options?.method || 'GET',
    headers: options?.headers || {},
  })

  return {
    params: { id: options?.id ?? 'req-1' },
    request,
    locals: {
      session: options?.session !== undefined ? options.session : null,
      runtime: { env: { GUEST_TOKEN_SECRET: TEST_SECRET } },
    },
  } as unknown as Parameters<typeof GET>[0]
}

describe('API: /api/pharmacy/dispatch/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null })
    patientContextMock.resolve.mockResolvedValue({
      careCountry: 'AR',
      patientId: 'patient-row-1',
      userId: 'patient-user-1',
    })
  })

  it('cancela solo la solicitud searching del paciente autenticado', async () => {
    const lookup = buildTableChain(REQUEST_RECORD)
    const update = buildTableChain({ id: 'req-1' })
    let call = 0
    supabaseMock.from.mockImplementation(() => call++ === 0 ? lookup : update)

    const response = await DELETE(makeContext({ method: 'DELETE' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.cancelled).toBe(true)
    expect(supabaseMock.from).toHaveBeenCalledTimes(2)
    expect(update.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(update.eq).toHaveBeenCalledWith('id', 'req-1')
    expect(update.eq).toHaveBeenCalledWith('patient_id', 'patient-row-1')
    expect(update.eq).toHaveBeenCalledWith('requested_by_user_id', 'patient-user-1')
    expect(update.eq).toHaveBeenCalledWith('care_country', 'AR')
    expect(update.eq).toHaveBeenCalledWith('status', 'searching')
  })

  it('no cancela sin sesión ni credencial de invitado válida', async () => {
    patientContextMock.resolve.mockResolvedValue(null)
    supabaseMock.from.mockReturnValue(buildTableChain(REQUEST_RECORD))
    const response = await DELETE(makeContext({ method: 'DELETE' }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).toHaveBeenCalledTimes(1)
  })

  it('devuelve conflicto cuando la solicitud ya no está en searching', async () => {
    const lookup = buildTableChain(REQUEST_RECORD)
    const update = buildTableChain(null)
    let call = 0
    supabaseMock.from.mockImplementation(() => call++ === 0 ? lookup : update)
    const response = await DELETE(makeContext({ method: 'DELETE' }))
    expect(response.status).toBe(409)
  })

  it('permite cancelar a un invitado sin sesión con credencial ligada a requestId y roomId', async () => {
    patientContextMock.resolve.mockResolvedValue(null)
    const guestRequest = { ...REQUEST_RECORD, patient_id: 'guest-patient-row', requested_by_user_id: null }
    const lookup = buildTableChain(guestRequest)
    const update = buildTableChain({ id: 'req-1' })
    let call = 0
    supabaseMock.from.mockImplementation(() => call++ === 0 ? lookup : update)
    const guestToken = await signGuestToken({ callId: 'req-1', roomId: 'cf-room-1', guestName: 'Guest' }, TEST_SECRET)

    const response = await DELETE(makeContext({
      method: 'DELETE',
      headers: { 'x-guest-token': guestToken },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.cancelled).toBe(true)
    expect(update.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(update.eq).toHaveBeenCalledWith('id', 'req-1')
    expect(update.is).toHaveBeenCalledWith('requested_by_user_id', null)
    expect(update.eq).toHaveBeenCalledWith('care_country', 'AR')
    expect(update.eq).toHaveBeenCalledWith('status', 'searching')
    expect(update.eq).not.toHaveBeenCalledWith('patient_id', null)
  })

  it('devuelve 404 si falta el id', async () => {
    const response = await GET(makeContext({ id: '' }))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('devuelve 404 si la solicitud no existe en la base de datos', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(null, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(makeContext())
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.message).toBe('request_not_found')
  })

  it('devuelve 401 si no hay sesión ni token de acceso (previene fuga de PHI)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(makeContext({ session: null }))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
    expect(body.error.message).toBe('Requiere sesión o token de acceso válido')
  })

  it('devuelve 401 si el guest token pertenece a otra solicitud (callId mismatch)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      return buildTableChain(null, null)
    })

    const wrongToken = await signGuestToken(
      { callId: 'other-request-id', roomId: 'other-room', guestName: 'Intruder' },
      TEST_SECRET,
    )

    const response = await GET(
      makeContext({
        url: `http://localhost/api/pharmacy/dispatch/req-1?token=${wrongToken}`,
      }),
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('devuelve 200 y datos de la consulta con guest token válido por query param (?token=)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
      }
      if (table === 'profiles') {
        return buildTableChain(PROFILE_ROW, null)
      }
      return buildTableChain(null, null)
    })

    const validToken = await signGuestToken(
      { callId: 'req-1', roomId: 'cf-room-1', guestName: 'Carlos Test' },
      TEST_SECRET,
    )

    const response = await GET(
      makeContext({
        url: `http://localhost/api/pharmacy/dispatch/req-1?token=${validToken}`,
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.request.id).toBe('req-1')
    expect(body.data.doctor.full_name).toBe('Martín Gómez')
    expect(body.data.doctor.license_number).toBe('MN12345')
  })

  it('devuelve 200 con guest token en header Authorization: Bearer', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
      }
      if (table === 'profiles') {
        return buildTableChain(PROFILE_ROW, null)
      }
      return buildTableChain(null, null)
    })

    const validToken = await signGuestToken(
      { callId: 'req-1', roomId: 'cf-room-1', guestName: 'Carlos Test' },
      TEST_SECRET,
    )

    const response = await GET(
      makeContext({
        headers: { authorization: `Bearer ${validToken}` },
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.request.id).toBe('req-1')
  })

  it('devuelve 200 si el usuario autenticado es el paciente dueño (requested_by_user_id)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
      }
      if (table === 'profiles') {
        return buildTableChain(PROFILE_ROW, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(
      makeContext({
        session: { user: { id: 'patient-user-1' } },
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.request.patient_dni).toBe('12345678')
  })

  it('devuelve 200 si el usuario autenticado es el médico asignado', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
      }
      if (table === 'profiles') {
        return buildTableChain(PROFILE_ROW, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(
      makeContext({
        session: { user: { id: 'doctor-user-1' } },
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.request.id).toBe('req-1')
  })

  it('devuelve 200 solo al médico con oferta pendiente y vigente para esta solicitud', async () => {
    const unassignedReq = { ...REQUEST_RECORD, assigned_doctor_id: null }
    const otherDoctor = { id: 'other-doc-row', user_id: 'other-doc-user', active: true, license_type: 'MN', care_country: 'AR', uf_brazil: null }

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(unassignedReq, null)
      }
      if (table === 'doctors') {
        return buildTableChain(otherDoctor, null)
      }
      if (table === 'dispatch_offers') {
        return buildTableChain({ id: 'offer-exact-to-doctor-1' }, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(
      makeContext({
        session: { user: { id: 'other-doc-user' } },
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  it('no permite leer datos clínicos solo por estar de guardia en el mismo país', async () => {
    const unassignedReq = { ...REQUEST_RECORD, assigned_doctor_id: null }
    const doctorOnDuty = { ...DOCTOR_ROW, id: 'doctor-on-duty', user_id: 'doctor-other-user' }
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') return buildTableChain(unassignedReq)
      if (table === 'doctors') return buildTableChain(doctorOnDuty)
      if (table === 'dispatch_offers') return buildTableChain(null)
      return buildTableChain(null)
    })
    const response = await GET(makeContext({ session: { user: { id: 'doctor-other-user' } } }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).toHaveBeenCalledWith('dispatch_offers')
  })

  it('rechaza a un médico argentino pendiente de aprobación aunque su cuenta figure activa', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: false, error: null })
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') return buildTableChain(REQUEST_RECORD)
      if (table === 'doctors') return buildTableChain(DOCTOR_ROW)
      return buildTableChain(null)
    })

    const response = await GET(makeContext({ session: { user: { id: 'doctor-user-1' } } }))
    expect(response.status).toBe(401)
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'admin_is_dispatch_doctor_approved', { p_doctor_id: DOCTOR_ROW.id }
    )
  })

  it('devuelve 401 si un usuario autenticado ajeno (no dueño, no asignado, no guardia) intenta acceder', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(null, null) // No es médico
      }
      return buildTableChain(null, null)
    })

    const response = await GET(
      makeContext({
        session: { user: { id: 'unrelated-stranger-user' } },
      }),
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })
  it('rechaza un token firmado para esta solicitud pero para otra sala', async () => {
    supabaseMock.from.mockImplementation((table: string) =>
      buildTableChain(table === 'pharmacy_dispatch_requests' ? REQUEST_RECORD : null),
    )
    const otherRoomToken = await signGuestToken(
      { callId: 'req-1', roomId: 'unrelated-room', guestName: 'Synthetic guest' }, TEST_SECRET,
    )
    const response = await GET(makeContext({ headers: { authorization: `Bearer ${otherRoomToken}` } }))
    expect(response.status).toBe(401)
  })

  it('niega lectura de solicitud AR al médico BR asignado incluso con guardia activa', async () => {
    const brDoctor = { ...DOCTOR_ROW, license_type: 'CRM', care_country: 'BR', uf_brazil: 'RS' }
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') return buildTableChain(REQUEST_RECORD)
      if (table === 'doctors') return buildTableChain(brDoctor)
      if (table === 'doctor_duty_status') return buildTableChain({ is_on_duty: true })
      return buildTableChain(null)
    })
    const response = await GET(makeContext({ session: { user: { id: 'doctor-user-1' } } }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).toHaveBeenCalledWith('doctors')
  })

  it('niega lectura AR a médico en guardia BR no asignado', async () => {
    const unassigned = { ...REQUEST_RECORD, assigned_doctor_id: null }
    const brDoctor = { id: 'doctor-br-id', active: true, care_country: 'BR', license_type: 'CRM', uf_brazil: 'RS' }
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') return buildTableChain(unassigned)
      if (table === 'doctors') return buildTableChain(brDoctor)
      if (table === 'doctor_duty_status') return buildTableChain({ is_on_duty: true })
      return buildTableChain(null)
    })
    const response = await GET(makeContext({ session: { user: { id: 'doctor-br-user' } } }))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('doctor_duty_status')
  })

  it('niega lectura al médico sin matrícula/country verificables', async () => {
    const unverifiedDoctor = { ...DOCTOR_ROW, license_type: 'unknown', care_country: null }
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_dispatch_requests') return buildTableChain(REQUEST_RECORD)
      if (table === 'doctors') return buildTableChain(unverifiedDoctor)
      return buildTableChain(null)
    })
    const response = await GET(makeContext({ session: { user: { id: 'doctor-user-1' } } }))
    expect(response.status).toBe(401)
  })

})
