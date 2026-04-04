/**
 * Port: Doctor Repository
 *
 * Interfaz abstracta para acceso a datos de doctores y sus perfiles.
 * La implementación concreta (Supabase adapter) vive en apps/web.
 * Tests pueden usar mock adapters.
 */

import type { DoctorWithProfile } from '../entities/profiles'

export interface IDoctorRepository {
  findAll(): Promise<DoctorWithProfile[]>
  findByUserId(userId: string): Promise<DoctorWithProfile | null>
  findById(id: string): Promise<DoctorWithProfile | null>
  findBySpecialty(specialty: string): Promise<DoctorWithProfile[]>
  resolveIdByUserId(userId: string): Promise<string | null>
}
