import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './cancel'
import { signGuestToken } from '@/lib/calls/lib/guest-token'

vi.mock('@autamedica/shared', () => {
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logger.child.mockReturnValue(logger)
  return { logger }
})

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: vi.fn(() => supabaseMock) }))

const SECRET = 'synthetic-guest-secret-longer-than-32-characters'
vi.mock('@/lib/runtime-env', () => ({ resolveGuestSecret: vi.fn(() => SECRET) }))

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const row = {
  id: ID,
  cloudflare_room_id: 'cf-room-synthetic',
  requested_by_user_id: 'patient-user-1',
  status: 'searching',
}

function chain(data: unknown, error: unknown = null) {
  const obj = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn(),
  }
  obj.select.mockReturnValue(obj)
  obj.eq.mockReturnValue(obj)
  obj.update.mockReturnValue(obj)
  return obj
}

function context(body: unknown, ownerId?: string): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/pharmacy/on-demand/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { session: ownerId ? { user: { id: ownerId } } : null, runtime: { env: {} } },
  } as unknown as Parameters<typeof POST>[0]
}

describe('Gen-2 clinical pharmacy cancellation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rechaza identificadores no UUID sin consultar datos clínicos', async () => {
    expect((await POST(context({ requestId: 'guessable-id' }))).status).toBe(400)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('niega cancelación anónima con solo un UUID', async () => {
    const original = chain(row)
    supabaseMock.from.mockReturnValue(original)
    const response = await POST(context({ requestId: ID }))
    expect(response.status).toBe(401)
    expect(original.update).not.toHaveBeenCalled()
  })

  it('niega token firmado para otro paciente', async () => {
    const token = await signGuestToken(
      { callId: OTHER_ID, roomId: row.cloudflare_room_id, guestName: 'Synthetic guest' }, SECRET,
    )
    const original = chain(row)
    supabaseMock.from.mockReturnValue(original)
    const response = await POST(context({ requestId: ID, accessToken: token }))
    expect(response.status).toBe(401)
    expect(original.update).not.toHaveBeenCalled()
  })

  it('niega token de la consulta pero para otra sala', async () => {
    const token = await signGuestToken(
      { callId: ID, roomId: 'other-room', guestName: 'Synthetic guest' }, SECRET,
    )
    const original = chain(row)
    supabaseMock.from.mockReturnValue(original)
    const response = await POST(context({ requestId: ID, accessToken: token }))
    expect(response.status).toBe(401)
    expect(original.update).not.toHaveBeenCalled()
  })

  it('autoriza cancelación del invitado ligado a sala y solicitud correctas', async () => {
    const token = await signGuestToken(
      { callId: ID, roomId: row.cloudflare_room_id, guestName: 'Synthetic guest' }, SECRET,
    )
    const original = chain(row)
    const changed = chain({ id: ID })
    supabaseMock.from.mockReturnValueOnce(original).mockReturnValueOnce(changed)
    const response = await POST(context({ requestId: ID, accessToken: token }))
    expect(response.status).toBe(200)
    expect((await response.json()).data.cancelled).toBe(true)
    expect(changed.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(changed.eq).toHaveBeenCalledWith('status', 'searching')
    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, 'pharmacy_dispatch_requests')
    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'pharmacy_dispatch_requests')
  })

  it('autoriza solo a paciente autenticado dueño de la consulta', async () => {
    const original = chain(row)
    const changed = chain({ id: ID })
    supabaseMock.from.mockReturnValueOnce(original).mockReturnValueOnce(changed)
    const response = await POST(context({ requestId: ID }, 'patient-user-1'))
    expect((await response.json()).data.cancelled).toBe(true)
  })

  it('no permite a otro paciente autenticado cancelar la solicitud', async () => {
    const original = chain(row)
    supabaseMock.from.mockReturnValue(original)
    const response = await POST(context({ requestId: ID }, 'unrelated-user'))
    expect(response.status).toBe(401)
    expect(original.update).not.toHaveBeenCalled()
  })

  it('no interrumpe una llamada ya iniciada, ni siquiera con token válido', async () => {
    const token = await signGuestToken(
      { callId: ID, roomId: row.cloudflare_room_id, guestName: 'Synthetic guest' }, SECRET,
    )
    const original = chain({ ...row, status: 'in_call' })
    supabaseMock.from.mockReturnValue(original)
    const response = await POST(context({ requestId: ID, accessToken: token }))
    expect((await response.json()).data.cancelled).toBe(false)
    expect(original.update).not.toHaveBeenCalled()
  })

  it('oculta al cliente el contenido confidencial de errores SQL', async () => {
    const original = chain(row)
    const changed = chain(null, { code: '23514', message: 'SECRET CLINICAL DETAILS' })
    supabaseMock.from.mockReturnValueOnce(original).mockReturnValueOnce(changed)
    const response = await POST(context({ requestId: ID }, 'patient-user-1'))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('SECRET CLINICAL DETAILS')
  })
})
