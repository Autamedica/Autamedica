'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { ClinicalCaseState } from '../clinical-state/types'
import { computeTriage } from '../clinical-state/triage'
import { safeMerge } from '@/utils/safe-merge'

type Db = SupabaseClient<Database>

/**
 * Service for managing the Canonical Clinical Case State persistence.
 * 
 * Ensures that whenever a state is saved, its denormalized triage
 * and operational fields are correctly materialized in the DB for 
 * dashboarding and querying.
 */
export const clinicalStateService = {
  /**
   * Performs a robust upsert of the clinical case state.
   * Materializes all triage and operational fields for the clinician dashboard.
   */
  async persist(supabase: Db, state: ClinicalCaseState) {
    const triage = computeTriage(state)

    // Calculate metadata summary
    const missingFields = state.planner?.missingFieldKeys?.length || 0
    const conflictedFields = state.planner?.conflictedFieldKeys?.length || 0
    const lockedFields = state.planner?.lockedFieldKeys?.length || 0

    const { data, error } = await (supabase
      .from('clinical_case_states' as never) as unknown as { upsert: Function }).upsert({
        case_id: state.caseId,
        patient_id: state.patientId,
        workflow_type: state.workflow.type,
        current_segment: state.workflow.currentSegment,
        completed_segments: state.workflow.completedSegments,
        
        // Full JSONB blob
        state: state,
        
        // Integrity denormalization
        integrity_score: state.integrity.intakeIntegrityScore,
        integrity_status: state.integrity.stateSyncStatus,
        
        // Planner denormalization
        missing_field_count: missingFields,
        conflicted_field_count: conflictedFields,
        locked_field_count: lockedFields,
        
        // Triage & SLA Materialization (Senior requirements)
        clinical_vertical: triage.vertical,
        case_intent: triage.intent,
        triage_priority: triage.priority,
        triage_priority_rank: triage.priorityRank,
        triage_mandate: triage.mandate,
        triage_status: triage.status,
        risk_of_interruption: triage.riskOfInterruption,
        requires_same_day_action: triage.requiresSameDayAction,
        resolution_deadline_at: triage.resolutionDeadline,
        
        // Clinical Snapshot materialization (de-coupled from JSONB for list views)
        medication_snapshot_name: triage.medicationSnapshot?.name,
        medication_snapshot_dose: triage.medicationSnapshot?.dose,
        medication_snapshot_days_remaining: triage.medicationSnapshot?.daysRemaining,
        
        symptoms_snapshot_insomnia_severity: triage.symptomsSnapshot?.insomniaSeverity,
        symptoms_snapshot_insomnia_impact: triage.symptomsSnapshot?.insomniaImpact,
        
        updated_at: new Date().toISOString()
      }, { onConflict: 'case_id' })

    if (error) {
       console.error('[clinicalStateService] persist failed:', error)
       throw error
    }

    return data
  },

  /**
   * Safely merges partial updates into the current state and persists.
   * Prevents 'method not found' errors if specialized logic exists in the state object.
   */
  async patch(supabase: Db, patientId: string, partial: Partial<ClinicalCaseState>) {
    const current = await this.getByPatient(supabase, patientId)
    if (!current) {
      throw new Error(`[clinicalStateService] Cannot patch non-existent state for patient: ${patientId}`)
    }

    const merged = safeMerge(current, partial)
    return this.persist(supabase, merged)
  },

  /**
   * Retrieves a case state by patient ID.
   */
  async getByPatient(supabase: Db, patientId: string): Promise<ClinicalCaseState | null> {
    const { data, error } = await (supabase
      .from('clinical_case_states' as never) as unknown as { select: Function }).select('state')
      .eq('patient_id', patientId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[clinicalStateService] getByPatient failed:', error)
      return null
    }

    return (data as unknown as { state: ClinicalCaseState })?.state || null
  }
}
