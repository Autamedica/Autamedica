/**
 * POST /api/patients/ai/intent
 *
 * Clasifica la intencion de un texto del paciente usando el
 * clasificador local basado en keywords (sin llamada a modelo externo).
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { intentClassifier } from '@/lib/patients/lib/ai/intent-classifier'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!text) {
      return json({ ok: false, error: 'text_required' }, 400)
    }

    const result = intentClassifier.classify(text)

    return json({
      ok: true,
      data: {
        intent: result.intent,
        confidence: result.confidence,
        score: result.confidence,
      },
    })
  } catch (err) {
    logger.error('[API] patients/ai/intent error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
