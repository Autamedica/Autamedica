/**
 * API Controller: Trigger anamnesis AI extraction.
 * Capa 5 — Validates auth, validates input, delegates to service.
 *
 * POST /api/patients/anamnesis/extract
 * Body: { checkpoint: 'partial'|'final', clarificationTurns?: [] }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { anamnesisExtractionService } from '@/lib/patients/services/anamnesis-extraction.service'
import { logger } from '@autamedica/shared'
import type { AnamnesisClarificationTurn } from '@/lib/patients/types/anamnesis-extraction'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  // Validate input
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const checkpoint = body.checkpoint as string
  if (checkpoint !== 'partial' && checkpoint !== 'final') {
    return json({ success: false, error: 'invalid_checkpoint' }, 400)
  }

  const clarificationTurns = Array.isArray(body.clarificationTurns)
    ? body.clarificationTurns as AnamnesisClarificationTurn[]
    : []

  if (!anamnesisExtractionService.isConfigured()) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  try {
    const admin = createAstroAdminClient()

    // Fetch anamnesis + sections for this patient
    const { data: anamnesis } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (!anamnesis) {
      return json({ success: false, error: 'no_anamnesis' }, 404)
    }

    const { data: sections } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    if (!sections || sections.length === 0) {
      return json({ success: false, error: 'no_sections' }, 400)
    }

    // Fetch patient profile for label
    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', context.userId)
      .single()

    const patientLabel = [profile?.first_name, profile?.last_name]
      .filter(Boolean).join(' ') || 'Paciente'

    // Execute extraction (Capa 6)
    const result = await anamnesisExtractionService.execute(admin, {
      patientId: context.patientId,
      patientLabel,
      anamnesisId: anamnesis.id,
      anamnesisStatus: anamnesis.status ?? 'in_progress',
      privacyAccepted: anamnesis.privacy_accepted ?? false,
      sections: sections.map(s => ({
        section: s.section,
        data: s.data,
        completed: s.completed ?? false,
      })),
      clarificationTurns,
      checkpoint,
    })

    logger.info('[anamnesis/extract] Extraction completed', {
      checkpoint,
      extractionId: result.extractionId,
      hasCritical: result.hasCriticalQuestions,
      questionsCount: result.guidance.nextQuestions.length,
    })

    return json({ success: true, data: result })
  } catch (err) {
    logger.error('[anamnesis/extract] Failed', err)
    const message = err instanceof Error ? err.message : 'extraction_failed'
    return json({ success: false, error: message }, 500)
  }
}
