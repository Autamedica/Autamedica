import { describe, expect, it, vi } from 'vitest'
vi.mock('../supabase', () => ({ createAstroAdminClient: vi.fn(), createAstroServerClientFromRequest: vi.fn() }))
import { ADMIN_ROLES } from '../api-auth'
import {
  isManualPilotApprovalEligible,
  isSpecificPaymentSwitchReason,
  resolveManualApprovalResult,
} from './manual-payment-governance'

describe('pharmacy manual payment governance', () => {
  it('never exposes manual approval for MercadoPago', () => {
    expect(isManualPilotApprovalEligible({
      provider: 'mercadopago',
      payment_mode: 'manual_pilot',
      manual_approval_pending: true,
      status: 'pending',
      request_status: 'pending_payment',
    })).toBe(false)
  })

  it('allows only pending manual_pilot payments attached to an eligible request', () => {
    const payment = {
      provider: 'manual',
      payment_mode: 'manual_pilot',
      manual_approval_pending: true,
      status: 'pending_payment',
      request_status: 'pending_payment',
    }
    expect(isManualPilotApprovalEligible(payment)).toBe(true)
    expect(isManualPilotApprovalEligible({ ...payment, request_status: 'expired' })).toBe(false)
    expect(isManualPilotApprovalEligible({ ...payment, manual_approval_pending: false })).toBe(false)
    expect(isManualPilotApprovalEligible({ ...payment, payment_mode: 'mercadopago' })).toBe(false)
  })

  it('returns approved_pending_dispatch_resolution when money is approved but dispatch is not', () => {
    expect(resolveManualApprovalResult({
      success: false,
      payment_approved: true,
      dispatch_result: { success: false, code: 'REQUEST_NOT_SEARCHING' },
    })).toMatchObject({
      success: true,
      payment_approved: true,
      status: 'approved_pending_dispatch_resolution',
    })
  })

  it('authorizes platform_admin through the shared admin role matrix', () => {
    expect(ADMIN_ROLES).toContain('platform_admin')
  })

  it('rejects generic switch reasons and accepts a concrete cause', () => {
    expect(isSpecificPaymentSwitchReason('Cambio manual desde Admin')).toBe(false)
    expect(isSpecificPaymentSwitchReason('test')).toBe(false)
    expect(isSpecificPaymentSwitchReason('Desactivación por conciliación fallida')).toBe(true)
  })
})
