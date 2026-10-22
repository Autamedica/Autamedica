import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './queue'

const { admin, user } = vi.hoisted(() => ({
  admin: { from: vi.fn() },
  user: { id: 'doctor-auth-synthetic' },
}))

vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/api-auth', () => ({
  DOCTOR_ROLES: ['doctor', 'admin'],
  isAuthed: () => true,
  withAuthRole: vi.fn(async () => ({ user })),
}))
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => admin),
}))

function chainForRow(row: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    order: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.gte.mockReturnValue(chain)
  chain.lte.mockReturnValue(chain)
  return chain
}

function context(): Parameters<typeof GET>[0] {
  return {
    request: new Request('http://localhost/api/doctors/on-duty/queue'),
    locals: { runtime: { env: {} } },
  } as unknown as Parameters<typeof GET>[0]
}

describe('pharmacy queue privacy for medical accounts', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rejects a new, inactive provisional doctor without querying patient records', async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === 'doctors') return chainForRow({ id: 'doc1', active: false })
      throw new Error('Unexpected table access: ' + table)
    })
    const response = await GET(context())
    expect(response.status).toBe(403)
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('rejects an active doctor with a provisional license before reading patient requests', async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === 'doctors') return chainForRow({
        id: 'doc-provisional', active: true, license_number: 'PENDING-001',
      })
      throw new Error('Patient data accessed by provisional doctor')
    })
    const response = await GET(context())
    expect(response.status).toBe(403)
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('rejects doctors without an active duty heartbeat', async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === 'doctors') return chainForRow({ id: 'doc1', active: true, license_number: 'CRM-SYNTHETIC' })
      if (table === 'doctor_duty_status') return chainForRow(null)
      throw new Error('Patient requests queried despite inactive duty')
    })
    const response = await GET(context())
    expect(response.status).toBe(403)
    expect(admin.from).toHaveBeenCalledTimes(2)
  })

  it('allows an active doctor with a recent duty heartbeat to access searching triage', async () => {
    const dutyChain = chainForRow({ doctor_id: 'doc1' })
    admin.from.mockImplementation((table: string) => {
      if (table === 'doctors') return chainForRow({ id: 'doc1', active: true, license_number: 'CRM-SYNTHETIC' })
      if (table === 'doctor_duty_status') return dutyChain
      if (table === 'pharmacy_dispatch_requests') return chainForRow([])
      throw new Error('Unexpected table: ' + table)
    })
    const response = await GET(context())
    expect(response.status).toBe(200)
    expect(admin.from).toHaveBeenCalledWith('pharmacy_dispatch_requests')
    expect(dutyChain.gte).toHaveBeenCalledWith('last_heartbeat_at', expect.any(String))
    expect(dutyChain.lte).toHaveBeenCalledWith('last_heartbeat_at', expect.any(String))
  })
})
