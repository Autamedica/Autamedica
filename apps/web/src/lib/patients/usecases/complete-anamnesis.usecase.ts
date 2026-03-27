/**
 * Use Case: Complete Anamnesis
 *
 * Orquesta el flujo completo de anamnesis del paciente:
 * 1. Encuentra o crea la anamnesis
 * 2. Guarda cada sección
 * 3. Actualiza progreso
 * 4. Emite evento de dominio
 *
 * Recibe dependencias por parámetro (inversión de dependencias).
 * Testeable con mock repos y event bus.
 */

import type { IAnamnesisRepository } from '@autamedica/types'
import type { IEventBus } from '@autamedica/shared'
import { logger } from '@autamedica/shared'

interface CompleteAnamnesisInput {
  patientId: string
  sections: Array<{
    section: string
    data: Record<string, unknown>
    completed: boolean
  }>
}

interface CompleteAnamnesisResult {
  anamnesisId: string
  completedSections: string[]
  completionPercentage: number
}

interface CompleteAnamnesisDeps {
  anamnesisRepo: IAnamnesisRepository
  eventBus: IEventBus
}

export async function completeAnamnesis(
  deps: CompleteAnamnesisDeps,
  input: CompleteAnamnesisInput
): Promise<CompleteAnamnesisResult> {
  const { anamnesisRepo, eventBus } = deps
  const { patientId, sections } = input

  logger.info(`[usecase:complete-anamnesis] Starting for patient=${patientId}, sections=${sections.length}`)

  const anamnesis = await anamnesisRepo.ensure(patientId)

  for (const section of sections) {
    await anamnesisRepo.upsertSection(
      anamnesis.id,
      section.section,
      section.data,
      section.completed
    )

    if (section.completed) {
      await eventBus.emit('anamnesis.section_completed', {
        anamnesisId: anamnesis.id,
        patientId,
        section: section.section,
      })
    }
  }

  const completedSections = sections
    .filter((s) => s.completed)
    .map((s) => s.section)

  const totalSections = 13 // total sections defined in AnamnesisSection type
  const completionPercentage = Math.round(
    (completedSections.length / totalSections) * 100
  )

  await anamnesisRepo.updateProgress(
    anamnesis.id,
    completionPercentage,
    completedSections
  )

  if (completionPercentage === 100) {
    await eventBus.emit('anamnesis.completed', {
      anamnesisId: anamnesis.id,
      patientId,
    })
    logger.info(`[usecase:complete-anamnesis] Anamnesis completed for patient=${patientId}`)
  }

  return {
    anamnesisId: anamnesis.id,
    completedSections,
    completionPercentage,
  }
}
