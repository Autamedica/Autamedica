import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './context'

const mocks = vi.hoisted(() => ({
  room: {
    patientId: '00000000-0000-4000-8000-000000000001',
    doctorId: 'doctor-other',
    appointmentId: null,
  },
  getContext: vi.fn(),
  resolveParticipants: vi.fn(),
}))

vi.mock('@autamedica/shared', () => ({
  logger: { error: vi.fn() },
}))

vi.mock('@/lib/api-auth', () => ({
  DOCTOR_ROLES: ['doctor'],
  withAuthRole: vi.fn(async () => ({ user: { id: 'user-self' } })),
  isAuthed: vi.fn(() => true),
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => ({ kind: 'test-admin' })),
}))

vi.mock('@/lib/doctors/lib/resolve-room', () => ({
  resolveRoomParticipants: mocks.resolveParticipants,
  isDoctorAssignedToRoom: (participants: { doctorId: string | null } | null, doctorId: string, doctorUserId?: string) =>
    Boolean(participants && (participants.doctorId === doctorId || participants.doctorId === doctorUserId)),
}))

vi.mock('@/lib/doctors/services/consultation-context.service', () => ({
  consultationContextService: {
    verifyDoctorAccess: vi.fn(async () => 'doctor-self'),
    getContext: mocks.getContext,
  },
}))

vi.mock('@/lib/api-helpers', () => ({
  jsonOk: (value: unknown) => new Response(JSON.stringify(value), { status: 200 }),
  badRequest: () => new Response(null, { status: 400 }),
  forbidden: () => new Response(null, { status: 403 }),
  internalError: () => new Response(null, { status: 500 }),
}))

function context() {
  return {
    request: new Request('https://www.autamedica.com/api/doctors/consultations/room-demo/context'),
    params: { roomId: 'room-demo' },
    locals: { runtime: { env: {} } },
  } as unknown as Parameters<typeof GET>[0]
}

describe('doctor consultation context room authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveParticipants.mockImplementation(async () => ({ ...mocks.room }))
    mocks.getContext.mockResolvedValue({ patient: { name: 'TEST ONLY' } })
  })

  it('denies a doctor assigned to another room before reading any patient context', async () => {
    const response = await GET(context())
    expect(response.status).toBe(403)
    expect(mocks.getContext).not.toHaveBeenCalled()
  })

  it('recognizes rooms that store the assigned doctor auth ID', async () => {
    mocks.resolveParticipants.mockResolvedValueOnce({ ...mocks.room, doctorId: 'user-self' })
    const response = await GET(context())
    expect(response.status).toBe(200)
    expect(mocks.getContext).toHaveBeenCalledOnce()
  })

  it('permits only the doctor assigned to this room and reuses checked participants', async () => {
    mocks.resolveParticipants.mockResolvedValueOnce({ ...mocks.room, doctorId: 'doctor-self' })
    const response = await GET(context())
    expect(response.status).toBe(200)
    expect(mocks.getContext).toHaveBeenCalledOnce()
    expect(mocks.getContext.mock.calls[0]?.[2]).toEqual({ ...mocks.room, doctorId: 'doctor-self' })
  })
})
