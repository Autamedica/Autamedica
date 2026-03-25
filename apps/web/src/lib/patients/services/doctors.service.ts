/**
 * Backend Service: doctor listing for patient-facing queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { doctorsRepo, type DoctorSummary } from '@/lib/patients/lib/repos/doctors.repo'

type Db = SupabaseClient<Database>

export const doctorsService = {
  async listActiveDoctors(supabase: Db): Promise<DoctorSummary[]> {
    return doctorsRepo.listActive(supabase)
  },
}
