/**
 * Repository: anamnesis_extractions table access.
 * Capa 7 — Solo CRUD tipado, cero lógica de negocio.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export type ExtractionCheckpoint = 'partial' | 'final'

export interface ExtractionRecord {
  id: string
  anamnesis_id: string
  patient_id: string
  checkpoint: ExtractionCheckpoint
  extraction_result: Record<string, unknown>
  provider: string
  model: string
  prompt_version: string
  sections_count: number
  has_critical_questions: boolean
  created_at: string
  updated_at: string
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

    return result as unknown as ExtractionRecord
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

    return (data as unknown as ExtractionRecord) ?? null
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

    return (data as unknown as ExtractionRecord) ?? null
  },
}
