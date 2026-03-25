/**
 * Backend Service: anamnesis business logic.
 * Owns: section definitions, progress computation, section orchestration.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import {
  anamnesisRepo,
  type AnamnesisRecord,
  type AnamnesisSectionRecord,
} from '@/lib/patients/lib/repos/anamnesis.repo'

type Db = SupabaseClient<Database>

const TOTAL_SECTIONS = 13
const KNOWN_SECTIONS = [
  'edad',
  'ocupacion',
  'motivo_consulta',
  'enfermedades_previas',
  'medicamentos',
  'alergias',
  'antecedentes_familiares',
  'habitos',
  'cardiovascular',
  'respiratorio',
  'digestivo',
  'genitourinario',
  'resumen_final',
] as const

export interface AnamnesisProgress {
  completion_percentage: number
  completed_sections: string[]
  pending_sections: string[]
  total_sections: number
}

export interface AnamnesisSnapshot {
  anamnesis: AnamnesisRecord
  sections: AnamnesisSectionRecord[]
  progress: AnamnesisProgress
}

function computeProgress(sections: AnamnesisSectionRecord[]): AnamnesisProgress {
  const completed = sections.filter((s) => s.completed)
  const completedIds = completed
    .map((s) => s.section)
    .filter((section): section is string => typeof section === 'string' && section.length > 0)
  const pending = KNOWN_SECTIONS.filter((section) => !completedIds.includes(section))
  const completion_percentage =
    TOTAL_SECTIONS > 0 ? Math.round((completed.length / TOTAL_SECTIONS) * 100) : 0

  return {
    completion_percentage,
    completed_sections: completedIds,
    pending_sections: pending,
    total_sections: TOTAL_SECTIONS,
  }
}

export const anamnesisService = {
  async get(supabase: Db, patientId: string): Promise<AnamnesisSnapshot> {
    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    const sections = await anamnesisRepo.getSections(supabase, anamnesis.id)
    const progress = computeProgress(sections)

    if (anamnesis.completion_percentage !== progress.completion_percentage) {
      await anamnesisRepo.updateProgress(
        supabase,
        anamnesis.id,
        progress.completion_percentage,
        progress.completed_sections,
      ).catch((err) => logger.warn('[anamnesisService] progress sync failed', err))
    }

    return {
      anamnesis: { ...anamnesis, completion_percentage: progress.completion_percentage },
      sections,
      progress,
    }
  },

  async updateMeta(
    supabase: Db,
    patientId: string,
    updates: Record<string, unknown>,
  ): Promise<AnamnesisRecord> {
    const cleanUpdates: Record<string, unknown> = {}

    if (typeof updates.status === 'string') {
      cleanUpdates.status = updates.status
      if (updates.status === 'completed' && !updates.completed_at) {
        cleanUpdates.completed_at = new Date().toISOString()
      }
    }

    if (typeof updates.completion_percentage === 'number') {
      cleanUpdates.completion_percentage = Math.min(100, Math.max(0, Math.round(updates.completion_percentage)))
    }

    if (updates.completed_at) {
      cleanUpdates.completed_at = updates.completed_at
    }

    if (Object.keys(cleanUpdates).length === 0) {
      throw Object.assign(new Error('no_updates'), { code: 'NO_UPDATES' })
    }

    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    return anamnesisRepo.updateMeta(supabase, anamnesis.id, cleanUpdates)
  },

  async saveSection(
    supabase: Db,
    patientId: string,
    section: string,
    data: Record<string, unknown>,
    completed: boolean,
  ): Promise<{ section: AnamnesisSectionRecord; progress: AnamnesisProgress }> {
    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    const savedSection = await anamnesisRepo.upsertSection(
      supabase,
      anamnesis.id,
      section,
      data,
      completed,
    )

    const sections = await anamnesisRepo.getSections(supabase, anamnesis.id)
    const progress = computeProgress(sections)

    await anamnesisRepo.updateProgress(
      supabase,
      anamnesis.id,
      progress.completion_percentage,
      progress.completed_sections,
    ).catch((err) => logger.warn('[anamnesisService] saveSection progress sync failed', err))

    return { section: savedSection, progress }
  },
}
