import type {
  AnamnesisVersion,
  VersionInsert,
} from '@/lib/patients/lib/repos/anamnesis-versions.adapter'

export interface IAnamnesisVersionsRepository {
  insert(data: VersionInsert): Promise<AnamnesisVersion>
  listByAnamnesis(anamnesisId: string): Promise<AnamnesisVersion[]>
  getLatest(anamnesisId: string): Promise<AnamnesisVersion | null>
  getByVersion(anamnesisId: string, versionNumber: number): Promise<AnamnesisVersion | null>
  updatePdf(versionId: string, pdf: { filename: string; storageKey: string }): Promise<void>
}
