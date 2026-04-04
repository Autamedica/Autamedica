/**
 * Adapter: anamnesis_extractions table access.
 * Capa 7 -- Solo CRUD tipado, cero logica de negocio.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IAnamnesisExtractionRepository } from '@/lib/patients/ports/anamnesis-extraction.port'

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

export function createAnamnesisExtractionAdapter(supabase: Db): IAnamnesisExtractionRepository {
  return {
    async upsert(data: ExtractionUpsert): Promise<ExtractionRecord> {
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

    async countToday(patientId: string): Promise<number> {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { count, error } = await supabase
        .from('anamnesis_extractions' as never)
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .gte('created_at', today.toISOString())

      if (error) {
        logger.error('[anamnesisExtractionRepo] countToday failed', error)
        return 0
      }

      return count ?? 0
    },

    async getByCheckpoint(
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
}
