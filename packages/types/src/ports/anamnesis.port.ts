/**
 * Port: Anamnesis Repository
 *
 * Interfaz abstracta para acceso a datos de anamnesis (historia clínica digital).
 * Los repos aplican toCamel() antes de retornar, campos en camelCase.
 */

/** Record shapes returned by the repository */
export interface AnamnesisEntity {
  id: string
  patientId: string
  status: string
  completionPercentage: number | null
  sectionsStatus: Record<string, unknown>
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  privacyAccepted?: boolean
  termsAccepted?: boolean
  locked?: boolean
}

export interface AnamnesisSectionEntity {
  id: string
  anamnesisId: string
  section: string
  data: Record<string, unknown>
  completed: boolean
  completedAt?: string | null
  updatedAt: string
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
