import type { SupabaseClient } from '@supabase/supabase-js'
export interface OperationalPaymentSwitches {
  jordan_qr_payments_enabled: boolean
  pharmacy_express_payments_enabled: boolean
  global_pix_mp_payments_enabled: boolean
}
/** Persisted platform controls are the sole authority. Missing/error states fail closed. */
export async function getOperationalPaymentSwitches(db: Pick<SupabaseClient, 'from'>): Promise<OperationalPaymentSwitches> {
  const { data, error } = await db.from('platform_operational_switches')
    .select('jordan_qr_payments_enabled, pharmacy_express_payments_enabled, global_pix_mp_payments_enabled')
    .eq('id', 'global').maybeSingle()
  if (error) throw new Error('operational_payment_switches_unavailable')
  if (!data) throw new Error('operational_payment_switches_not_configured')
  return {
    jordan_qr_payments_enabled: data.jordan_qr_payments_enabled === true,
    pharmacy_express_payments_enabled: data.pharmacy_express_payments_enabled === true,
    global_pix_mp_payments_enabled: data.global_pix_mp_payments_enabled === true,
  }
}
