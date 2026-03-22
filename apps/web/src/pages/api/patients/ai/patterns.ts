/**
 * GET/POST /api/patients/ai/patterns
 *
 * GET  - Devuelve patrones personalizados y FAQs del usuario.
 * POST - Inserta un nuevo patron o FAQ para el usuario.
 *
 * Las tablas ai_user_patterns y ai_user_faq pueden no existir aun;
 * en ese caso se devuelven arrays vacios en GET y se ignora el error en POST.
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

export const GET: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)

    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const admin = createAdminClient()

    const [patternsResult, faqsResult] = await Promise.all([
      Promise.resolve(admin
        .from('ai_user_patterns')
        .select('*')
        .eq('user_id', userId))
        .catch(() => ({ data: null, error: { message: 'table_not_found' } })),
      Promise.resolve(admin
        .from('ai_user_faq')
        .select('*')
        .eq('user_id', userId))
        .catch(() => ({ data: null, error: { message: 'table_not_found' } })),
    ])

    const patterns = Array.isArray(patternsResult.data) ? patternsResult.data : []
    const faqs = Array.isArray(faqsResult.data) ? faqsResult.data : []

    return json({ ok: true, data: { patterns, faqs } })
  } catch (err) {
    logger.error('[API] patients/ai/patterns GET error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)

    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const type = typeof body.type === 'string' ? body.type : ''

    const admin = createAdminClient()

    if (type === 'pattern') {
      const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : ''
      const intent = typeof body.intent === 'string' ? body.intent.trim() : ''

      if (!pattern || !intent) {
        return json({ ok: false, error: 'pattern_and_intent_required' }, 400)
      }

      const { error } = await admin.from('ai_user_patterns').insert({
        user_id: userId,
        pattern,
        intent,
      } as never)

      if (error) {
        logger.warn('[API] patients/ai/patterns insert pattern failed', error)
      }

      return json({ ok: true })
    }

    if (type === 'faq') {
      const question = typeof body.question === 'string' ? body.question.trim() : ''
      const answer = typeof body.answer === 'string' ? body.answer.trim() : ''

      if (!question || !answer) {
        return json({ ok: false, error: 'question_and_answer_required' }, 400)
      }

      const { error } = await admin.from('ai_user_faq').insert({
        user_id: userId,
        question,
        answer,
      } as never)

      if (error) {
        logger.warn('[API] patients/ai/patterns insert faq failed', error)
      }

      return json({ ok: true })
    }

    return json({ ok: false, error: 'invalid_type' }, 400)
  } catch (err) {
    logger.error('[API] patients/ai/patterns POST error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
