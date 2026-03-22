import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { AnamnesisExtractionRunInputSchema } from '@/lib/patients/lib/zod/anamnesis-extraction'
import type { AnamnesisClarificationTurn, AnamnesisSectionRecord } from '@/lib/patients/types/anamnesis-extraction'
import {
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
  buildAnamnesisExtractionRequest,
  buildAnamnesisExtractionSystemPrompt,
  executeAnamnesisExtraction,
  getAnamnesisExtractionModelName,
  getAnamnesisExtractionProviderName,
  getAnamnesisExtractionResponseSchema,
  isAnamnesisExtractionConfigured,
} from '@/lib/patients/server/anamnesis-ai-extraction'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function resolvePatientLabel(
  supabase: ReturnType<typeof createServerClientFromRequest>,
  userId: string,
): Promise<string> {
  let query = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle()

  if ((query.error && query.error.code !== 'PGRST116') || (!query.data && !query.error)) {
    query = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle()
  }

  if (query.error && query.error.code !== 'PGRST116') {
    logger.warn('[Anamnesis extract] Unable to resolve patient label', query.error)
    return 'Paciente autenticado'
  }

  const profile = query.data as { first_name?: string | null; last_name?: string | null } | null
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

  return fullName || 'Paciente autenticado'
}

async function loadAnamnesisContext(request: Request) {
  const context = await resolvePatientContext(request)

  if (!context) {
    return { error: json({ error: 'No autorizado' }, 401) }
  }

  const supabase = createServerClientFromRequest(request)

  const [{ data: anamnesisRow, error: anamnesisError }, patientLabel] = await Promise.all([
    supabase
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', context.patientId)
      .is('deleted_at', null)
      .maybeSingle(),
    resolvePatientLabel(supabase, context.userId),
  ])

  if (anamnesisError) {
    throw anamnesisError
  }

  const anamnesis = anamnesisRow as {
    id: string
    status: string
    privacy_accepted: boolean | null
  } | null

  if (!anamnesis) {
    return { error: json({ error: 'Anamnesis no encontrada' }, 404) }
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('anamnesis_sections')
    .select('section, data, completed, updated_at')
    .eq('anamnesis_id', anamnesis.id)
    .order('updated_at', { ascending: true })

  if (sectionsError) {
    throw sectionsError
  }

  return {
    context,
    patientLabel,
    anamnesis,
    sections: (sections ?? []) as AnamnesisSectionRecord[],
  }
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const resolved = await loadAnamnesisContext(request)
    if ('error' in resolved) {
      return resolved.error
    }

    const extractionRequest = buildAnamnesisExtractionRequest({
      patientId: resolved.context.patientId,
      patientLabel: resolved.patientLabel,
      anamnesisStatus: resolved.anamnesis.status,
      privacyAccepted: resolved.anamnesis.privacy_accepted === true,
      sections: resolved.sections,
    })

    return json({
      success: true,
      data: {
        providerConfigured: isAnamnesisExtractionConfigured(),
        providerName: getAnamnesisExtractionProviderName(),
        modelName: getAnamnesisExtractionModelName(),
        promptVersion: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
        systemPrompt: buildAnamnesisExtractionSystemPrompt(),
        responseSchema: getAnamnesisExtractionResponseSchema(),
        request: extractionRequest,
      },
    })
  } catch (error) {
    logger.error('[GET /api/patients/anamnesis/extract] Error', error)
    return json({ error: 'No fue posible preparar la extraccion estructurada de la anamnesis' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const resolved = await loadAnamnesisContext(request)
    if ('error' in resolved) {
      return resolved.error
    }

    const rawInput = await request.json().catch(() => ({}))
    const parsedInput = AnamnesisExtractionRunInputSchema.safeParse(rawInput)

    if (!parsedInput.success) {
      return json(
        {
          error: 'Las aclaraciones enviadas no cumplen el formato esperado',
          details: parsedInput.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      )
    }

    const extractionRequest = buildAnamnesisExtractionRequest({
      patientId: resolved.context.patientId,
      patientLabel: resolved.patientLabel,
      anamnesisStatus: resolved.anamnesis.status,
      privacyAccepted: resolved.anamnesis.privacy_accepted === true,
      sections: resolved.sections,
      clarificationTurns: (parsedInput.data.clarificationTurns ?? []) as AnamnesisClarificationTurn[],
    })

    if (!isAnamnesisExtractionConfigured()) {
      return json(
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
        503,
      )
    }

    const extraction = await executeAnamnesisExtraction(extractionRequest)

    return json({
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
    })
  } catch (error) {
    logger.error('[POST /api/patients/anamnesis/extract] Error', error)
    return json({ error: 'No fue posible ejecutar la extraccion estructurada de la anamnesis' }, 500)
  }
}
