/**
 * Adapter: anamnesis + anamnesis_sections table access.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, toCamel, toSnake } from '@autamedica/shared'
import type { IAnamnesisRepository, AnamnesisEntity, AnamnesisSectionEntity } from '@autamedica/types'

type Db = SupabaseClient<Database>

export function createAnamnesisAdapter(supabase: Db): IAnamnesisRepository {
  const self: IAnamnesisRepository = {
    async findByPatient(patientId: string): Promise<AnamnesisEntity | null> {
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

      return toCamel<AnamnesisEntity | null>(data)
    },

    async ensure(patientId: string): Promise<AnamnesisEntity> {
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

      return toCamel<AnamnesisEntity>(data)
    },

    async updateProgress(
      anamnesisId: string,
      completionPercentage: number,
      completedSections: string[],
    ): Promise<void> {
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
    ): Promise<AnamnesisEntity> {
      const { data, error } = await supabase
        .from('anamnesis')
        .update(toSnake(updates) as never)
        .eq('id', anamnesisId)
        .select('*')
        .single()

      if (error) {
        logger.error('[anamnesisRepo] updateMeta failed', error)
        throw error
      }

      return toCamel<AnamnesisEntity>(data)
    },

    async getSections(anamnesisId: string): Promise<AnamnesisSectionEntity[]> {
      const { data, error } = await supabase
        .from('anamnesis_sections')
        .select('*')
        .eq('anamnesis_id', anamnesisId)
        .order('updated_at', { ascending: true })

      if (error) {
        logger.error('[anamnesisRepo] getSections failed', error)
        throw error
      }

      return toCamel<AnamnesisSectionEntity[]>(data ?? [])
    },

    async upsertSection(
      anamnesisId: string,
      section: string,
      data: Record<string, unknown>,
      completed: boolean,
    ): Promise<AnamnesisSectionEntity> {
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

      return toCamel<AnamnesisSectionEntity>(result)
    },
  }

  return self
}
