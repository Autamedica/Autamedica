import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

/**
 * Decrement free consultation credits for a patient after a completed call.
 * Uses an atomic conditional update: only decrements if current value > 0.
 * Returns true if a credit was consumed, false otherwise.
 */
export async function decrementFreeConsultation(
  supabase: Db,
  patientId: string,
): Promise<boolean> {
  // Fetch current value first to check eligibility
  const { data: patient, error: fetchError } = await supabase
    .from('patients')
    .select('free_consultations_remaining')
    .eq('id', patientId)
    .maybeSingle()

  if (fetchError) {
    logger.error('[consultation-credits] Failed to fetch patient credits', { patientId, error: fetchError })
    return false
  }

  const remaining = (patient as { free_consultations_remaining: number | null } | null)
    ?.free_consultations_remaining ?? 0

  if (remaining <= 0) {
    return false
  }

  const { error: updateError } = await supabase
    .from('patients')
    .update({ free_consultations_remaining: remaining - 1 } as never)
    .eq('id', patientId)

  if (updateError) {
    logger.error('[consultation-credits] Failed to decrement credits', { patientId, error: updateError })
    return false
  }

  logger.info('[consultation-credits] Decremented free consultation', {
    patientId,
    from: remaining,
    to: remaining - 1,
  })

  return true
}
