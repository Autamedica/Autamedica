/**
 * Service: Preventive Screenings orchestration.
 * Manages screening recommendations, scheduling, and completion.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ScreeningRecommendation, ScreeningFrequencyType, PreventiveScreening, ISODateString } from '@autamedica/types'
import { isScreeningApplicable, calculateNextDueDate, calculateAge } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { preventiveScreeningsRepo } from '@/lib/patients/lib/repos/preventive-screenings.repo'

type AdminClient = SupabaseClient<Database>

const MAX_RECOMMENDATIONS = 8

export const preventiveScreeningsService = {
  async getOverview(admin: AdminClient, patientId: string) {
    const [screenings, recommendations] = await Promise.all([
      preventiveScreeningsRepo.listByPatient(admin, patientId),
      preventiveScreeningsService.getRecommendations(admin, patientId),
    ])

    return { screenings, recommendations }
  },

  async getRecommendations(
    admin: AdminClient,
    patientId: string,
  ): Promise<ScreeningRecommendation[]> {
    const [catalog, patientData, existing] = await Promise.all([
      preventiveScreeningsRepo.listCatalog(admin),
      preventiveScreeningsRepo.findPatientData(admin, patientId),
      preventiveScreeningsRepo.listByPatient(admin, patientId),
    ])

    if (!patientData.birth_date || !patientData.gender) {
      logger.info('[preventiveScreeningsService] missing patient birth_date or gender, skipping recommendations')
      return []
    }

    const age = calculateAge(patientData.birth_date as ISODateString)
    const gender = patientData.gender as 'male' | 'female'
    const assignedIds = new Set(existing.map((s: { screening_id: string }) => s.screening_id))

    const recommendations: ScreeningRecommendation[] = []

    for (const row of catalog) {
      if (assignedIds.has(row.id)) continue
      const screening = row as unknown as PreventiveScreening
      if (!isScreeningApplicable(screening, age, gender)) continue

      recommendations.push({
        screening,
        is_due: true,
        urgency: screening.is_mandatory ? 'high' : 'medium',
        reason: screening.is_mandatory
          ? `Screening obligatorio para ${gender === 'female' ? 'mujeres' : 'hombres'} de ${age} años`
          : `Recomendado según guías de prevención`,
        next_due_date: null,
      })

      if (recommendations.length >= MAX_RECOMMENDATIONS) break
    }

    return recommendations
  },

  async scheduleScreening(
    admin: AdminClient,
    patientId: string,
    screeningId: string,
    scheduledDate: string,
  ) {
    logger.info(`[preventiveScreeningsService] scheduling screening=${screeningId} for patient=${patientId}`)

    return preventiveScreeningsRepo.upsertPatientScreening(admin, patientId, {
      screening_id: screeningId,
      status: 'scheduled',
      scheduled_date: scheduledDate,
    })
  },

  async completeScreening(
    admin: AdminClient,
    id: string,
    screeningId: string,
    resultSummary?: string,
  ) {
    const screeningDef = await preventiveScreeningsRepo.getScreeningById(admin, screeningId)
    const frequency = screeningDef.recommended_frequency as ScreeningFrequencyType
    const now = new Date()
    const nextDue = calculateNextDueDate(now, frequency)
    const nextDueDate = nextDue.getTime() === 0 ? null : nextDue.toISOString()

    logger.info(`[preventiveScreeningsService] completing screening id=${id}, next_due=${nextDueDate}`)

    return preventiveScreeningsRepo.updateStatus(admin, id, {
      status: 'completed',
      completed_date: now.toISOString(),
      next_due_date: nextDueDate,
      result_summary: resultSummary ?? null,
    })
  },

  async cancelScreening(admin: AdminClient, id: string) {
    logger.info(`[preventiveScreeningsService] cancelling screening id=${id}`)

    return preventiveScreeningsRepo.updateStatus(admin, id, {
      status: 'not_started',
      completed_date: null,
      next_due_date: null,
      result_summary: null,
    })
  },
}
