import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import {
  executePatientAiAnalysis,
  getPatientAiModelName,
  getPatientAiProviderName,
  getLatestPatientAiInsight,
  isPatientAiConfigured,
  persistPatientAiInsight,
} from '@/lib/patients/server/patient-ai-analysis'
import {
  buildPatientAiAnalysisRequest,
  buildPatientInsights,
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

    const supabase = createServerClientFromRequest(request)
    const insights = await buildPatientInsights(supabase, context.patientId)
    const analysisRequest = buildPatientAiAnalysisRequest(insights)
    const latestInsight = await getLatestPatientAiInsight(context.patientId)

    return json({
      success: true,
      data: {
        providerConfigured: isPatientAiConfigured(),
        providerName: getPatientAiProviderName(),
        modelName: getPatientAiModelName(),
        request: analysisRequest,
        latestInsight,
      },
    })
  } catch (error) {
    logger.error('[GET /api/patients/patient-ai-analysis] Error', error)
    return json({ error: 'No fue posible preparar el analisis IA del paciente' }, 500)
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
    const analysisRequest = buildPatientAiAnalysisRequest(insights)
    const providerName = getPatientAiProviderName()
    const modelName = getPatientAiModelName()

    if (!isPatientAiConfigured()) {
      return json(
        {
          error: 'No hay un proveedor IA configurado en el servidor',
          data: {
            providerConfigured: false,
            providerName: getPatientAiProviderName(),
            modelName: getPatientAiModelName(),
            request: analysisRequest,
          },
        },
        503,
      )
    }

    try {
      const result = await executePatientAiAnalysis(analysisRequest)
      await persistPatientAiInsight({
        patientId: context.patientId,
        request: analysisRequest,
        providerName: result.providerName,
        modelName: result.modelName,
        status: 'generated',
        result: result.result,
      })

      const latestInsight = await getLatestPatientAiInsight(context.patientId)

      return json({
        success: true,
        data: {
          providerConfigured: true,
          providerName: result.providerName,
          modelName: result.modelName,
          request: analysisRequest,
          insight: latestInsight,
        },
      })
    } catch (analysisError) {
      const message =
        analysisError instanceof Error
          ? analysisError.message
          : 'No fue posible ejecutar el analisis IA'

      await persistPatientAiInsight({
        patientId: context.patientId,
        request: analysisRequest,
        providerName: providerName ?? 'openai',
        modelName,
        status: 'failed',
        result: null,
        errorMessage: message,
      })

      return json(
        {
          error: message,
          data: {
            providerConfigured: true,
            providerName,
            modelName,
            request: analysisRequest,
          },
        },
        502,
      )
    }
  } catch (error) {
    logger.error('[POST /api/patients/patient-ai-analysis] Error', error)
    return json({ error: 'No fue posible ejecutar el analisis IA del paciente' }, 500)
  }
}
