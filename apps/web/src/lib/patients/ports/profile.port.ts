import type { Database } from '@autamedica/types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PatientUpdate = Database['public']['Tables']['patients']['Update']

export interface IProfileRepository {
  upsertProfile(userId: string, payload: Partial<ProfileUpdate>): Promise<unknown>
  upsertPatient(userId: string, payload: Partial<PatientUpdate>): Promise<unknown>
  ensureBoth(userId: string, email?: string | null): Promise<void>
  updateOnboardingComplete(userId: string): Promise<void>
  findActivePatientByUserId(userId: string): Promise<{ id: string } | null>
}
