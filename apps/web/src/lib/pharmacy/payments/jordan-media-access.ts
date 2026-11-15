import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side payment gate for pharmacy dispatches in BR and AR.
 * A redirect, QR code or signed guest token is not proof of payment.
 * Only the country tariff and payment ledger authorize the media path.
 */
export async function checkJordanMediaAccess(
  admin: SupabaseClient,
  roomId: string,
): Promise<'allowed' | 'payment_required'> {
  const db = admin as any
  const { data: dispatch, error: dispatchError } = await db
    .from('pharmacy_dispatch_requests')
    .select('id,care_country,tier_requested,referral_partner_id')
    .eq('cloudflare_room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dispatchError) throw dispatchError
  if (!dispatch) return 'allowed'

  let partner: { code?: string; active?: boolean } | null = null
  if (dispatch.referral_partner_id) {
    const { data, error } = await db.from('commercial_referral_partners')
      .select('code,active').eq('id', dispatch.referral_partner_id).maybeSingle()
    if (error || !data?.code) throw new Error('media_referral_lookup_unavailable')
    partner = data
  }

  if (partner?.code === 'JORDAN'
      && (!['AR', 'BR'].includes(dispatch.care_country) || dispatch.tier_requested !== 'general')) {
    return 'payment_required'
  }
  if (!['AR', 'BR'].includes(dispatch.care_country)) return 'allowed'
  if (dispatch.tier_requested !== 'general' || (partner && partner.active !== true)) {
    return 'payment_required'
  }

  const { data: pricing, error: pricingError } = await db.from('pharmacy_dispatch_pricing_configs')
    .select('currency,consultation_price_minor,require_payment_before_dispatch')
    .eq('country_code', dispatch.care_country)
    .maybeSingle()
  if (pricingError) throw pricingError
  if (!pricing) return 'payment_required'
  if (pricing.require_payment_before_dispatch !== true) return 'allowed'

  const { data: payment, error: paymentError } = await db
    .from('pharmacy_dispatch_payments')
    .select('status,provider,provider_payment_id,paid_at,amount_minor,currency,metadata')
    .eq('dispatch_request_id', dispatch.id)
    .maybeSingle()
  if (paymentError) throw paymentError

  const providerId = String(payment?.provider_payment_id ?? '')
  const numericMercadoPago = payment?.provider === 'mercadopago' && /^\d{1,20}$/.test(providerId)
  const auditedManualOverride = providerId.startsWith('MANUAL_OVERRIDE_')
    && typeof payment?.metadata?.manual_override_by === 'string'
    && Boolean(payment.metadata.manual_override_by)
  return payment?.status === 'approved'
    && (numericMercadoPago || auditedManualOverride)
    && Boolean(payment.paid_at)
    && payment.amount_minor === pricing.consultation_price_minor
    && payment.currency === pricing.currency
    ? 'allowed'
    : 'payment_required'
}
