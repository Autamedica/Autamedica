/**
 * Adapter: anamnesis + anamnesis_sections table access.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IAnamnesisRepository } from '@autamedica/types'

type Db = SupabaseClient<Database>

export interface AnamnesisRecord {
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

export interface AnamnesisSectionRecord {
  id: string
  anamnesis_id: string
  section: string
  data: Record<string, unknown>
  completed: boolean
  completed_at?: string | null
  updated_at: string
}

export function createAnamnesisAdapter(supabase: Db): IAnamnesisRepository {
  const self: IAnamnesisRepository = {
    async findByPatient(patientId: string) {
      const { data, error } = await supabase
        .from('anamnesis')
        .select('*')
        .eq('patient_id', patientId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        logger.error('[anamnesisRepo] findByPatient failed', error)
        throw error
      }

      return data as AnamnesisRecord | null
    },

    async ensure(patientId: string) {
      const existing = await self.findByPatient(patientId)
      if (existing) return existing

      const { data, error } = await supabase
        .from('anamnesis')
        .insert({ patient_id: patientId, status: 'in_progress' } as never)
        .select('*')
        .single()

      if (error) {
        logger.error('[anamnesisRepo] ensure insert failed', error)
        throw error
      }

      return data as AnamnesisRecord
    },

    async updateProgress(
      anamnesisId: string,
      completionPercentage: number,
      completedSections: string[],
    ) {
      const { error } = await supabase
        .from('anamnesis')
        .update({
          completion_percentage: completionPercentage,
          sections_status: { completed: completedSections },
        } as never)
        .eq('id', anamnesisId)

      if (error) {
        logger.error('[anamnesisRepo] updateProgress failed', error)
        throw error
      }
    },

    async updateMeta(
      anamnesisId: string,
      updates: Record<string, unknown>,
    ) {
      const { data, error } = await supabase
        .from('anamnesis')
        .update(updates as never)
        .eq('id', anamnesisId)
        .select('*')
        .single()

      if (error) {
        logger.error('[anamnesisRepo] updateMeta failed', error)
        throw error
      }

      return data as AnamnesisRecord
    },

    async getSections(anamnesisId: string) {
      const { data, error } = await supabase
        .from('anamnesis_sections')
        .select('*')
        .eq('anamnesis_id', anamnesisId)
        .order('updated_at', { ascending: true })

      if (error) {
        logger.error('[anamnesisRepo] getSections failed', error)
        throw error
      }

      return (data ?? []) as AnamnesisSectionRecord[]
    },

    async upsertSection(
      anamnesisId: string,
      section: string,
      data: Record<string, unknown>,
      completed: boolean,
    ) {
      const { data: result, error } = await supabase
        .from('anamnesis_sections')
        .upsert(
          {
            anamnesis_id: anamnesisId,
            section,
            data,
            completed,
            completed_at: completed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'anamnesis_id,section' },
        )
        .select('*')
        .single()

      if (error) {
        logger.error('[anamnesisRepo] upsertSection failed', error)
        throw error
      }

      return result as AnamnesisSectionRecord
    },
  }

  return self
}
