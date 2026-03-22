import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import {
  buildPatientInsights,
  listPersistedDerivedAlerts,
  syncDeterministicAlerts,
} from '@/lib/patients/server/patient-insights'

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

    const data = await listPersistedDerivedAlerts(context.patientId)

    return json({ success: true, data: data ?? [] })
  } catch (error) {
    logger.error('[GET /api/patients/patient-alerts] Error', error)
    return json({ error: 'No fue posible cargar las alertas del paciente' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabase = createServerClientFromRequest(request)
    const insights = await buildPatientInsights(supabase, context.patientId)
    await syncDeterministicAlerts(context.patientId, insights.alerts)
    const data = await listPersistedDerivedAlerts(context.patientId)

    return json({
      success: true,
      data: {
        syncedAt: new Date().toISOString(),
        alerts: data ?? [],
      },
    })
  } catch (error) {
    logger.error('[POST /api/patients/patient-alerts] Error', error)
    return json({ error: 'No fue posible sincronizar las alertas del paciente' }, 500)
  }
}
