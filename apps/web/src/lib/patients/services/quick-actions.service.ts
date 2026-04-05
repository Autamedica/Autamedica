/**
 * Service: Quick actions (vital signs, medications, symptoms, lab results, community posts).
 * Pure async functions for business logic called from useQuickActions sub-hooks.
 * No React dependencies. Delegates all DB operations to quickActionsRepo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { quickActionsRepo } from '../lib/repos/quick-actions.repo'

type Db = SupabaseClient<Database>

interface AuthenticatedPatientContext {
  userId: string
  patientId: string
}

async function resolveAuthenticatedPatientContext(supabase: Db): Promise<AuthenticatedPatientContext> {
  if (!supabase) throw new Error('Supabase client not available')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const patientId = await quickActionsRepo.resolvePatientId(supabase, user.id)
  if (!patientId) throw new Error('Perfil de paciente no encontrado')

  return { userId: user.id, patientId }
}

export const quickActionsService = {
  async logVitalSign(
    supabase: Db,
    vitalData: {
      systolic: number
      diastolic: number
      notes?: string
    },
  ): Promise<void> {
    const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase)
    const now = new Date().toISOString()

    await quickActionsRepo.insertVitalSign(supabase, {
      patient_id: patientId,
      recorded_by_id: userId,
      type: 'blood_pressure',
      blood_pressure_systolic: vitalData.systolic,
      blood_pressure_diastolic: vitalData.diastolic,
      unit: 'mmHg',
      notes: vitalData.notes,
      measurement_context: 'patient_self_report',
      measured_at: now,
      recorded_at: now,
    })
  },

  async logMedication(
    supabase: Db,
    medicationData: {
      medicationName: string
      dosage: string
      notes?: string
      status?: 'taken' | 'skipped' | 'late'
    },
  ): Promise<void> {
    const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase)

    await quickActionsRepo.insertMedicationLog(supabase, {
      patient_id: patientId,
      logged_by_id: userId,
      medication_name: medicationData.medicationName,
      dosage: medicationData.dosage,
      notes: medicationData.notes,
      status: medicationData.status ?? 'taken',
      taken_at: new Date().toISOString(),
    })
  },

  async reportSymptom(
    supabase: Db,
    symptomData: {
      symptomName: string
      severity: number
      description?: string
      duration?: string
      frequency?: string
      triggers?: string
      isUrgent?: boolean
      bodyLocation?: string
    },
  ): Promise<void> {
    const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase)

    await quickActionsRepo.insertSymptomReport(supabase, {
      patient_id: patientId,
      reported_by_id: userId,
      symptom_name: symptomData.symptomName,
      severity: symptomData.severity,
      description: symptomData.description,
      duration: symptomData.duration,
      frequency: symptomData.frequency,
      triggers: symptomData.triggers,
      is_urgent: symptomData.isUrgent ?? false,
      body_location: symptomData.bodyLocation,
      reported_at: new Date().toISOString(),
    })
  },

  async uploadLabResult(
    supabase: Db,
    labData: {
      testType: string
      testDate: string
      laboratoryName?: string
      fileUrl?: string
      fileType?: string
      notes?: string
    },
  ): Promise<void> {
    const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase)

    await quickActionsRepo.insertLabResult(supabase, {
      patient_id: patientId,
      uploaded_by_id: userId,
      test_type: labData.testType,
      test_date: labData.testDate,
      laboratory_name: labData.laboratoryName,
      file_url: labData.fileUrl,
      file_type: labData.fileType,
      notes: labData.notes,
      status: 'pending',
    })
  },

  async createCommunityPost(
    supabase: Db,
    postData: {
      groupId: string
      title: string
      content: string
      isAnonymous?: boolean
      tags?: string[]
    },
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autenticado')

    await quickActionsRepo.ensureGroupMembership(supabase, postData.groupId, user.id)

    await quickActionsRepo.insertCommunityPost(supabase, {
      group_id: postData.groupId,
      author_id: user.id,
      title: postData.title,
      content: postData.content,
      is_anonymous: postData.isAnonymous ?? false,
      tags: postData.tags ?? [],
      moderation_status: 'approved',
    })
  },
}
