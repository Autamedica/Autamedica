import type { SupabaseClient } from '@supabase/supabase-js'
import { GENERAL_PHARMACY_BR_PRICE_CENTS } from './referral-finance'

/**
 * Server-side media gate for the Brazilian Jordan channel.
 *
 * A QR/referral parameter, checkout return URL or a signed guest-room token
 * is never payment evidence. Only the reconciled Mercado Pago ledger counts.
 *
 * An unrelated/ordinary AR or BR call does not require Jordan payment.
 * Any database or partner lookup failure must propagate (fail closed).
 */
export async function checkJordanMediaAccess(
  admin: SupabaseClient,
  roomId: string,
): Promise<'allowed' | 'payment_required'> {
  const { data: dispatch, error: dispatchError } = await admin
    .from('pharmacy_dispatch_requests')
    .select(
      'id,care_country,referral_partner_id,commercial_referral_partners!pharmacy_dispatch_requests_referral_partner_id_fkey(code,active)',
    )
    .eq('cloudflare_room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dispatchError) throw dispatchError
  if (!dispatch) return 'allowed'

  const partner = dispatch.commercial_referral_partners as
    | { code?: string; active?: boolean }
    | null

  // If a referral exists but its registry cannot be resolved, never guess.
  if (dispatch.referral_partner_id && !partner?.code) {
    throw new Error('media_referral_lookup_unavailable')
  }
  if (partner?.code !== 'JORDAN') return 'allowed'

  if (dispatch.care_country !== 'BR' || partner.active !== true) {
    return 'payment_required'
  }

  const { data: payment, error: paymentError } = await admin
    .from('pharmacy_dispatch_payments')
    .select('status,provider,provider_payment_id,paid_at,amount_minor,currency')
    .eq('dispatch_request_id', dispatch.id)
    .maybeSingle()

  if (paymentError) throw paymentError

  return payment?.status === 'approved'
    && payment.provider === 'mercadopago'
    && typeof payment.provider_payment_id === 'string'
    && /^\d{1,20}$/.test(payment.provider_payment_id)
    && Boolean(payment.paid_at)
    && payment.amount_minor === GENERAL_PHARMACY_BR_PRICE_CENTS
    && payment.currency === 'BRL'
    ? 'allowed'
    : 'payment_required'
}
