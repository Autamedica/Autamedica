import { resolvePatientContext } from '@/app/api/shared/patient-context';
import { AnamnesisExtractionRunInputSchema } from '@/lib/zod/anamnesis-extraction';
import type { AnamnesisSectionRecord } from '@/types/anamnesis-extraction';
import {
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
  buildAnamnesisExtractionRequest,
  buildAnamnesisExtractionSystemPrompt,
  executeAnamnesisExtraction,
  getAnamnesisExtractionModelName,
  getAnamnesisExtractionProviderName,
  getAnamnesisExtractionResponseSchema,
  isAnamnesisExtractionConfigured,
} from '@/server/anamnesis-ai-extraction';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function resolvePatientLabel(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string,
): Promise<string> {
  let query = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();

  if ((query.error && query.error.code !== 'PGRST116') || (!query.data && !query.error)) {
    query = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle();
  }

  if (query.error && query.error.code !== 'PGRST116') {
    logger.warn('[Anamnesis extract] Unable to resolve patient label', query.error);
    return 'Paciente autenticado';
  }

  const profile = query.data as { first_name?: string | null; last_name?: string | null } | null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return fullName || 'Paciente autenticado';
}

async function loadAnamnesisContext() {
  const supabase = await createRouteHandlerClient();
  const context = await resolvePatientContext(supabase);

  if (!context) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  const [{ data: anamnesisRow, error: anamnesisError }, patientLabel] = await Promise.all([
    supabase
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', context.patientId)
      .is('deleted_at', null)
      .maybeSingle(),
    resolvePatientLabel(supabase, context.userId),
  ]);

  if (anamnesisError) {
    throw anamnesisError;
  }

  const anamnesis = anamnesisRow as {
    id: string;
    status: string;
    privacy_accepted: boolean | null;
  } | null;

  if (!anamnesis) {
    return { error: NextResponse.json({ error: 'Anamnesis no encontrada' }, { status: 404 }) };
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('anamnesis_sections')
    .select('section, data, completed, updated_at')
    .eq('anamnesis_id', anamnesis.id)
    .order('updated_at', { ascending: true });

  if (sectionsError) {
    throw sectionsError;
  }

  return {
    supabase,
    context,
    patientLabel,
    anamnesis,
    sections: (sections ?? []) as AnamnesisSectionRecord[],
  };
}

export async function GET() {
  try {
    const resolved = await loadAnamnesisContext();
    if ('error' in resolved) {
      return resolved.error;
    }

    const request = buildAnamnesisExtractionRequest({
      patientId: resolved.context.patientId,
      patientLabel: resolved.patientLabel,
      anamnesisStatus: resolved.anamnesis.status,
      privacyAccepted: resolved.anamnesis.privacy_accepted === true,
      sections: resolved.sections,
    });

    return NextResponse.json({
      success: true,
      data: {
        providerConfigured: isAnamnesisExtractionConfigured(),
        providerName: getAnamnesisExtractionProviderName(),
        modelName: getAnamnesisExtractionModelName(),
        promptVersion: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
        systemPrompt: buildAnamnesisExtractionSystemPrompt(),
        responseSchema: getAnamnesisExtractionResponseSchema(),
        request,
      },
    });
  } catch (error) {
    logger.error('[GET /api/anamnesis/extract] Error', error);
    return NextResponse.json(
      { error: 'No fue posible preparar la extraccion estructurada de la anamnesis' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const resolved = await loadAnamnesisContext();
    if ('error' in resolved) {
      return resolved.error;
    }

    const rawInput = await req.json().catch(() => ({}));
    const parsedInput = AnamnesisExtractionRunInputSchema.safeParse(rawInput);

    if (!parsedInput.success) {
      return NextResponse.json(
        {
          error: 'Las aclaraciones enviadas no cumplen el formato esperado',
          details: parsedInput.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const extractionRequest = buildAnamnesisExtractionRequest({
      patientId: resolved.context.patientId,
      patientLabel: resolved.patientLabel,
      anamnesisStatus: resolved.anamnesis.status,
      privacyAccepted: resolved.anamnesis.privacy_accepted === true,
      sections: resolved.sections,
      clarificationTurns: parsedInput.data.clarificationTurns ?? [],
    });

    if (!isAnamnesisExtractionConfigured()) {
      return NextResponse.json(
        {
          error: 'No hay un proveedor IA configurado para la extraccion de anamnesis',
          data: {
            providerConfigured: false,
            providerName: getAnamnesisExtractionProviderName(),
            modelName: getAnamnesisExtractionModelName(),
            promptVersion: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
            systemPrompt: buildAnamnesisExtractionSystemPrompt(),
            responseSchema: getAnamnesisExtractionResponseSchema(),
            request: extractionRequest,
          },
        },
        { status: 503 },
      );
    }

    const extraction = await executeAnamnesisExtraction(extractionRequest);

    return NextResponse.json({
      success: true,
      data: {
        providerConfigured: true,
        providerName: extraction.providerName,
        modelName: extraction.modelName,
        promptVersion: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
        systemPrompt: buildAnamnesisExtractionSystemPrompt(),
        responseSchema: getAnamnesisExtractionResponseSchema(),
        request: extractionRequest,
        result: extraction.result,
        rawResponse: extraction.rawResponse,
      },
    });
  } catch (error) {
    logger.error('[POST /api/anamnesis/extract] Error', error);
    return NextResponse.json(
      { error: 'No fue posible ejecutar la extraccion estructurada de la anamnesis' },
      { status: 500 },
    );
  }
}
