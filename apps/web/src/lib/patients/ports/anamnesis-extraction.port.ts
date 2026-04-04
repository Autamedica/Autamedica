import type {
  ExtractionCheckpoint,
  ExtractionRecord,
  ExtractionUpsert,
} from '@/lib/patients/lib/repos/anamnesis-extraction.adapter'

export interface IAnamnesisExtractionRepository {
  upsert(data: ExtractionUpsert): Promise<ExtractionRecord>
  getLatest(anamnesisId: string): Promise<ExtractionRecord | null>
  countToday(patientId: string): Promise<number>
  getByCheckpoint(anamnesisId: string, checkpoint: ExtractionCheckpoint): Promise<ExtractionRecord | null>
}
