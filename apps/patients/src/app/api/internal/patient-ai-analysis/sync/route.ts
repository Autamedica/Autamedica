import { timingSafeEqual } from 'node:crypto';
import { runPatientAiSyncCycle } from '@/server/patient-ai-analysis';
import { getServerEnvOrDefault, logger } from '@autamedica/shared';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const syncRequestSchema = z.object({
  patientId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  staleHours: z.number().positive().max(24 * 30).optional(),
  failedRetryMinutes: z.number().int().min(5).max(24 * 60).optional(),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

function hasValidSecret(request: NextRequest, expectedSecret: string): boolean {
  const bearer = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-autamedica-job-secret');
  const providedSecret =
    bearer?.toLowerCase().startsWith('bearer ') ? bearer.slice(7) : headerSecret;

  if (!providedSecret) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedSecret);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const jobSecret = getServerEnvOrDefault('PATIENT_AI_JOB_SECRET');
    if (!jobSecret) {
      return NextResponse.json(
        { error: 'PATIENT_AI_JOB_SECRET no está configurada en el servidor' },
        { status: 503 },
      );
    }

    if (!hasValidSecret(request, jobSecret)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let payload: unknown = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const parsed = syncRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Payload inválido para sincronización IA',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await runPatientAiSyncCycle(parsed.data);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[POST /api/internal/patient-ai-analysis/sync] Error', error);
    return NextResponse.json(
      { error: 'No fue posible ejecutar la sincronización interna de IA' },
      { status: 500 },
    );
  }
}
