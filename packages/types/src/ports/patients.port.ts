/**
 * Port: Patient Repository
 *
 * Interfaz abstracta para acceso a datos de pacientes.
 * La implementación concreta (Supabase adapter) vive en apps/web.
 * Tests pueden usar mock adapters.
 */

import type { UUID } from '../core/brand.types'
import type { PatientWithProfile } from '../entities/profiles'

export interface IPatientRepository {
  findAllActive(): Promise<PatientWithProfile[]>
  findById(id: UUID): Promise<PatientWithProfile | null>
  findByUserId(userId: string): Promise<PatientWithProfile | null>
  findByCompany(companyId: string): Promise<PatientWithProfile[]>
  findByDoctorUserId(doctorUserId: string): Promise<PatientWithProfile[]>
}
