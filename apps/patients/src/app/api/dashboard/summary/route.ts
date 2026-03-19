import { resolvePatientContext } from '@/app/api/shared/patient-context';
import { getLatestPatientAiInsight } from '@/server/patient-ai-analysis';
import { buildPatientInsights } from '@/server/patient-insights';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const insights = await buildPatientInsights(supabase, context.patientId);
    const latestInsight = await getLatestPatientAiInsight(context.patientId);

    return NextResponse.json({
      success: true,
      data: {
        summary: insights.summary,
        alerts: insights.alerts,
        missingSections: insights.snapshot.missingSections,
        latestInsight,
      },
    });
  } catch (error) {
    logger.error('[GET /api/dashboard/summary] Error', error);
    return NextResponse.json(
      { error: 'No fue posible cargar el resumen del paciente' },
      { status: 500 },
    );
  }
}
