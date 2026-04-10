import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { createPsychiatryIntakeAdapter } from '@/lib/patients/lib/repos/psychiatry-intake.adapter'
import {
  PSYCHIATRY_INTAKE_SECTIONS,
  getPsychiatryPhaseFromSection,
} from '@/lib/patients/data/psychiatry-intake-steps'
import type {
  PsychiatryIntakePhase,
  PsychiatryIntakeProgress,
  PsychiatryIntakeSection,
  PsychiatryIntakeSnapshot,
} from '@/lib/patients/types/psychiatry-intake'

type Db = SupabaseClient<Database>

export const PSYCHIATRY_KNOWN_SECTIONS = PSYCHIATRY_INTAKE_SECTIONS
const TOTAL_SECTIONS = PSYCHIATRY_KNOWN_SECTIONS.length

function computeProgress(completedSections: string[]): PsychiatryIntakeProgress {
  const completed = completedSections.filter((section): section is PsychiatryIntakeSection =>
    PSYCHIATRY_KNOWN_SECTIONS.includes(section as PsychiatryIntakeSection),
  )
  const pending = PSYCHIATRY_KNOWN_SECTIONS.filter((section) => !completed.includes(section))

  return {
    completionPercentage: TOTAL_SECTIONS > 0 ? Math.round((completed.length / TOTAL_SECTIONS) * 100) : 0,
    completedSections: completed,
    pendingSections: pending,
    totalSections: TOTAL_SECTIONS,
  }
}

export const psychiatryIntakeService = {
  async get(supabase: Db, patientId: string): Promise<PsychiatryIntakeSnapshot> {
    const repo = createPsychiatryIntakeAdapter(supabase)
    const intake = await repo.ensure(patientId)
    const [sections, patient] = await Promise.all([
      repo.getSections(intake.id),
      supabase.from('patients').select('birth_date').eq('id', patientId).maybeSingle(),
    ])

    const progress = computeProgress(
      sections.filter((section) => section.completed).map((section) => section.section),
    )

    if (intake.completionPercentage !== progress.completionPercentage) {
      repo.updateProgress(intake.id, progress.completionPercentage, progress.completedSections)
        .catch((error) => logger.warn('[psychiatryIntakeService] progress sync failed', error))
    }

    return {
      intake: {
        ...intake,
        completionPercentage: progress.completionPercentage,
      },
      sections,
      progress,
      patientBirthDate: patient.data?.birth_date ?? null,
    }
  },

  async updateMeta(
    supabase: Db,
    patientId: string,
    updates: Partial<{
      status: string
      completionPercentage: number
      completedAt: string | null
      privacyAccepted: boolean
      termsAccepted: boolean
      lastPhase: PsychiatryIntakePhase
      locked: boolean
    }>,
  ) {
    const repo = createPsychiatryIntakeAdapter(supabase)
    const intake = await repo.ensure(patientId)
    const cleanUpdates: Record<string, unknown> = {}

    if (updates.status) {
      cleanUpdates.status = updates.status
      if (updates.status === 'completed' && !updates.completedAt) {
        cleanUpdates.completedAt = new Date().toISOString()
      }
    }

    if (typeof updates.completionPercentage === 'number') {
      cleanUpdates.completionPercentage = Math.max(0, Math.min(100, updates.completionPercentage))
    }

    if (typeof updates.privacyAccepted === 'boolean') {
      cleanUpdates.privacyAccepted = updates.privacyAccepted
    }

    if (typeof updates.termsAccepted === 'boolean') {
      cleanUpdates.termsAccepted = updates.termsAccepted
    }

    if (updates.completedAt !== undefined) {
      cleanUpdates.completedAt = updates.completedAt
    }

    if (updates.lastPhase) {
      cleanUpdates.lastPhase = updates.lastPhase
    }

    if (typeof updates.locked === 'boolean') {
      cleanUpdates.locked = updates.locked
    }

    if (Object.keys(cleanUpdates).length === 0) {
      throw Object.assign(new Error('no_updates'), { code: 'NO_UPDATES' })
    }

    return repo.updateMeta(intake.id, cleanUpdates)
  },

  async saveSection(
    supabase: Db,
    patientId: string,
    section: PsychiatryIntakeSection,
    data: Record<string, unknown>,
    completed: boolean,
    phase?: Exclude<PsychiatryIntakePhase, 'completed'>,
  ) {
    const repo = createPsychiatryIntakeAdapter(supabase)
    const intake = await repo.ensure(patientId)
    const savedSection = await repo.upsertSection(
      intake.id,
      section,
      phase ?? getPsychiatryPhaseFromSection(section),
      data,
      completed,
    )

    const sections = await repo.getSections(intake.id)
    const progress = computeProgress(
      sections.filter((current) => current.completed).map((current) => current.section),
    )

    repo.updateProgress(intake.id, progress.completionPercentage, progress.completedSections)
      .catch((error) => logger.warn('[psychiatryIntakeService] saveSection progress sync failed', error))

    return { section: savedSection, progress }
  },
}
