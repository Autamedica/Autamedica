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
import { ExtractInputSchema } from '@/lib/patients/lib/zod/anamnesis'

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
  const raw = await request.json().catch(() => ({}))
  const parsed = ExtractInputSchema.safeParse(raw)
  if (!parsed.success) {
    return json({ success: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' }, 400)
  }

  const { checkpoint, clarificationTurns } = parsed.data

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

    // Execute extraction (Capa 6) — 30s timeout
    const extractionTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('extraction_timeout')), 30_000),
    )
    const result = await Promise.race([extractionTimeout, anamnesisExtractionService.execute(admin, {
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
      clarificationTurns: clarificationTurns as AnamnesisClarificationTurn[],
      checkpoint,
    })])

    logger.info('[anamnesis/extract] Extraction completed', {
      checkpoint,
      extractionId: result.extractionId,
      hasCritical: result.hasCriticalQuestions,
      questionsCount: result.guidance.nextQuestions.length,
    })

    return json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'extraction_failed'
    if (message === 'extraction_timeout') {
      logger.warn('[anamnesis/extract] Timeout after 30s', { checkpoint })
      return json({ success: false, error: 'extraction_timeout' }, 504)
    }
    logger.error('[anamnesis/extract] Failed', err)
    return json({ success: false, error: message }, 500)
  }
}
