import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  payment: null as null | Record<string, unknown>,
  requestStatus: 'pending_payment' as string,
}))

vi.mock('@/lib/api-auth', () => ({
  ADMIN_ROLES: ['admin', 'platform_admin', 'organization_admin'],
  withAuthRole: mocks.auth,
  isAuthed: (value: unknown) => !(value instanceof Response),
}))
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: mocks.admin,
}))

import { POST } from './pharmacy-payments'

const paymentId = 'b5efb198-70ee-48f2-a8c1-1499e5dded06'
const actorId = 'b617d594-7a4e-4090-ae35-20451787ca23'

function makeDb() {
  return {
    from(table: string) {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: table === 'pharmacy_dispatch_payments'
            ? mocks.payment
            : { status: mocks.requestStatus },
          error: null,
        })),
      }
      return query
    },
    rpc: mocks.rpc,
  }
}

function makeRequest() {
  return {
    request: new Request('https://autamedica.test/api/admin/finance/pharmacy-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_approve',
        payment_id: paymentId,
        reason: 'Excepción administrativa autorizada por el fundador para liberar el despacho.',
        evidence_reference: `MANUAL_OVERRIDE_${paymentId}`,
      }),
    }),
    locals: { runtime: { env: {} } },
  } as Parameters<typeof POST>[0]
}

describe('POST /api/admin/finance/pharmacy-payments manual_approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: actorId } })
    mocks.admin.mockReturnValue(makeDb())
    mocks.payment = {
      id: paymentId,
      dispatch_request_id: '2a271ea7-7813-4116-9f6f-f21234e66524',
      provider: 'mercadopago',
      status: 'pending',
      provider_payment_id: null,
      metadata: { payment_mode: 'mercadopago', manual_approval_pending: false },
    }
    mocks.requestStatus = 'pending_payment'
    mocks.rpc.mockResolvedValue({
      data: {
        success: true,
        payment_approved: true,
        status: 'approved',
        dispatch_result: { success: true },
      },
      error: null,
    })
  })

  it.each([null, '987654321'])('approves pending Mercado Pago through the RPC with provider_payment_id=%s', async (providerPaymentId) => {
    mocks.payment = { ...mocks.payment, provider_payment_id: providerPaymentId }
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_manual_approve_pharmacy_payment', {
      p_payment_id: paymentId,
      p_actor_id: actorId,
      p_reason: 'Excepción administrativa autorizada por el fundador para liberar el despacho.',
      p_evidence_reference: `MANUAL_OVERRIDE_${paymentId}`,
    })
  })

  it('rejects a non-admin before invoking the approval RPC', async () => {
    mocks.auth.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    const response = await POST(makeRequest())
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects terminal dispatch requests before invoking the approval RPC', async () => {
    mocks.requestStatus = 'expired'
    const response = await POST(makeRequest())
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
