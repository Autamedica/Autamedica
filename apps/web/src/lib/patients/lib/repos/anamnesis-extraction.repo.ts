/**
 * Repository: anamnesis_extractions table access.
 * Capa 7 — Solo CRUD tipado, cero lógica de negocio.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, toCamel } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export type ExtractionCheckpoint = 'partial' | 'final'

export interface ExtractionRecord {
  id: string
  anamnesisId: string
  patientId: string
  checkpoint: ExtractionCheckpoint
  extractionResult: Record<string, unknown>
  provider: string
  model: string
  promptVersion: string
  sectionsCount: number
  hasCriticalQuestions: boolean
  createdAt: string
  updatedAt: string
}

export interface ExtractionUpsert {
  anamnesis_id: string
  patient_id: string
  checkpoint: ExtractionCheckpoint
  extraction_result: Record<string, unknown>
  provider: string
  model: string
  prompt_version: string
  sections_count: number
  has_critical_questions: boolean
}

export const anamnesisExtractionRepo = {
  async upsert(supabase: Db, data: ExtractionUpsert): Promise<ExtractionRecord> {
    const { data: result, error } = await supabase
      .from('anamnesis_extractions' as never)
      .upsert(data as never, { onConflict: 'anamnesis_id,checkpoint' })
      .select('*')
      .single()

    if (error) {
      logger.error('[anamnesisExtractionRepo] upsert failed', error)
      throw error
    }

    return toCamel<ExtractionRecord>(result)
  },

  async getLatest(
    supabase: Db,
    anamnesisId: string,
  ): Promise<ExtractionRecord | null> {
    const { data, error } = await supabase
      .from('anamnesis_extractions' as never)
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('[anamnesisExtractionRepo] getLatest failed', error)
      throw error
    }

    return data ? toCamel<ExtractionRecord>(data) : null
  },

  /** Count extractions for a patient today (rate limiting) */
  async countToday(supabase: Db, patientId: string): Promise<number> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count, error } = await supabase
      .from('anamnesis_extractions' as never)
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .gte('created_at', today.toISOString())

    if (error) {
      logger.error('[anamnesisExtractionRepo] countToday failed', error)
      return 0 // fail open — don't block patient on count errors
    }

    return count ?? 0
  },

  async getByCheckpoint(
    supabase: Db,
    anamnesisId: string,
    checkpoint: ExtractionCheckpoint,
  ): Promise<ExtractionRecord | null> {
    const { data, error } = await supabase
      .from('anamnesis_extractions' as never)
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .eq('checkpoint', checkpoint)
      .maybeSingle()

    if (error) {
      logger.error('[anamnesisExtractionRepo] getByCheckpoint failed', error)
      throw error
    }

    return data ? toCamel<ExtractionRecord>(data) : null
  },
}
