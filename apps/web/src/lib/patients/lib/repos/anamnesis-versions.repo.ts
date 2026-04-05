/**
 * Repository: anamnesis_versions table access.
 * Capa 7 — Solo CRUD tipado, cero lógica de negocio.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, toCamel } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export type VersionTrigger = 'initial' | 'update' | 'review'
export type VersionRelevance = 'routine' | 'new_symptom' | 'follow_up' | 'emergency'

export interface AnamnesisVersion {
  id: string
  anamnesisId: string
  patientId: string
  versionNumber: number
  trigger: VersionTrigger
  sectionsSnapshot: Record<string, unknown>[]
  extractionSnapshot: Record<string, unknown> | null
  changesSummary: { added: string[]; modified: string[]; unchanged: string[] } | null
  pdfFilename: string | null
  pdfStorageKey: string | null
  pdfGeneratedAt: string | null
  relevance: VersionRelevance | null
  notes: string | null
  createdAt: string
}

export interface VersionInsert {
  anamnesis_id: string
  patient_id: string
  version_number: number
  trigger: VersionTrigger
  sections_snapshot: Record<string, unknown>[]
  extraction_snapshot?: Record<string, unknown> | null
  changes_summary?: { added: string[]; modified: string[]; unchanged: string[] } | null
  pdf_filename?: string | null
  pdf_storage_key?: string | null
  pdf_generated_at?: string | null
  relevance?: VersionRelevance | null
  notes?: string | null
}

export const anamnesisVersionsRepo = {
  async insert(supabase: Db, data: VersionInsert): Promise<AnamnesisVersion> {
    const { data: result, error } = await supabase
      .from('anamnesis_versions' as never)
      .insert(data as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[anamnesisVersionsRepo] insert failed', error)
      throw error
    }

    return toCamel<AnamnesisVersion>(result)
  },

  async listByAnamnesis(supabase: Db, anamnesisId: string): Promise<AnamnesisVersion[]> {
    const { data, error } = await supabase
      .from('anamnesis_versions' as never)
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .order('version_number', { ascending: false })

    if (error) {
      logger.error('[anamnesisVersionsRepo] listByAnamnesis failed', error)
      throw error
    }

    return toCamel<AnamnesisVersion[]>(data ?? [])
  },

  async getLatest(supabase: Db, anamnesisId: string): Promise<AnamnesisVersion | null> {
    const { data, error } = await supabase
      .from('anamnesis_versions' as never)
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('[anamnesisVersionsRepo] getLatest failed', error)
      throw error
    }

    return data ? toCamel<AnamnesisVersion>(data) : null
  },

  async getByVersion(supabase: Db, anamnesisId: string, versionNumber: number): Promise<AnamnesisVersion | null> {
    const { data, error } = await supabase
      .from('anamnesis_versions' as never)
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .eq('version_number', versionNumber)
      .maybeSingle()

    if (error) {
      logger.error('[anamnesisVersionsRepo] getByVersion failed', error)
      throw error
    }

    return data ? toCamel<AnamnesisVersion>(data) : null
  },

  async updatePdf(supabase: Db, versionId: string, pdf: { filename: string; storageKey: string }): Promise<void> {
    const { error } = await supabase
      .from('anamnesis_versions' as never)
      .update({
        pdf_filename: pdf.filename,
        pdf_storage_key: pdf.storageKey,
        pdf_generated_at: new Date().toISOString(),
      } as never)
      .eq('id', versionId)

    if (error) {
      logger.error('[anamnesisVersionsRepo] updatePdf failed', error)
      throw error
    }
  },
}
