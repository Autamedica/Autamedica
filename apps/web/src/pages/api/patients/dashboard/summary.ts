import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { getLatestPatientAiInsight } from '@/lib/patients/server/patient-ai-analysis'
import { buildPatientInsights } from '@/lib/patients/server/patient-insights'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabase = createServerClientFromRequest(request)
    const insights = await buildPatientInsights(supabase, context.patientId)
    const latestInsight = await getLatestPatientAiInsight(context.patientId)

    return json({
      success: true,
      data: {
        summary: insights.summary,
        alerts: insights.alerts,
        missingSections: insights.snapshot.missingSections,
        latestInsight,
      },
    })
  } catch (error) {
    logger.error('[GET /api/patients/dashboard/summary] Error', error)
    return json({ error: 'No fue posible cargar el resumen del paciente' }, 500)
  }
}
