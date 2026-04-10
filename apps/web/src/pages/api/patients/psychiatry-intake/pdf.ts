import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { captureSentryException } from '@/lib/observability/sentry'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { generatePsychiatryIntakePdf } from '@/lib/patients/services/psychiatry-intake-pdf-report.service'

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return jsonError('unauthorized', 401)

  let sentryCaptured = false
  const captureFailure = (
    error: unknown,
    stage: 'intake_fetch' | 'sections_fetch' | 'pdf_generation' | 'unhandled',
    extraContext: Record<string, unknown> = {},
  ) => {
    sentryCaptured = true
    captureSentryException(error, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: `api/patients/psychiatry-intake/pdf:${stage}`,
      owner: 'Clinical Web',
      tags: {
        route: '/api/patients/psychiatry-intake/pdf',
        method: 'GET',
        pdf_kind: 'psychiatry_intake',
        failure_stage: stage,
      },
      context: {
        patientId: context.patientId,
        userId: context.userId,
        ...extraContext,
      },
      fingerprint: ['psychiatry-intake-pdf', stage],
    })
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    logger.info('[psychiatry-intake/pdf] Starting report generation', { patientId: context.patientId })

    const { data: intake, error: intakeError } = await admin
      .from('psychiatry_intakes' as never)
      .select('id, completion_percentage, completed_at, updated_at')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (intakeError) {
      captureFailure(intakeError, 'intake_fetch')
      logger.error('[psychiatry-intake/pdf] intake fetch error', intakeError)
      return jsonError('db_error', 500)
    }

    if (!intake) {
      logger.warn('[psychiatry-intake/pdf] no intake found', {
        patientId: context.patientId,
        outcome: 'not_found',
        route: '/api/patients/psychiatry-intake/pdf',
      })
      return jsonError('no_psychiatry_intake', 404)
    }

    const { data: sections, error: sectionsError } = await admin
      .from('psychiatry_intake_sections' as never)
      .select('section, phase, data')
      .eq('intake_id', (intake as { id: string }).id)
      .order('updated_at', { ascending: true })

    if (sectionsError) {
      captureFailure(sectionsError, 'sections_fetch', {
        intakeId: (intake as { id: string }).id,
      })
      logger.error('[psychiatry-intake/pdf] sections fetch error', sectionsError)
      return jsonError('db_error_sections', 500)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', context.userId)
      .single()

    const { data: patientRow } = await admin
      .from('patients')
      .select('birth_date, gender')
      .eq('user_id', context.userId)
      .single()

    const { data: clinicalState } = await admin
      .from('clinical_case_states' as never)
      .select('state')
      .eq('case_id', (intake as { id: string }).id)
      .maybeSingle()

    const patientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Paciente'
    const patientAge = patientRow?.birth_date
      ? Math.floor((Date.now() - new Date(patientRow.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    const triage = (clinicalState as { state?: { triage?: unknown } } | null)?.state?.triage

    logger.info('[psychiatry-intake/pdf] running jsPDF generation')
    let pdfResult: ReturnType<typeof generatePsychiatryIntakePdf>
    try {
      pdfResult = generatePsychiatryIntakePdf({
        patient: {
          name: patientName,
          age: patientAge,
          gender: patientRow?.gender ?? null,
        },
        intake: {
          id: (intake as { id: string }).id,
          completionPercentage: (intake as { completion_percentage?: number }).completion_percentage ?? 0,
          completedAt: (intake as { completed_at?: string | null }).completed_at ?? null,
          updatedAt: (intake as { updated_at?: string | null }).updated_at ?? null,
        },
        sections: ((sections ?? []) as Array<{ section: string; phase: string; data: Record<string, unknown> }>),
        triage,
      })
    } catch (pdfError) {
      captureFailure(pdfError, 'pdf_generation', {
        intakeId: (intake as { id: string }).id,
        sectionsCount: Array.isArray(sections) ? sections.length : 0,
        hasTriage: Boolean(triage),
        triagePriority:
          typeof triage === 'object' && triage !== null && 'priority' in triage
            ? (triage as { priority?: unknown }).priority
            : undefined,
      })
      logger.error('[psychiatry-intake/pdf] generatePsychiatryIntakePdf THREW', pdfError)
      throw pdfError; // rethrow to outer catch
    }

    try {
      await admin.from('audit_logs').insert({
        user_id: context.userId,
        action: 'download_psychiatry_intake_pdf',
        resource_type: 'psychiatry_intake',
        resource_id: (intake as { id: string }).id,
        details: { filename: pdfResult.filename },
      } as never)
    } catch {
      logger.warn('[psychiatry-intake/pdf] audit log insert failed')
    }

    logger.info('[psychiatry-intake/pdf] Returning generated PDF', { filename: pdfResult.filename, size: pdfResult.buffer.byteLength })

    return new Response(pdfResult.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfResult.filename}"`,
        'Content-Length': String(pdfResult.buffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    if (!sentryCaptured) {
      captureFailure(error, 'unhandled')
    }
    logger.error('[psychiatry-intake/pdf] Unhandled exception during generation', error)
    return jsonError('pdf_generation_critical_failure', 500)
  }
}
