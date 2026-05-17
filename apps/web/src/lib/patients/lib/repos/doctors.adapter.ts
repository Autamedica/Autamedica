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
        }
      })

      return doctors
        .sort((a, b) => {
          // Rule 1: Specific profiles (Eduardo & Demo) always last
          const lastProfiles = ['EDUARDO DA ROSA', 'DEMO GARCIA'];
          const isLastA = lastProfiles.some(p => a.label.toUpperCase().includes(p));
          const isLastB = lastProfiles.some(p => b.label.toUpperCase().includes(p));

          if (isLastA && !isLastB) return 1;
          if (!isLastA && isLastB) return -1;
          if (isLastA && isLastB) {
            // Keep specific order among themselves if both are 'last'
            return a.label.localeCompare(b.label, 'es');
          }

          // Rule 2: Grouping by availability and fee presence
          // Priority: 
          // 1. Available + Has Fee (Active & Ready)
          // 2. Available + No Fee (Active but Pricing Pending)
          // 3. Unavailable + Has Fee (Potentially had patients/history but currently offline)
          // 4. Unavailable + No Fee (Inactive/New)
          
          const getPriority = (d: DoctorSummary) => {
            if (d.has_availability) {
              return d.consultation_fee ? 1 : 2;
            } else {
              return d.consultation_fee ? 3 : 4;
            }
          };

          const priorityA = getPriority(a);
          const priorityB = getPriority(b);

          if (priorityA !== priorityB) return priorityA - priorityB;

          // Rule 3: Alphabetical within same priority
          return a.label.localeCompare(b.label, 'es');
        })
    },
  }
}
