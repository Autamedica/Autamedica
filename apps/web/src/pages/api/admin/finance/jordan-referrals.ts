import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { isAuthed, withAuthRole } from '@/lib/api-auth'
import { internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { GENERAL_PHARMACY_BR_PRICE_CENTS, JORDAN_REFERRAL_CENTS, JORDAN_DOCTOR_FEE_CENTS, JORDAN_PRE_COST_MARGIN_CENTS } from '@/lib/pharmacy/payments/referral-finance'

/**
 * ADMIN only: aggregated commercial counts, zero individual patients,
 * CPF, DNI, phone, medical records, clinical notes, or guest tokens.
 * This is provider-recorded eligibility, NOT bank-cleared payout.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['admin','platform_admin'], locals)
  if (!isAuthed(auth)) return auth
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: jordan, error: partnerError } = await admin
      .from('commercial_referral_partners').select('id,code,display_name')
      .eq('code','JORDAN').maybeSingle()
    if (partnerError || !jordan) throw partnerError ?? new Error('jordan_partner_not_found')

    const [
      { count: requests, error: reqErr },
      { count: eligible, error: paidErr },
      { count: reversed, error: refundErr },
    ] = await Promise.all([
      admin.from('pharmacy_dispatch_requests')
        .select('id',{ head: true, count: 'exact' })
        .eq('referral_partner_id',jordan.id),
      admin.from('commercial_referral_commissions')
        .select('id',{ head: true, count: 'exact' })
        .eq('referral_partner_id',jordan.id).eq('status','eligible'),
      admin.from('commercial_referral_commissions')
        .select('id',{ head: true, count: 'exact' })
        .eq('referral_partner_id',jordan.id).eq('status','reversed'),
    ])
    if (reqErr || paidErr || refundErr) throw reqErr ?? paidErr ?? refundErr

    const response = jsonOk({
      partner: 'JORDAN',
      partnerName: jordan.display_name,
      currency: 'BRL',
      referredRequests: requests ?? 0,
      providerVerifiedEligiblePayments: eligible ?? 0,
      reversals: reversed ?? 0,
      eligibleAmountCents: (eligible ?? 0) * JORDAN_REFERRAL_CENTS,
      actualTransferCents: null,
      transfersAutomated: false,
      providerConfirmedIsNotBankSettled: true,
      indicativeUnitEconomics: {
        consultationPriceCents: GENERAL_PHARMACY_BR_PRICE_CENTS,
        jordanCommissionCents: JORDAN_REFERRAL_CENTS,
        doctorFeeCents: JORDAN_DOCTOR_FEE_CENTS,
        marginBeforeProcessingTaxSupportCents: JORDAN_PRE_COST_MARGIN_CENTS,
        doctorFeeIsNotAccruedPayout: true,
      },
      reportGeneratedAt: new Date().toISOString(),
    })
    response.headers.set('Cache-Control','private, no-store')
    return response
  } catch (error) {
    logger.error('[admin/jordan-referrals] Report unavailable', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return internalError('jordan_referral_report_unavailable')
  }
}
