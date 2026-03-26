/**
 * API Controller: Download anamnesis as PDF.
 * Capa 5 — Auth + fetch data + delegate to pdf-report.service.
 *
 * GET /api/patients/anamnesis/pdf
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { anamnesisExtractionRepo } from '@/lib/patients/lib/repos/anamnesis-extraction.repo'
import { generateAnamnesisPdf } from '@/lib/patients/services/pdf-report.service'
import { logger } from '@autamedica/shared'

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

    // Fetch anamnesis
    const { data: anamnesis } = await admin
      .from('anamnesis')
      .select('id, status, completion_percentage, completed_at, created_at')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (!anamnesis) return jsonError('no_anamnesis', 404)

    // Fetch sections
    const { data: sections } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    // Fetch extraction (if exists)
    const extraction = await anamnesisExtractionRepo.getLatest(admin, anamnesis.id)

    // Fetch patient profile
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

    const patientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Paciente'
    const patientAge = patientRow?.birth_date
      ? Math.floor((Date.now() - new Date(patientRow.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    // Generate PDF
    const pdf = generateAnamnesisPdf({
      patient: {
        name: patientName,
        age: patientAge,
        gender: patientRow?.gender ?? null,
      },
      anamnesis: {
        id: anamnesis.id,
        completedAt: anamnesis.completed_at,
        completionPercentage: anamnesis.completion_percentage ?? 0,
      },
      extraction: extraction?.extraction_result as AnamnesisPdfExtraction ?? null,
      sections: (sections ?? []).map(s => ({
        section: s.section,
        data: (s.data ?? {}) as Record<string, unknown>,
        completed: s.completed ?? false,
      })),
    })

    // Audit log
    try {
      await admin.from('audit_logs').insert({
        user_id: context.userId,
        action: 'download_anamnesis_pdf',
        resource_type: 'anamnesis',
        resource_id: anamnesis.id,
        details: { filename: pdf.filename },
      } as never)
    } catch {
      logger.warn('[anamnesis/pdf] audit log insert failed')
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
  } catch (err) {
    logger.error('[anamnesis/pdf] generation failed', err)
    return jsonError('pdf_generation_failed', 500)
  }
}

// Type alias for the extraction shape expected by the PDF service
type AnamnesisPdfExtraction = Parameters<typeof generateAnamnesisPdf>[0]['extraction']
