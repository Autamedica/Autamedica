import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

const PLANS_WITH_VIDEOCONSULTA = new Set(['pro', 'premium'])

/**
 * Check if a doctor can start a videoconsulta.
 * Returns true if the doctor has an active Pro/Premium subscription OR free credits remaining.
 */
export async function canDoctorStartVideoconsulta(
  supabase: Db,
  doctorId: string,
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  // Check active subscription first (Pro/Premium have unlimited videoconsultas)
  const { data: subscription } = await supabase
    .from('doctor_subscriptions')
    .select('id, plan_id, status, subscription_plans(slug)')
    .eq('doctor_id', doctorId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (subscription) {
    const planSlug = (subscription.subscription_plans as { slug: string } | null)?.slug
    if (planSlug && PLANS_WITH_VIDEOCONSULTA.has(planSlug)) {
      return { allowed: true }
    }
  }

  // No qualifying subscription — check free credits
  const { data: doctor, error } = await supabase
    .from('doctors')
    .select('free_videoconsultas_remaining')
    .eq('id', doctorId)
    .maybeSingle()

  if (error || !doctor) {
    logger.error('[videoconsulta-credits] Failed to fetch doctor credits', { doctorId, error })
    return { allowed: false, reason: 'doctor_not_found' }
  }

  const remaining = (doctor as { free_videoconsultas_remaining: number }).free_videoconsultas_remaining ?? 0
  if (remaining <= 0) {
    return { allowed: false, reason: 'no_videoconsulta_credits', remaining: 0 }
  }

  return { allowed: true, remaining }
}

/**
 * Decrement free videoconsulta credits for a doctor after a completed call.
 * Only decrements if doctor has no qualifying subscription.
 */
export async function decrementDoctorVideoconsulta(
  supabase: Db,
  doctorId: string,
): Promise<boolean> {
  // Skip if doctor has an active Pro/Premium subscription
  const { data: subscription } = await supabase
    .from('doctor_subscriptions')
    .select('id, subscription_plans(slug)')
    .eq('doctor_id', doctorId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (subscription) {
    const planSlug = (subscription.subscription_plans as { slug: string } | null)?.slug
    if (planSlug && PLANS_WITH_VIDEOCONSULTA.has(planSlug)) {
      return true // No credit consumed — unlimited via subscription
    }
  }

  // Decrement free credit
  const { data: doctor } = await supabase
    .from('doctors')
    .select('free_videoconsultas_remaining')
    .eq('id', doctorId)
    .maybeSingle()

  const remaining = (doctor as { free_videoconsultas_remaining: number } | null)
    ?.free_videoconsultas_remaining ?? 0

  if (remaining <= 0) return false

  const { error } = await supabase
    .from('doctors')
    .update({ free_videoconsultas_remaining: remaining - 1 } as never)
    .eq('id', doctorId)

  if (error) {
    logger.error('[videoconsulta-credits] Failed to decrement', { doctorId, error })
    return false
  }

  logger.info('[videoconsulta-credits] Decremented', { doctorId, from: remaining, to: remaining - 1 })
  return true
}
