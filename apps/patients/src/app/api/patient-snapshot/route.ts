import { resolvePatientContext } from '@/app/api/shared/patient-context';
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
    return NextResponse.json({ success: true, data: insights });
  } catch (error) {
    logger.error('[GET /api/patient-snapshot] Error', error);
    return NextResponse.json(
      { error: 'No fue posible generar el snapshot del paciente' },
      { status: 500 },
    );
  }
}
