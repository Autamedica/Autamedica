/**
 * Repository: anamnesis + anamnesis_sections table access.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, toCamel } from '@autamedica/shared'
import type { IAnamnesisRepository } from '@autamedica/types'

type Db = SupabaseClient<Database>

export interface AnamnesisRecord {
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

export interface AnamnesisSectionRecord {
  id: string
  anamnesisId: string
  section: string
  data: Record<string, unknown>
  completed: boolean
  completedAt?: string | null
  updatedAt: string
}

export const anamnesisRepo = {
  async findByPatient(supabase: Db, patientId: string): Promise<AnamnesisRecord | null> {
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

    return data ? toCamel<AnamnesisRecord>(data) : null
  },

  async ensure(supabase: Db, patientId: string): Promise<AnamnesisRecord> {
    const existing = await this.findByPatient(supabase, patientId)
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

    return toCamel<AnamnesisRecord>(data)
  },

  async updateProgress(
    supabase: Db,
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
    supabase: Db,
    anamnesisId: string,
    updates: Record<string, unknown>,
  ): Promise<AnamnesisRecord> {
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

    return toCamel<AnamnesisRecord>(data)
  },

  async getSections(supabase: Db, anamnesisId: string): Promise<AnamnesisSectionRecord[]> {
    const { data, error } = await supabase
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .order('updated_at', { ascending: true })

    if (error) {
      logger.error('[anamnesisRepo] getSections failed', error)
      throw error
    }

    return toCamel<AnamnesisSectionRecord[]>(data ?? [])
  },

  async upsertSection(
    supabase: Db,
    anamnesisId: string,
    section: string,
    data: Record<string, unknown>,
    completed: boolean,
  ): Promise<AnamnesisSectionRecord> {
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

    return toCamel<AnamnesisSectionRecord>(result)
  },
}

/**
 * Factory: crea un adapter que implementa IAnamnesisRepository
 * cerrando sobre un SupabaseClient específico.
 */
export function createAnamnesisRepositoryAdapter(
  supabase: Db
): IAnamnesisRepository {
  return {
    findByPatient: (patientId) => anamnesisRepo.findByPatient(supabase, patientId),
    ensure: (patientId) => anamnesisRepo.ensure(supabase, patientId),
    updateProgress: (anamnesisId, pct, sections) =>
      anamnesisRepo.updateProgress(supabase, anamnesisId, pct, sections),
    updateMeta: (anamnesisId, updates) =>
      anamnesisRepo.updateMeta(supabase, anamnesisId, updates),
    getSections: (anamnesisId) => anamnesisRepo.getSections(supabase, anamnesisId),
    upsertSection: (anamnesisId, section, data, completed) =>
      anamnesisRepo.upsertSection(supabase, anamnesisId, section, data, completed),
  }
}
