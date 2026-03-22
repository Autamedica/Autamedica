/**
 * POST /api/patients/ai/telemetry
 *
 * Registra telemetria de interacciones del chat de IA del paciente.
 * Inserta en patient_ai_chats; si la tabla no existe se ignora el error.
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAdminClient } from '@autamedica/auth/server'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)

    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : ''
    const intent = typeof body.intent === 'string' ? body.intent.slice(0, 100) : ''
    const confidence = typeof body.confidence === 'number' ? body.confidence : 0
    const usedPattern = typeof body.usedPattern === 'boolean' ? body.usedPattern : false
    const replyPreview = typeof body.replyPreview === 'string' ? body.replyPreview.slice(0, 500) : ''

    const admin = createAdminClient()

    const { error } = await admin.from('patient_ai_chats').insert({
      user_id: userId,
      message,
      intent,
      confidence,
      used_pattern: usedPattern,
      reply_preview: replyPreview,
      created_at: new Date().toISOString(),
    } as never)

    if (error) {
      logger.warn('[API] patients/ai/telemetry insert failed (table may not exist)', error)
    }

    return json({ ok: true })
  } catch (err) {
    logger.error('[API] patients/ai/telemetry error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
