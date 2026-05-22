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
  avatar_url: string | null
}

interface DoctorRow {
  id: string
  specialty: string | null
  consultation_fee: number | null
  license_number: string | null
  profile: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null
}

export function createDoctorsAdapter(supabase: Db): IDoctorsRepository {
  return {
    async listActive(): Promise<DoctorSummary[]> {
      const { data, error } = await supabase
        .from('doctors')
        .select('id, specialty, consultation_fee, license_number, profile:profiles!doctors_user_id_fkey(first_name, last_name, avatar_url)')
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
          .select('doctor_id, start_time, end_time')
          .in('doctor_id', doctorIds)
          .eq('is_active', true)

        if (availabilityError) {
          logger.error('[doctorsRepo] listActive availability lookup failed', availabilityError)
          throw availabilityError
        }

        // Group availability by doctor and exclude fake 24/7 defaults
        const availByDoctor = new Map<string, Array<{ start_time: string; end_time: string }>>()
        for (const row of availabilityRows ?? []) {
          const list = availByDoctor.get(row.doctor_id) ?? []
          list.push({ start_time: row.start_time, end_time: row.end_time })
          availByDoctor.set(row.doctor_id, list)
        }

        availByDoctor.forEach((slots, doctorId) => {
          // Detect fake 24/7 preset: all slots are 00:00-23:59
          const isFakePreset = slots.length >= 7 && slots.every(
            (s) => s.start_time === '00:00:00' && s.end_time === '23:59:00',
          )
          if (!isFakePreset && slots.length > 0) {
            doctorsWithAvailability.add(doctorId)
          }
        })
      }

      const doctors = doctorRows
        // Only show doctors who explicitly configured real availability
        .filter((row) => doctorsWithAvailability.has(row.id))
        .map((row) => {
          const firstName = row.profile?.first_name ?? ''
          const lastName = row.profile?.last_name ?? ''
          const fullName = [firstName, lastName].filter(Boolean).join(' ')

          return {
            id: row.id,
            specialty: row.specialty,
            consultation_fee: row.consultation_fee ?? null,
            first_name: row.profile?.first_name ?? null,
            last_name: row.profile?.last_name ?? null,
            has_availability: true,
            label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
            license_number: row.license_number ?? null,
            avatar_url: row.profile?.avatar_url ?? null,
          }
        })

      return doctors
        .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    },
  }
}
