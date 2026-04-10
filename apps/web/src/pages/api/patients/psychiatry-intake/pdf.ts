import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
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

  try {
    const admin = createAstroAdminClient()

    const { data: intake } = await admin
      .from('psychiatry_intakes' as never)
      .select('id, completion_percentage, completed_at, updated_at')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (!intake) return jsonError('no_psychiatry_intake', 404)

    const { data: sections } = await admin
      .from('psychiatry_intake_sections' as never)
      .select('section, phase, data')
      .eq('intake_id', (intake as { id: string }).id)
      .order('updated_at', { ascending: true })

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

    const pdf = generatePsychiatryIntakePdf({
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
      triage: (clinicalState as { state: any })?.state?.triage,
    })

    try {
      await admin.from('audit_logs').insert({
        user_id: context.userId,
        action: 'download_psychiatry_intake_pdf',
        resource_type: 'psychiatry_intake',
        resource_id: (intake as { id: string }).id,
        details: { filename: pdf.filename },
      } as never)
    } catch {
      logger.warn('[psychiatry-intake/pdf] audit log insert failed')
    }

    return new Response(pdf.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Content-Length': String(pdf.buffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    logger.error('[psychiatry-intake/pdf] generation failed', error)
    return jsonError('pdf_generation_failed', 500)
  }
}
