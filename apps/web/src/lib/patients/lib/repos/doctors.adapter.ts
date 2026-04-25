/**
 * Adapter: doctors table access for patient-facing queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IDoctorsRepository } from '@/lib/patients/ports/doctors.port'

type Db = SupabaseClient<Database>

export interface DoctorSummary {
  id: string
  specialty: string | null
  consultation_fee: number | null
  first_name: string | null
  last_name: string | null
  label: string
}

interface DoctorRow {
  id: string
  specialty: string | null
  consultation_fee: number | null
  profile: {
    first_name: string | null
    last_name: string | null
  } | null
}

export function createDoctorsAdapter(supabase: Db): IDoctorsRepository {
  return {
    async listActive(): Promise<DoctorSummary[]> {
      const { data, error } = await supabase
        .from('doctors')
        .select('id, specialty, consultation_fee, profile:profiles!doctors_user_id_fkey(first_name, last_name)')
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
          consultation_fee: row.consultation_fee ?? null,
          first_name: row.profile?.first_name ?? null,
          last_name: row.profile?.last_name ?? null,
          label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
        }
      })

      const doctorIds = doctors.map((doctor) => doctor.id)
      if (doctorIds.length === 0) return []

      const { data: availabilityRows, error: availabilityError } = await supabase
        .from('doctor_availability')
        .select('doctor_id')
        .in('doctor_id', doctorIds)
        .eq('is_active', true)

      if (availabilityError) {
        logger.error('[doctorsRepo] listActive availability filter failed', availabilityError)
        throw availabilityError
      }

      const doctorsWithAvailability = new Set((availabilityRows ?? []).map((row) => row.doctor_id))

      return doctors
        .filter((doctor) => doctorsWithAvailability.has(doctor.id))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    },
  }
}
