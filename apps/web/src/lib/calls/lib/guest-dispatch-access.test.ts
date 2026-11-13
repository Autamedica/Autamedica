import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyGuestDispatchAccess } from './guest-dispatch-access'

const room = 'cf-room-br-jordan-synthetic'
const dispatchId = '11111111-1111-4111-8111-111111111111'
const callId = '22222222-2222-4222-8222-222222222222'

function buildAdmin(
  dispatch: Record<string, unknown> | null,
  payment: Record<string, unknown> | null = null,
  failTable?: string,
) {
  const from = vi.fn((table: string) => {
    const row = table === 'pharmacy_dispatch_requests' ? dispatch : payment
    const error = table === failTable ? { message: 'simulated database error' } : null
    const q = {
      select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: row, error })),
    }
    q.select.mockReturnValue(q)
    q.eq.mockReturnValue(q)
    return q
  })
  return { admin: { from } as unknown as SupabaseClient, from }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: dispatchId,
    call_id: callId,
    cloudflare_room_id: room,
    care_country: 'BR',
    referral_partner_id: '33333333-3333-4333-8333-333333333333',
    assigned_doctor_id: '44444444-4444-4444-8444-444444444444',
    status: 'in_call',
    ...overrides,
  }
}

describe('signed guest dispatch video authorization', () => {
  it('preserves non-dispatch legacy calls', async () => {
    const { admin, from } = buildAdmin(null)
    expect(await verifyGuestDispatchAccess(admin, { callId, roomId: room }))
      .toEqual({ kind: 'ok', dispatchRequestId: null })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('rejects a signed guest token for a different dispatch', async () => {
    const { admin, from } = buildAdmin(request())
    expect(await verifyGuestDispatchAccess(admin, { callId: 'unrelated-id', roomId: room }))
      .toEqual({ kind: 'forbidden' })
    expect(from).not.toHaveBeenCalledWith('pharmacy_dispatch_payments')
  })

  it('rejects a QR intake before an actual doctor begins the call', async () => {
    const { admin, from } = buildAdmin(request({ status: 'matched' }))
    expect(await verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .toEqual({ kind: 'conflict', message: 'dispatch_not_ready' })
    expect(from).not.toHaveBeenCalledWith('pharmacy_dispatch_payments')
  })

  it('rejects an unpaid Brazilian partner session even if the doctor is already connected', async () => {
    const { admin, from } = buildAdmin(request())
    expect(await verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .toEqual({ kind: 'conflict', message: 'pharmacy_payment_required' })
    expect(from).toHaveBeenCalledWith('pharmacy_dispatch_payments')
  })

  it('accepts only independently approved BRL partner payments', async () => {
    const { admin } = buildAdmin(request(), { id: 'payment-approved-synthetic' })
    expect(await verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .toEqual({ kind: 'ok', dispatchRequestId: dispatchId })
    expect(await verifyGuestDispatchAccess(admin, { callId, roomId: room }))
      .toEqual({ kind: 'ok', dispatchRequestId: dispatchId })
  })

  it('does not impose Brazilian QR payment rules on Argentine dispatch', async () => {
    const { admin, from } = buildAdmin(request({ care_country: 'AR' }))
    expect(await verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .toEqual({ kind: 'ok', dispatchRequestId: dispatchId })
    expect(from).not.toHaveBeenCalledWith('pharmacy_dispatch_payments')
  })

  it('fails closed if the clinical lookup fails', async () => {
    const { admin } = buildAdmin(null, null, 'pharmacy_dispatch_requests')
    await expect(verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .rejects.toThrow('dispatch_access_check_unavailable')
  })

  it('fails closed if the PSP evidence table is unavailable', async () => {
    const { admin } = buildAdmin(request(), null, 'pharmacy_dispatch_payments')
    await expect(verifyGuestDispatchAccess(admin, { callId: dispatchId, roomId: room }))
      .rejects.toThrow('dispatch_payment_check_unavailable')
  })
})
