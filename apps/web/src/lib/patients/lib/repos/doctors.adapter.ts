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
  has_availability: boolean
  label: string
  license_number: string | null
}

interface DoctorRow {
  id: string
  specialty: string | null
  consultation_fee: number | null
  license_number: string | null
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
        .select('id, specialty, consultation_fee, license_number, profile:profiles!doctors_user_id_fkey(first_name, last_name)')
        .eq('active', true)

      if (error) {
        logger.error('[doctorsRepo] listActive failed', error)
        throw error
      }

      const doctorRows = (data ?? []) as unknown as DoctorRow[]
      const doctorIds = doctorRows.map((doctor) => doctor.id)

      let doctorsWithAvailability = new Set<string>()
      if (doctorIds.length > 0) {
        const { data: availabilityRows, error: availabilityError } = await supabase
          .from('doctor_availability')
          .select('doctor_id')
          .in('doctor_id', doctorIds)
          .eq('is_active', true)

        if (availabilityError) {
          logger.error('[doctorsRepo] listActive availability lookup failed', availabilityError)
          throw availabilityError
        }

        doctorsWithAvailability = new Set((availabilityRows ?? []).map((row) => row.doctor_id))
      }

      const doctors = doctorRows.map((row) => {
        const firstName = row.profile?.first_name ?? ''
        const lastName = row.profile?.last_name ?? ''
        const fullName = [firstName, lastName].filter(Boolean).join(' ')

        return {
          id: row.id,
          specialty: row.specialty,
          consultation_fee: row.consultation_fee ?? null,
          first_name: row.profile?.first_name ?? null,
          last_name: row.profile?.last_name ?? null,
          has_availability: doctorsWithAvailability.has(row.id),
          label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
          license_number: row.license_number ?? null,
        }
      })

      return doctors
        .sort((a, b) => {
          if (a.has_availability !== b.has_availability) return a.has_availability ? -1 : 1
          return a.label.localeCompare(b.label, 'es')
        })
    },
  }
}
