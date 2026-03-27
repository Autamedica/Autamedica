/**
 * Port: Anamnesis Repository
 *
 * Interfaz abstracta para acceso a datos de anamnesis (historia clínica digital).
 * Los nombres de campos reflejan el output real del repositorio (snake_case de DB).
 */

/** Record shapes returned by the repository */
export interface AnamnesisEntity {
  id: string
  patient_id: string
  status: string
  completion_percentage: number | null
  sections_status: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at?: string | null
  privacy_accepted?: boolean
  terms_accepted?: boolean
  locked?: boolean
}

export interface AnamnesisSectionEntity {
  id: string
  anamnesis_id: string
  section: string
  data: Record<string, unknown>
  completed: boolean
  completed_at?: string | null
  updated_at: string
}

export interface IAnamnesisRepository {
  findByPatient(patientId: string): Promise<AnamnesisEntity | null>
  ensure(patientId: string): Promise<AnamnesisEntity>
  updateProgress(
    anamnesisId: string,
    completionPercentage: number,
    completedSections: string[]
  ): Promise<void>
  updateMeta(
    anamnesisId: string,
    updates: Record<string, unknown>
  ): Promise<AnamnesisEntity>
  getSections(anamnesisId: string): Promise<AnamnesisSectionEntity[]>
  upsertSection(
    anamnesisId: string,
    section: string,
    data: Record<string, unknown>,
    completed: boolean
  ): Promise<AnamnesisSectionEntity>
}
