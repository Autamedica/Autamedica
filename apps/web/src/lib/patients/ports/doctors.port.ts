import type { DoctorSummary } from '@/lib/patients/lib/repos/doctors.adapter'

export interface IDoctorsRepository {
  listActive(): Promise<DoctorSummary[]>
}
