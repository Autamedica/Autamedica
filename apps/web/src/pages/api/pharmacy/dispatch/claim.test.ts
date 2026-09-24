import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './claim'

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() } as {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

const DOCTOR = { id: 'doctor-1' }
const CLAIM_OK = {
  success: true,
  request_id: 'req-1',
  cloudflare_room_id: 'cf-room-general-1959-abc',
  patient_dni: '4027041959',
  patient_phone: '5491155995522',
  tier_requested: 'general',
  accessToken: 'eyJ-guest-token',
}
const CLAIM_CONFLICT = {
  success: false,
  code: 'ALREADY_CLAIMED',
  message: 'La consulta ya no está disponible',
}

type DoctorChain = {
  then: (resolve: (value: unknown) => void) => void
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function buildDoctorChain(data: unknown, error: unknown): DoctorChain {
  const chain: DoctorChain = {
    then(resolve: (value: unknown) => void) {
      resolve({ data, error })
    },
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.maybeSingle.mockReturnValue(chain)
  return chain
}

function makeContext(options?: {
  session?: { user: { id: string } } | null
  body?: unknown
}): Parameters<typeof POST>[0] {
  const request = new Request('http://localhost/api/pharmacy/dispatch/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body:
      options?.body === undefined
        ? JSON.stringify({ requestId: 'req-1' })
        : JSON.stringify(options.body),
  })
  const session =
    options && Object.prototype.hasOwnProperty.call(options, 'session')
      ? options.session
      : { user: { id: 'u-1' } }
  return {
    request,
    locals: {
      session,
      runtime: { env: {} },
    },
  } as unknown as Parameters<typeof POST>[0]
}

describe('API: /api/pharmacy/dispatch/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock.from.mockImplementation(() => buildDoctorChain(DOCTOR, null))
    supabaseMock.rpc.mockResolvedValue({ data: CLAIM_OK, error: null })
  })

  it('devuelve 401 sin body de error si no hay sesión', async () => {
    const response = await POST(makeContext({ session: null }))

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('UNAUTHENTICATED')
    expect(body.error.message).toBe('Sesión requerida')
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('devuelve 400 si el body no trae requestId', async () => {
    const response = await POST(makeContext({ body: {} }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.message).toBe('ID de solicitud requerido')
  })

  it('devuelve 403 si el usuario no está registrado como médico', async () => {
    supabaseMock.from.mockImplementation(() => buildDoctorChain(null, null))

    const response = await POST(makeContext())

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toBe('Usuario no autorizado como médico')
  })

  it('devuelve 500 si el RPC de claim falla', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: new Error('exploto el RPC') })

    const response = await POST(makeContext())

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INTERNAL')
    expect(body.error.message).toBe('exploto el RPC')
  })

  it('devuelve 409 si la solicitud ya fue tomada', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: CLAIM_CONFLICT, error: null })

    const response = await POST(makeContext())

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.message).toBe('La consulta ya no está disponible')
    expect(body.error.details).toEqual(CLAIM_CONFLICT)
  })

  it('reclama el dispatch de forma atómica y devuelve 200 con la sala Cloudflare Calls y el accessToken', async () => {
    const response = await POST(makeContext())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.cloudflare_room_id).toBe('cf-room-general-1959-abc')
    expect(body.data.accessToken).toBe('eyJ-guest-token')
    expect(body.data.request_id).toBe('req-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('claim_pharmacy_request_tier', {
      p_request_id: 'req-1',
      p_doctor_id: 'doctor-1',
    })
  })
})