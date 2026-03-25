/**
 * Frontend Service: Appointment-related business logic.
 * Resolves patient names for appointment lists.
 * Layer 3 of the 7-layer architecture.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { logger } from '@autamedica/shared'

/**
 * Resolves a map of patientId → display name for a list of patient IDs.
 * Uses patients table → profiles join to get first/last name.
 */
export async function resolvePatientNameMap(patientIds: string[]): Promise<Record<string, string>> {
  if (patientIds.length === 0) return {}

  try {
    const supabase = getBrowserSupabaseClient()

    const { data: patients } = await supabase
      .from('patients')
      .select('id, user_id')
      .in('id', patientIds)

    if (!patients?.length) return {}

    const userIds = patients.map(p => p.user_id).filter(Boolean)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds)

    if (!profiles?.length) return {}

    const userToName: Record<string, string> = {}
    for (const p of profiles) {
      userToName[p.user_id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Paciente'
    }

    const nameMap: Record<string, string> = {}
    for (const patient of patients) {
      if (patient.user_id && userToName[patient.user_id]) {
        nameMap[patient.id] = userToName[patient.user_id]
      }
    }

    return nameMap
  } catch (err) {
    logger.error('[resolvePatientNameMap] failed', err)
    return {}
  }
}
