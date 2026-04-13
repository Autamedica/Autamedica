/**
 * Clinical Case State — Supabase Adapter
 *
 * Persistence layer for the canonical clinical state.
 * Handles load, save (upsert), and snapshot retrieval.
 *
 * NOTE: `clinical_case_states` is newer than the generated shared Database
 * type. We extend the local table map here so the repository stays fully
 * typed until the generator catches up.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { ClinicalCaseState } from '@/lib/patients/clinical-state/types'

export interface IClinicalStateRepository {
  loadByCaseId(caseId: string): Promise<ClinicalCaseState | null>
  loadByPatientId(patientId: string): Promise<ClinicalCaseState | null>
  save(state: ClinicalCaseState): Promise<void>
  deleteByCaseId(caseId: string): Promise<void>
}

type ClinicalCaseStateRow = {
  id: string
  case_id: string
  patient_id: string
  workflow_type: string
  current_segment: string
  completed_segments: string[]
  state: Json
  integrity_score: number
  integrity_status: 'healthy' | 'degraded' | 'broken'
  missing_field_count: number
  conflicted_field_count: number
  locked_field_count: number
  clinical_vertical: string
  case_intent: string
  triage_priority: string
  triage_priority_rank: number
  triage_mandate: string | null
  triage_status: string
  risk_of_interruption: string
  requires_same_day_action: boolean
  resolution_deadline_at: string | null
  medication_snapshot_name: string | null
  medication_snapshot_dose: string | null
  medication_snapshot_days_remaining: number | null
  symptoms_snapshot_insomnia_severity: number | null
  symptoms_snapshot_insomnia_impact: string | null
  created_at: string
  updated_at: string
}

type ClinicalCaseStateInsert = Omit<ClinicalCaseStateRow, 'id' | 'created_at' | 'updated_at'>
type ClinicalCaseStateUpdate = Partial<ClinicalCaseStateInsert>

type ClinicalStateDatabase = Database & {
  public: Database['public'] & {
    Tables: Database['public']['Tables'] & {
      clinical_case_states: {
        Row: ClinicalCaseStateRow
        Insert: ClinicalCaseStateInsert
        Update: ClinicalCaseStateUpdate
        Relationships: []
      }
    }
  }
}

type Db = SupabaseClient<ClinicalStateDatabase>

/**
 * Create a repository for persisting ClinicalCaseState to Supabase.
 */
export function createClinicalStateAdapter(supabase: Db): IClinicalStateRepository {
  return {
    async loadByCaseId(caseId: string): Promise<ClinicalCaseState | null> {
      const { data, error } = await supabase
        .from('clinical_case_states')
        .select('state')
        .eq('case_id', caseId)
        .maybeSingle()

      if (error) {
        logger.error('[ClinicalStateAdapter] loadByCaseId failed', { caseId, error })
        return null
      }

      if (!data?.state) {
        return null
      }

      return data.state as unknown as ClinicalCaseState
    },

    async loadByPatientId(patientId: string): Promise<ClinicalCaseState | null> {
      const { data, error } = await supabase
        .from('clinical_case_states')
        .select('state')
        .eq('patient_id', patientId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        logger.error('[ClinicalStateAdapter] loadByPatientId failed', { patientId, error })
        return null
      }

      if (!data?.state) {
        return null
      }

      return data.state as unknown as ClinicalCaseState
    },

    async save(state: ClinicalCaseState): Promise<void> {
      const triage = state.triage
      const triageAny = triage as Record<string, unknown> | undefined
      const medSnap = triageAny?.medicationSnapshot as Record<string, unknown> | undefined
      const symSnap = triageAny?.symptomsSnapshot as Record<string, unknown> | undefined

      const row: ClinicalCaseStateInsert = {
        case_id: state.caseId,
        patient_id: state.patientId,
        workflow_type: state.workflow.type,
        current_segment: state.workflow.currentSegment,
        completed_segments: state.workflow.completedSegments,
        state: state as unknown as Json,
        integrity_score: state.integrity?.intakeIntegrityScore ?? 100,
        integrity_status: state.integrity?.stateSyncStatus ?? 'healthy',
        missing_field_count: state.planner?.missingFieldKeys?.length ?? 0,
        conflicted_field_count: state.planner?.conflictedFieldKeys?.length ?? 0,
        locked_field_count: state.planner?.lockedFieldKeys?.length ?? 0,
        clinical_vertical: state.workflow.vertical ?? 'psychiatry_general',
        case_intent: state.workflow.intent ?? 'evaluation',
        triage_priority: triage?.priority ?? 'routine',
        triage_priority_rank: triage?.priority === 'urgent' ? 1 : triage?.priority === 'priority' ? 2 : 3,
        triage_mandate: triage?.mandate || null,
        triage_status: triage?.status ?? 'pending',
        risk_of_interruption: triage?.riskOfInterruption ?? 'low',
        requires_same_day_action: triage?.requiresSameDayAction ?? false,
        resolution_deadline_at: triage?.resolutionDeadline ?? null,
        medication_snapshot_name: (medSnap?.name as string) || null,
        medication_snapshot_dose: (medSnap?.dose as string) || null,
        medication_snapshot_days_remaining: typeof medSnap?.daysRemaining === 'number' ? medSnap.daysRemaining : null,
        symptoms_snapshot_insomnia_severity: typeof symSnap?.insomniaSeverity === 'number' ? symSnap.insomniaSeverity : null,
        symptoms_snapshot_insomnia_impact: (symSnap?.insomniaImpact as string) || null,
      }

      const { error } = await supabase
        .from('clinical_case_states')
        .upsert(row, { onConflict: 'case_id' })

      if (error) {
        logger.error('[ClinicalStateAdapter] save failed', {
          caseId: state.caseId,
          error,
        })
        throw new Error(`Failed to save clinical state: ${error.message}`)
      }

      logger.info('[ClinicalStateAdapter] Saved', {
        caseId: state.caseId,
        integrityScore: state.integrity.intakeIntegrityScore,
        missingFields: state.planner.missingFieldKeys.length,
      })
    },

    async deleteByCaseId(caseId: string): Promise<void> {
      const { error } = await supabase
        .from('clinical_case_states')
        .delete()
        .eq('case_id', caseId)

      if (error) {
        logger.error('[ClinicalStateAdapter] deleteByCaseId failed', {
          caseId,
          error,
        })
        throw new Error(`Failed to delete clinical state: ${error.message}`)
      }
    },
  }
}
