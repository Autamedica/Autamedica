/**
 * Repository: quick-actions DB queries.
 * Covers vital_signs, medication_logs, symptom_reports, lab_results,
 * group_memberships, and community_posts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export const quickActionsRepo = {
  async resolvePatientId(supabase: Db, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[quickActionsRepo] resolvePatientId failed', error)
      throw error
    }

    return data?.id ?? null
  },

  async insertVitalSign(supabase: Db, record: {
    patient_id: string
    recorded_by_id: string
    type: string
    blood_pressure_systolic: number
    blood_pressure_diastolic: number
    unit: string
    notes?: string
    measurement_context: string
    measured_at: string
    recorded_at: string
  }): Promise<void> {
    const { error } = await supabase.from('vital_signs').insert(record)
    if (error) {
      logger.error('[quickActionsRepo] insertVitalSign failed', error)
      throw error
    }
  },

  async insertMedicationLog(supabase: Db, record: {
    patient_id: string
    logged_by_id: string
    medication_name: string
    dosage: string
    notes?: string
    status: string
    taken_at: string
  }): Promise<void> {
    const { error } = await supabase.from('medication_logs').insert(record)
    if (error) {
      logger.error('[quickActionsRepo] insertMedicationLog failed', error)
      throw error
    }
  },

  async insertSymptomReport(supabase: Db, record: {
    patient_id: string
    reported_by_id: string
    symptom_name: string
    severity: number
    description?: string
    duration?: string
    frequency?: string
    triggers?: string
    is_urgent: boolean
    body_location?: string
    reported_at: string
  }): Promise<void> {
    const { error } = await supabase.from('symptom_reports').insert(record)
    if (error) {
      logger.error('[quickActionsRepo] insertSymptomReport failed', error)
      throw error
    }
  },

  async insertLabResult(supabase: Db, record: {
    patient_id: string
    uploaded_by_id: string
    test_type: string
    test_date: string
    laboratory_name?: string
    file_url?: string
    file_type?: string
    notes?: string
    status: string
  }): Promise<void> {
    const { error } = await supabase.from('lab_results').insert(record)
    if (error) {
      logger.error('[quickActionsRepo] insertLabResult failed', error)
      throw error
    }
  },

  async ensureGroupMembership(supabase: Db, groupId: string, userId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: membership } = await (supabase as any)
      .from('group_memberships')
      .select('id')
      .eq('group_id', groupId)
      .eq('patient_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('group_memberships')
        .insert({
          group_id: groupId,
          patient_id: userId,
          role: 'member',
          status: 'active',
        })
    }
  },

  async insertCommunityPost(supabase: Db, record: {
    group_id: string
    author_id: string
    title: string
    content: string
    is_anonymous: boolean
    tags: string[]
    moderation_status: string
  }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('community_posts')
      .insert(record)
    if (error) {
      logger.error('[quickActionsRepo] insertCommunityPost failed', error)
      throw error
    }
  },
}
