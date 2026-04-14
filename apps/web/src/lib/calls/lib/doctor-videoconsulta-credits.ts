import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

const PLANS_WITH_VIDEOCONSULTA = new Set(['pro', 'premium'])

async function hasQualifyingSubscription(supabase: Db, doctorId: string): Promise<boolean> {
  // Use billingRepo-style pattern: select('*') + cast through unknown
  // because doctor_subscriptions/subscription_plans types may not be regenerated yet
  const { data: sub } = await (supabase as SupabaseClient)
    .from('doctor_subscriptions')
    .select('plan_id')
    .eq('doctor_id', doctorId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  const planId = (sub as { plan_id: string } | null)?.plan_id
  if (!planId) return false

  const { data: plan } = await (supabase as SupabaseClient)
    .from('subscription_plans')
    .select('slug')
    .eq('id', planId)
    .maybeSingle()

  const slug = (plan as { slug: string } | null)?.slug
  return !!slug && PLANS_WITH_VIDEOCONSULTA.has(slug)
}

/**
 * Check if a doctor can start a videoconsulta.
 * Returns true if the doctor has an active Pro/Premium subscription OR free credits remaining.
 */
export async function canDoctorStartVideoconsulta(
  supabase: Db,
  doctorId: string,
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  // Pro/Premium have unlimited videoconsultas
  if (await hasQualifyingSubscription(supabase, doctorId)) {
    return { allowed: true }
  }

  // No qualifying subscription — check free credits
  const { data: doctor, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('id', doctorId)
    .maybeSingle()

  if (error || !doctor) {
    logger.error('[videoconsulta-credits] Failed to fetch doctor credits', { doctorId, error })
    // Fail open — allow the call if we can't check credits
    return { allowed: true }
  }

  const remaining = (doctor as unknown as { free_videoconsultas_remaining: number })
    .free_videoconsultas_remaining ?? 30
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
  if (await hasQualifyingSubscription(supabase, doctorId)) {
    return true // No credit consumed — unlimited via subscription
  }

  // Decrement free credit
  const { data: doctor } = await supabase
    .from('doctors')
    .select('*')
    .eq('id', doctorId)
    .maybeSingle()

  const remaining = (doctor as unknown as { free_videoconsultas_remaining: number } | null)
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
