/**
 * Service: Quick actions (vital signs, medications, symptoms, lab results, community posts).
 * Pure async functions for DB operations called from useQuickActions sub-hooks.
 * No React dependencies.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

/**
 * Untyped client for tables not yet in generated Database types
 * (group_memberships, community_posts). Safe: queries validated at runtime by PostgREST.
 */
type UntypedDb = SupabaseClient

interface AuthenticatedPatientContext {
  userId: string
  patientId: string
}

async function resolveAuthenticatedPatientContext(supabase: Db): Promise<AuthenticatedPatientContext> {
  if (!supabase) throw new Error('Supabase client not available')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('No autenticado')
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (patientError) {
    throw patientError
  }

  if (!patient?.id) {
    throw new Error('Perfil de paciente no encontrado')
  }

  return {
    userId: user.id,
    patientId: patient.id,
  }
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

    const { error: insertError } = await supabase
      .from('vital_signs')
      .insert({
        patient_id: patientId,
        recorded_by_id: userId,
        type: 'blood_pressure',
        blood_pressure_systolic: vitalData.systolic,
        blood_pressure_diastolic: vitalData.diastolic,
        unit: 'mmHg',
        notes: vitalData.notes,
        measurement_context: 'patient_self_report',
        measured_at: new Date().toISOString(),
        recorded_at: new Date().toISOString(),
      })

    if (insertError) {
      logger.error('[quickActionsService] logVitalSign failed', insertError)
      throw insertError
    }
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

    const { error: insertError } = await supabase
      .from('medication_logs')
      .insert({
        patient_id: patientId,
        logged_by_id: userId,
        medication_name: medicationData.medicationName,
        dosage: medicationData.dosage,
        notes: medicationData.notes,
        status: medicationData.status ?? 'taken',
        taken_at: new Date().toISOString(),
      })

    if (insertError) {
      logger.error('[quickActionsService] logMedication failed', insertError)
      throw insertError
    }
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

    const { error: insertError } = await supabase
      .from('symptom_reports')
      .insert({
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

    if (insertError) {
      logger.error('[quickActionsService] reportSymptom failed', insertError)
      throw insertError
    }
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

    const { error: insertError } = await supabase
      .from('lab_results')
      .insert({
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

    if (insertError) {
      logger.error('[quickActionsService] uploadLabResult failed', insertError)
      throw insertError
    }
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

    const { data: membership } = await (supabase as unknown as UntypedDb)
      .from('group_memberships')
      .select('id')
      .eq('group_id', postData.groupId)
      .eq('patient_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership) {
      await (supabase as unknown as UntypedDb)
        .from('group_memberships')
        .insert({
          group_id: postData.groupId,
          patient_id: user.id,
          role: 'member',
          status: 'active',
        })
    }

    const { error: insertError } = await (supabase as unknown as UntypedDb)
      .from('community_posts')
      .insert({
        group_id: postData.groupId,
        author_id: user.id,
        title: postData.title,
        content: postData.content,
        is_anonymous: postData.isAnonymous ?? false,
        tags: postData.tags ?? [],
        moderation_status: 'approved',
      })

    if (insertError) {
      logger.error('[quickActionsService] createCommunityPost failed', insertError)
      throw insertError
    }
  },
}
