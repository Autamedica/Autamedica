/**
 * API: Save Clinical Case State
 *
 * POST /api/patients/clinical-state/save
 * Body: { state: ClinicalCaseState }
 *
 * Persists the canonical clinical state for resume and server-side prompt building.
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { createClinicalStateAdapter } from '@/lib/patients/lib/repos/clinical-state.adapter'
import { logger } from '@autamedica/shared'
import type { ClinicalCaseState } from '@/lib/patients/clinical-state/types'
import { captureSentryException } from '@/lib/observability/sentry'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isValidState(state: unknown): state is ClinicalCaseState {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>
  return (
    typeof s.caseId === 'string' &&
    typeof s.patientId === 'string' &&
    typeof s.workflow === 'object' &&
    s.workflow !== null &&
    typeof s.integrity === 'object' &&
    s.integrity !== null
  )
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) {
    return json({ success: false, error: 'unauthorized' }, 401)
  }

  const raw = await request.json().catch(() => ({})) as Record<string, unknown>
  const state = raw.state as unknown

  if (!isValidState(state)) {
    return json({ success: false, error: 'invalid_state' }, 400)
  }

  // Security: enforce that the patient_id matches the authenticated user's patient
  if (state.patientId !== context.patientId) {
    logger.warn('[clinical-state/save] Patient ID mismatch', {
      statePatientId: state.patientId,
      contextPatientId: context.patientId,
    })
    return json({ success: false, error: 'patient_mismatch' }, 403)
  }

  try {
    const admin = createAstroAdminClient()
    const repo = createClinicalStateAdapter(admin)
    await repo.save(state)

    return json({
      success: true,
      data: {
        caseId: state.caseId,
        integrityScore: state.integrity?.intakeIntegrityScore ?? 100,
        integrityStatus: state.integrity?.stateSyncStatus ?? 'healthy',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    captureSentryException(err, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/patients/clinical-state/save:POST',
      owner: 'Clinical Web',
      context: {
        patientId: context.patientId,
        caseId: state.caseId,
      },
      tags: {
        route: '/api/patients/clinical-state/save',
        method: 'POST',
      },
    })
    logger.error('[clinical-state/save] Failed', { msg })
    return json({ success: false, error: 'save_failed' }, 500)
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) {
    return json({ success: false, error: 'unauthorized' }, 401)
  }

  try {
    const admin = createAstroAdminClient()
    const repo = createClinicalStateAdapter(admin)
    const state = await repo.loadByPatientId(context.patientId)

    return json({
      success: true,
      data: { state },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    captureSentryException(err, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/patients/clinical-state/save:GET',
      owner: 'Clinical Web',
      context: {
        patientId: context.patientId,
      },
      tags: {
        route: '/api/patients/clinical-state/save',
        method: 'GET',
      },
    })
    logger.error('[clinical-state/save] GET failed', { msg })
    return json({ success: false, error: 'load_failed' }, 500)
  }
}
