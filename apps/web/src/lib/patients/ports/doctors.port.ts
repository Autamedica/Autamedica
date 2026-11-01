import type { DoctorSummary } from '@/lib/patients/lib/repos/doctors.adapter'

export interface IDoctorsRepository {
  listActive(country: 'AR' | 'BR'): Promise<DoctorSummary[]>
}

