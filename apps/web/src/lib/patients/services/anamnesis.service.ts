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
import { anamnesisVersionService } from './anamnesis-version.service'

type Db = SupabaseClient<Database>

const TOTAL_SECTIONS = 13
export const KNOWN_SECTIONS = [
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
  patientBirthDate?: string | null
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

function computeAge(birthDate: string): number | null {
  const bd = new Date(birthDate)
  if (isNaN(bd.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - bd.getFullYear()
  const monthDiff = today.getMonth() - bd.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) age--
  return age >= 0 ? age : null
}

export const anamnesisService = {
  async get(supabase: Db, patientId: string): Promise<AnamnesisSnapshot> {
    // 1. Ensure anamnesis + fetch sections + birth_date in parallel
    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    const [sections, patient] = await Promise.all([
      anamnesisRepo.getSections(supabase, anamnesis.id),
      supabase.from('patients').select('birth_date').eq('id', patientId).maybeSingle(),
    ])

    const birthDate = patient.data?.birth_date ?? null
    let currentSections = sections

    // 2. Auto-complete edad if birth_date exists but section not completed
    if (birthDate && !sections.some((s) => s.section === 'edad' && s.completed)) {
      const age = computeAge(birthDate)
      if (age !== null) {
        await anamnesisRepo
          .upsertSection(supabase, anamnesis.id, 'edad', { fecha_nacimiento: birthDate, edad: age }, true)
          .catch((err) => logger.warn('[anamnesisService] auto-complete edad failed', err))
        currentSections = await anamnesisRepo.getSections(supabase, anamnesis.id)
      }
    }

    // 3. Compute progress once
    const progress = computeProgress(currentSections)

    // 4. Sync progress if drifted (fire-and-forget)
    if (anamnesis.completion_percentage !== progress.completion_percentage) {
      anamnesisRepo
        .updateProgress(supabase, anamnesis.id, progress.completion_percentage, progress.completed_sections)
        .catch((err) => logger.warn('[anamnesisService] progress sync failed', err))
    }

    return {
      anamnesis: { ...anamnesis, completion_percentage: progress.completion_percentage },
      sections: currentSections,
      progress,
      patientBirthDate: birthDate,
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

    if (typeof updates.privacy_accepted === 'boolean') {
      cleanUpdates.privacy_accepted = updates.privacy_accepted
    }

    if (typeof updates.terms_accepted === 'boolean') {
      cleanUpdates.terms_accepted = updates.terms_accepted
    }

    if (Object.keys(cleanUpdates).length === 0) {
      throw Object.assign(new Error('no_updates'), { code: 'NO_UPDATES' })
    }

    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    const result = await anamnesisRepo.updateMeta(supabase, anamnesis.id, cleanUpdates)

    // Auto-create version when anamnesis is completed
    if (cleanUpdates.status === 'completed') {
      const isFirstCompletion = !anamnesis.completed_at
      try {
        await anamnesisVersionService.createVersion(
          supabase, patientId, anamnesis.id,
          isFirstCompletion ? 'initial' : 'update',
        )
      } catch (err) {
        // Log but don't block — versioning failure shouldn't prevent completion
        logger.error('[anamnesisService] auto-version creation failed', {
          error: err instanceof Error ? err.message : err,
          patientId,
          anamnesisId: anamnesis.id,
          isFirstCompletion,
        })
      }
    }

    return result
  },

  async saveSection(
    supabase: Db,
    patientId: string,
    section: string,
    data: Record<string, unknown>,
    completed: boolean,
  ): Promise<{ section: AnamnesisSectionRecord; progress: AnamnesisProgress }> {
    // Auto-calculate age from birth date
    if (section === 'edad' && data.fecha_nacimiento && !data.edad) {
      const age = computeAge(data.fecha_nacimiento as string)
      if (age !== null) data.edad = age
    }

    const anamnesis = await anamnesisRepo.ensure(supabase, patientId)
    const savedSection = await anamnesisRepo.upsertSection(supabase, anamnesis.id, section, data, completed)

    const sections = await anamnesisRepo.getSections(supabase, anamnesis.id)
    const progress = computeProgress(sections)

    anamnesisRepo
      .updateProgress(supabase, anamnesis.id, progress.completion_percentage, progress.completed_sections)
      .catch((err) => logger.warn('[anamnesisService] saveSection progress sync failed', err))

    return { section: savedSection, progress }
  },
}
