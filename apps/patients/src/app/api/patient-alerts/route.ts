import { resolvePatientContext } from '@/app/api/shared/patient-context';
import {
  buildPatientInsights,
  listPersistedDerivedAlerts,
  syncDeterministicAlerts,
} from '@/server/patient-insights';
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

    const data = await listPersistedDerivedAlerts(context.patientId);

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logger.error('[GET /api/patient-alerts] Error', error);
    return NextResponse.json(
      { error: 'No fue posible cargar las alertas del paciente' },
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
    const data = await listPersistedDerivedAlerts(context.patientId);

    return NextResponse.json({
      success: true,
      data: {
        syncedAt: new Date().toISOString(),
        alerts: data ?? [],
      },
    });
  } catch (error) {
    logger.error('[POST /api/patient-alerts] Error', error);
    return NextResponse.json(
      { error: 'No fue posible sincronizar las alertas del paciente' },
      { status: 500 },
    );
  }
}
