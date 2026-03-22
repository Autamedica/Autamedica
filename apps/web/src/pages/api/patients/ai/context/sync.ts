/**
 * POST /api/patients/ai/context/sync
 *
 * Reconstruye y persiste los archivos de contexto del paciente
 * en Supabase Storage (profile.json, patient.json, context.json, summary.md).
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import {
  buildPatientContext,
  persistPatientContextFiles,
  getAdminClient,
} from '@/lib/patients/lib/ai/context-builder'

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

    const admin = await getAdminClient()
    const ctx = await buildPatientContext(userId, admin)
    const persisted = await persistPatientContextFiles(userId, ctx, admin)

    return json({
      ok: true,
      data: {
        summary: ctx.summary,
        storage: persisted,
      },
    })
  } catch (err) {
    logger.error('[API] patients/ai/context/sync error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
