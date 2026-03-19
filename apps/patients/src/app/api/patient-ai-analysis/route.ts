import { resolvePatientContext } from '@/app/api/shared/patient-context';
import {
  executePatientAiAnalysis,
  getPatientAiModelName,
  getLatestPatientAiInsight,
  isPatientAiConfigured,
  persistPatientAiInsight,
} from '@/server/patient-ai-analysis';
import {
  buildPatientAiAnalysisRequest,
  buildPatientInsights,
  syncDeterministicAlerts,
} from '@/server/patient-insights';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const insights = await buildPatientInsights(supabase, context.patientId);
    const request = buildPatientAiAnalysisRequest(insights);
    const latestInsight = await getLatestPatientAiInsight(context.patientId);

    return NextResponse.json({
      success: true,
      data: {
        providerConfigured: isPatientAiConfigured(),
        modelName: getPatientAiModelName(),
        request,
        latestInsight,
      },
    });
  } catch (error) {
    logger.error('[GET /api/patient-ai-analysis] Error', error);
    return NextResponse.json(
      { error: 'No fue posible preparar el análisis IA del paciente' },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const insights = await buildPatientInsights(supabase, context.patientId);
    await syncDeterministicAlerts(context.patientId, insights.alerts);
    const request = buildPatientAiAnalysisRequest(insights);

    if (!isPatientAiConfigured()) {
      return NextResponse.json(
        {
          error: 'OPENAI_API_KEY no está configurada en el servidor',
          data: {
            providerConfigured: false,
            modelName: getPatientAiModelName(),
            request,
          },
        },
        { status: 503 },
      );
    }

    try {
      const result = await executePatientAiAnalysis(request);
      await persistPatientAiInsight({
        patientId: context.patientId,
        request,
        providerName: result.providerName,
        modelName: result.modelName,
        status: 'generated',
        result: result.result,
      });

      const latestInsight = await getLatestPatientAiInsight(context.patientId);

      return NextResponse.json({
        success: true,
        data: {
          providerConfigured: true,
          modelName: result.modelName,
          request,
          insight: latestInsight,
        },
      });
    } catch (analysisError) {
      const message =
        analysisError instanceof Error
          ? analysisError.message
          : 'No fue posible ejecutar el análisis IA';

      await persistPatientAiInsight({
        patientId: context.patientId,
        request,
        providerName: 'openai',
        modelName: getPatientAiModelName(),
        status: 'failed',
        result: null,
        errorMessage: message,
      });

      return NextResponse.json(
        {
          error: message,
          data: {
            providerConfigured: true,
            modelName: getPatientAiModelName(),
            request,
          },
        },
        { status: 502 },
      );
    }
  } catch (error) {
    logger.error('[POST /api/patient-ai-analysis] Error', error);
    return NextResponse.json(
      { error: 'No fue posible ejecutar el análisis IA del paciente' },
      { status: 500 },
    );
  }
}
