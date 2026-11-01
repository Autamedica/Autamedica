/**
 * Backend Service: doctor listing for patient-facing queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { createDoctorsAdapter, type DoctorSummary } from '@/lib/patients/lib/repos/doctors.adapter'

type Db = SupabaseClient<Database>

export type { DoctorSummary }

export const doctorsService = {
  async listActiveDoctors(supabase: Db, country: 'AR' | 'BR'): Promise<DoctorSummary[]> {
    const doctorsRepo = createDoctorsAdapter(supabase)
    return doctorsRepo.listActive(country)
  },
}

