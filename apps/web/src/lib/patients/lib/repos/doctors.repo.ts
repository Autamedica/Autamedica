/**
 * Repository: doctors table access for patient-facing queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export interface DoctorSummary {
  id: string
  specialty: string | null
  first_name: string | null
  last_name: string | null
  label: string
}

interface DoctorRow {
  id: string
  specialty: string | null
  profile: {
    first_name: string | null
    last_name: string | null
  } | null
}

export const doctorsRepo = {
  async listActive(supabase: Db): Promise<DoctorSummary[]> {
    const { data, error } = await supabase
      .from('doctors')
      .select('id, specialty, profile:profiles!doctors_user_id_fkey(first_name, last_name)')
      .eq('active', true)

    if (error) {
      logger.error('[doctorsRepo] listActive failed', error)
      throw error
    }

    const doctors = ((data ?? []) as unknown as DoctorRow[]).map((row) => {
      const firstName = row.profile?.first_name ?? ''
      const lastName = row.profile?.last_name ?? ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ')

      return {
        id: row.id,
        specialty: row.specialty,
        first_name: row.profile?.first_name ?? null,
        last_name: row.profile?.last_name ?? null,
        label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
      }
    })

    return doctors.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  },
}
