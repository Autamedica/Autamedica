import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizeWebCloudflareMedia } from './web-cloudflare-media-authorization'
import { checkJordanMediaAccess } from '@/lib/pharmacy/payments/jordan-media-access'

vi.mock('@/lib/pharmacy/payments/jordan-media-access', () => ({
  checkJordanMediaAccess: vi.fn(),
}))

type Row = Record<string, unknown> | null

function db(rows: {
  pharmacy_dispatch_requests?: Row
  calls?: Row
  doctors?: Row
  patients?: Row
}, fail?: string) {
  const from = vi.fn((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: rows[table as keyof typeof rows] ?? null,
        error: table === fail ? new Error('db_unavailable') : null,
      }),
    }
    return chain
  })
  return { admin: { from } as unknown as SupabaseClient, from }
}
const dispatch = {
  id: 'request1', status: 'matched', assigned_doctor_id: 'doctor1',
  patient_id: 'patient1', requested_by_user_id: 'user-patient',
}
const call = { status: 'connected', doctor_id: 'doctor1', patient_id: 'patient1' }

describe('Authenticated web SFU media authorization', () => {
  beforeEach(() => {
    vi.mocked(checkJordanMediaAccess).mockReset()
    vi.mocked(checkJordanMediaAccess).mockResolvedValue('allowed')
  })

  it('allows only the assigned doctor and checks Jordan payment', async () => {
    const { admin } = db({ pharmacy_dispatch_requests: dispatch, doctors: { user_id: 'user-doctor' } })
    expect(await authorizeWebCloudflareMedia(admin, 'br-room', 'user-doctor', 'doctor')).toBe('allowed')
    expect(checkJordanMediaAccess).toHaveBeenCalledWith(admin, 'br-room')
    expect(await authorizeWebCloudflareMedia(admin, 'br-room', 'attacker', 'doctor')).toBe('forbidden')
  })

  it('rejects unpaid and refunded Jordan for authorized participants', async () => {
    const { admin } = db({ pharmacy_dispatch_requests: dispatch })
    vi.mocked(checkJordanMediaAccess).mockResolvedValue('payment_required')
    expect(await authorizeWebCloudflareMedia(admin, 'jordan-room', 'user-patient', 'patient')).toBe('payment_required')
  })

  it('rejects the other patient even with a known room ID', async () => {
    const { admin } = db({ pharmacy_dispatch_requests: dispatch, patients: { user_id: 'real-owner' } })
    expect(await authorizeWebCloudflareMedia(admin, 'room', 'other-user', 'patient')).toBe('forbidden')
    expect(checkJordanMediaAccess).not.toHaveBeenCalled()
  })

  it('allows existing non-dispatch doctor and patient rooms without Jordan lookup', async () => {
    const { admin } = db({ calls: call, doctors: { user_id: 'user-doctor' }, patients: { user_id: 'user-patient' } })
    expect(await authorizeWebCloudflareMedia(admin, 'ordinary', 'user-doctor', 'doctor')).toBe('allowed')
    expect(await authorizeWebCloudflareMedia(admin, 'ordinary', 'user-patient', 'patient')).toBe('allowed')
    expect(checkJordanMediaAccess).not.toHaveBeenCalled()
  })

  it('rejects unknown rooms, empty IDs and terminal dispatches', async () => {
    expect(await authorizeWebCloudflareMedia(db({}).admin, '', 'user', 'patient')).toBe('forbidden')
    expect(await authorizeWebCloudflareMedia(db({}).admin, 'unknown', 'user', 'patient')).toBe('forbidden')
    expect(await authorizeWebCloudflareMedia(db({ pharmacy_dispatch_requests: { ...dispatch, status: 'completed' } }).admin, 'closed', 'user-patient', 'patient')).toBe('forbidden')
  })

  it('fails closed on database failure', async () => {
    await expect(authorizeWebCloudflareMedia(db({}, 'pharmacy_dispatch_requests').admin, 'room', 'user', 'doctor')).rejects.toThrow()
    await expect(authorizeWebCloudflareMedia(db({ calls: call }, 'doctors').admin, 'ordinary', 'user', 'doctor')).rejects.toThrow()
  })
})
