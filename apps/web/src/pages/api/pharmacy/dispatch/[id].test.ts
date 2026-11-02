import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './[id]'
import { signGuestToken } from '@/lib/calls/lib/guest-token'

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

const REQUEST_RECORD = {
  id: 'req-1',
  care_country: 'AR',
  requested_by_user_id: 'patient-user-1',
  assigned_doctor_id: 'doc-row-1',
  status: 'searching',
  cloudflare_room_id: 'cf-room-1',
  patient_dni: '12345678',
  patient_phone: '+5491122334455',
  patient_name: 'Carlos Test',
}

const DOCTOR_ROW = {
  id: 'doc-row-1',
  care_country: 'AR',
  active: true,
  user_id: 'doctor-user-1',
  license_number: 'MN12345',
  specialty: 'Clínica Médica',
}

const PROFILE_ROW = {
  first_name: 'Martín',
  last_name: 'Gómez',
}

type TableChain = {
  then: (resolve: (value: unknown) => void) => void
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
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
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.maybeSingle.mockReturnValue(chain)
  chain.single.mockReturnValue(chain)
  return chain
}

function makeContext(options?: {
  id?: string
  url?: string
  headers?: Record<string, string>
  session?: { user: { id: string } } | null
}): Parameters<typeof GET>[0] {
  const reqUrl = options?.url || 'http://localhost/api/pharmacy/dispatch/req-1'
  const request = new Request(reqUrl, {
    method: 'GET',
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
  })

  it('devuelve 404 si falta el id', async () => {
    const response = await GET(makeContext({ id: '' }))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('devuelve 404 si la solicitud no existe en la base de datos', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
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
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(REQUEST_RECORD, null)
      }
      if (table === 'doctors') {
        return buildTableChain(DOCTOR_ROW, null)
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

  it('bloquea un médico de guardia que no está asignado a la solicitud', async () => {
    const unassignedReq = { ...REQUEST_RECORD, assigned_doctor_id: null }
    const otherDoctor = { id: 'other-doc-row', user_id: 'other-doc-user' }

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
      if (table === 'pharmacy_dispatch_requests') {
        return buildTableChain(unassignedReq, null)
      }
      if (table === 'doctors') {
        return buildTableChain(otherDoctor, null)
      }
      if (table === 'doctor_duty_status') {
        return buildTableChain({ is_on_duty: true }, null)
      }
      return buildTableChain(null, null)
    })

    const response = await GET(
      makeContext({
        session: { user: { id: 'other-doc-user' } },
      }),
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.success).toBe(false)
  })

  it('devuelve 401 si un usuario autenticado ajeno (no dueño, no asignado, no guardia) intenta acceder', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'patients') return buildTableChain({ id: 'patient-row' })
      if (table === 'profiles') return buildTableChain(PROFILE_ROW)
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
})

