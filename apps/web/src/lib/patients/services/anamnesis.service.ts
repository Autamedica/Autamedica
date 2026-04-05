/**
 * Backend Service: anamnesis business logic.
 * Owns: section definitions, progress computation, section orchestration.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import {
  createAnamnesisAdapter,
  type AnamnesisRecord,
  type AnamnesisSectionRecord,
} from '@/lib/patients/lib/repos/anamnesis.adapter'
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps'
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
  completionPercentage: number
  completedSections: string[]
  pendingSections: string[]
  totalSections: number
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
  const completionPercentage =
    TOTAL_SECTIONS > 0 ? Math.round((completed.length / TOTAL_SECTIONS) * 100) : 0

  return {
    completionPercentage,
    completedSections: completedIds,
    pendingSections: pending,
    totalSections: TOTAL_SECTIONS,
  }
}

/**
 * For carry_forward_additive sections, merge new data with previous data
 * ensuring arrays only grow (items can be added but never removed).
 */
function mergeAdditive(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...incoming }

  for (const [key, prevValue] of Object.entries(previous)) {
    if (!Array.isArray(prevValue)) continue

    const newValue = incoming[key]
    if (!Array.isArray(newValue)) {
      // If the incoming data doesn't have this array, preserve the previous
      merged[key] = prevValue
      continue
    }

    // Union: all previous items plus any new ones.
    // JSON.stringify handles objects (Set only deduplicates primitives).
    const seen = new Set(prevValue.map((v) => JSON.stringify(v)))
    const union = [...prevValue, ...newValue.filter((v) => !seen.has(JSON.stringify(v)))]
    merged[key] = union
  }

  return merged
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
    const anamnesisRepo = createAnamnesisAdapter(supabase)

    const anamnesis = await anamnesisRepo.ensure(patientId)
    const [sections, patient] = await Promise.all([
      anamnesisRepo.getSections(anamnesis.id),
      supabase.from('patients').select('birth_date').eq('id', patientId).maybeSingle(),
    ])

    const birthDate = patient.data?.birth_date ?? null
    let currentSections = sections as AnamnesisSectionRecord[]

    if (birthDate && !sections.some((s) => s.section === 'edad' && s.completed)) {
      const age = computeAge(birthDate)
      if (age !== null) {
        await anamnesisRepo
          .upsertSection(anamnesis.id, 'edad', { fecha_nacimiento: birthDate, edad: age }, true)
          .catch((err) => logger.warn('[anamnesisService] auto-complete edad failed', err))
        currentSections = await anamnesisRepo.getSections(anamnesis.id) as AnamnesisSectionRecord[]
      }
    }

    const progress = computeProgress(currentSections)

    if (anamnesis.completionPercentage !== progress.completionPercentage) {
      anamnesisRepo
        .updateProgress(anamnesis.id, progress.completionPercentage, progress.completedSections)
        .catch((err) => logger.warn('[anamnesisService] progress sync failed', err))
    }

    return {
      anamnesis: { ...anamnesis as AnamnesisRecord, completionPercentage: progress.completionPercentage },
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
    const anamnesisRepo = createAnamnesisAdapter(supabase)
    const cleanUpdates: Record<string, unknown> = {}

    if (typeof updates.status === 'string') {
      cleanUpdates.status = updates.status
      if (updates.status === 'completed' && !updates.completedAt) {
        cleanUpdates.completed_at = new Date().toISOString()
      }
    }

    if (typeof updates.completionPercentage === 'number') {
      cleanUpdates.completion_percentage = Math.min(100, Math.max(0, Math.round(updates.completionPercentage)))
    }

    if (updates.completedAt) {
      cleanUpdates.completed_at = updates.completedAt
    }

    if (typeof updates.privacyAccepted === 'boolean') {
      cleanUpdates.privacy_accepted = updates.privacyAccepted
    }

    if (typeof updates.termsAccepted === 'boolean') {
      cleanUpdates.terms_accepted = updates.termsAccepted
    }

    if (Object.keys(cleanUpdates).length === 0) {
      throw Object.assign(new Error('no_updates'), { code: 'NO_UPDATES' })
    }

    const anamnesis = await anamnesisRepo.ensure(patientId)
    const result = await anamnesisRepo.updateMeta(anamnesis.id, cleanUpdates)

    if (cleanUpdates.status === 'completed') {
      const isFirstCompletion = !anamnesis.completedAt
      try {
        await anamnesisVersionService.createVersion(
          supabase, patientId, anamnesis.id,
          isFirstCompletion ? 'initial' : 'update',
        )
      } catch (err) {
        logger.error('[anamnesisService] auto-version creation failed', {
          error: err instanceof Error ? err.message : err,
          patientId,
          anamnesisId: anamnesis.id,
          isFirstCompletion,
        })
      }
    }

    return result as AnamnesisRecord
  },

  async saveSection(
    supabase: Db,
    patientId: string,
    section: string,
    data: Record<string, unknown>,
    completed: boolean,
  ): Promise<{ section: AnamnesisSectionRecord; progress: AnamnesisProgress }> {
    const anamnesisRepo = createAnamnesisAdapter(supabase)

    if (section === 'edad' && data.fecha_nacimiento && !data.edad) {
      const age = computeAge(data.fecha_nacimiento as string)
      if (age !== null) data.edad = age
    }

    const anamnesis = await anamnesisRepo.ensure(patientId)

    // Enforce carry_forward_additive: arrays can only grow, never shrink
    let finalData = data
    const stepDef = anamnesisSteps.find((s) => s.id === section)
    if (stepDef?.mutability === 'carry_forward_additive') {
      const existingSections = await anamnesisRepo.getSections(anamnesis.id)
      const existing = existingSections.find((s) => s.section === section)
      if (existing?.data && typeof existing.data === 'object') {
        finalData = mergeAdditive(existing.data as Record<string, unknown>, data)
      }
    }

    const savedSection = await anamnesisRepo.upsertSection(anamnesis.id, section, finalData, completed) as AnamnesisSectionRecord

    const sections = await anamnesisRepo.getSections(anamnesis.id) as AnamnesisSectionRecord[]
    const progress = computeProgress(sections)

    anamnesisRepo
      .updateProgress(anamnesis.id, progress.completionPercentage, progress.completedSections)
      .catch((err) => logger.warn('[anamnesisService] saveSection progress sync failed', err))

    return { section: savedSection, progress }
  },
}
