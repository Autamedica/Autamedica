/**
 * POST /api/patients/psychiatry/continuity-request
 * GET  /api/patients/psychiatry/continuity-request
 *
 * POST: Creates a continuity request (updates clinical_case_states).
 * GET:  Returns the current continuity request status.
 */
import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

interface ClinicalCaseRow {
  id: string
  case_intent: string
  triage_status: string
  triage_priority_rank: number
  clinical_vertical: string
  risk_of_interruption: string
  medication_snapshot_name: string | null
  medication_snapshot_dose: string | null
  medication_snapshot_days_remaining: number | null
  assigned_doctor_id: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  resolution_deadline_at: string | null
  created_at: string
  updated_at: string
}

// clinical_case_states was added via ALTER TABLE and isn't in the generated types yet.
// Use the admin client cast to `unknown` so Supabase doesn't try to resolve the table against Database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedAdmin(locals: App.Locals): { from: (table: string) => any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAstroAdminClient(locals.runtime?.env) as unknown as { from: (table: string) => any }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const admin = untypedAdmin(locals)

  try {
    const { data: caseState, error: findError } = await admin
      .from('clinical_case_states')
      .select('id, case_intent, triage_status, triage_priority_rank')
      .eq('patient_id', context.patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: Pick<ClinicalCaseRow, 'id' | 'case_intent' | 'triage_status' | 'triage_priority_rank'> | null; error: { message: string } | null }

    if (findError) {
      logger.error('[continuity-request/POST] Find failed', { error: findError.message })
      return internalError()
    }

    if (!caseState) return badRequest('no_clinical_case')
    if (caseState.triage_priority_rank <= 2) return badRequest('case_requires_clinical_review')

    const { error: updateError } = await admin
      .from('clinical_case_states')
      .update({ case_intent: 'continuity', triage_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', caseState.id)
      .eq('patient_id', context.patientId)

    if (updateError) {
      logger.error('[continuity-request/POST] Update failed', { error: updateError.message })
      return internalError()
    }

    return jsonOk({ caseStateId: caseState.id, status: 'fast_track_requested' })
  } catch (err) {
    logger.error('[continuity-request/POST]', err)
    return internalError()
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const admin = untypedAdmin(locals)

  try {
    const { data, error } = await admin
      .from('clinical_case_states')
      .select('id, case_intent, triage_status, triage_priority_rank, clinical_vertical, risk_of_interruption, medication_snapshot_name, medication_snapshot_dose, medication_snapshot_days_remaining, assigned_doctor_id, acknowledged_at, resolved_at, resolution_deadline_at, created_at, updated_at')
      .eq('patient_id', context.patientId)
      .in('case_intent', ['continuity', 'renewal', 'evaluation'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: ClinicalCaseRow | null; error: { message: string } | null }

    if (error) {
      logger.error('[continuity-request/GET] Query failed', { error: error.message })
      return internalError()
    }

    if (!data) return jsonOk({ status: 'none', request: null })

    return jsonOk({
      status: data.triage_status,
      request: {
        id: data.id,
        intent: data.case_intent,
        triageStatus: data.triage_status,
        priorityRank: data.triage_priority_rank,
        vertical: data.clinical_vertical,
        riskOfInterruption: data.risk_of_interruption,
        medication: data.medication_snapshot_name
          ? { name: data.medication_snapshot_name, dose: data.medication_snapshot_dose, daysRemaining: data.medication_snapshot_days_remaining }
          : null,
        assignedDoctorId: data.assigned_doctor_id,
        acknowledgedAt: data.acknowledged_at,
        resolvedAt: data.resolved_at,
        resolutionDeadline: data.resolution_deadline_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    })
  } catch (err) {
    logger.error('[continuity-request/GET]', err)
    return internalError()
  }
}
