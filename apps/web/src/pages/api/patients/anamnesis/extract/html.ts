import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { buildAnamnesisExtractionHtml } from '@/lib/patients/server/anamnesis-extraction-html'
import type { AnamnesisSectionRecord } from '@/lib/patients/types/anamnesis-extraction'
import {
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
  buildAnamnesisExtractionRequest,
  executeAnamnesisExtraction,
  getAnamnesisExtractionModelName,
  isAnamnesisExtractionConfigured,
} from '@/lib/patients/server/anamnesis-ai-extraction'

function buildHtmlMessagePage(input: { title: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        background: #f5f1e8;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1c1917;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        background: white;
        padding: 32px;
        border-radius: 20px;
        box-shadow: 0 18px 40px rgba(28, 25, 23, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 32px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: #44403c;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${input.title}</h1>
      <p>${input.body}</p>
    </main>
  </body>
</html>`
}

function htmlResponse(html: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...headers,
    },
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
    logger.warn('[Anamnesis extract html] Unable to resolve patient label', query.error)
    return 'Paciente autenticado'
  }

  const profile = query.data as { first_name?: string | null; last_name?: string | null } | null
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

  return fullName || 'Paciente autenticado'
}

async function loadAnamnesisContext(request: Request) {
  const context = await resolvePatientContext(request)

  if (!context) {
    return {
      error: htmlResponse(
        buildHtmlMessagePage({
          title: 'No autorizado',
          body: 'Debe iniciar sesion para inspeccionar la salida estructurada de la anamnesis.',
        }),
        401,
      ),
    }
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
    return {
      error: htmlResponse(
        buildHtmlMessagePage({
          title: 'Anamnesis no encontrada',
          body: 'No existe una anamnesis disponible para renderizar la vista HTML del extractor.',
        }),
        404,
      ),
    }
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

    if (!isAnamnesisExtractionConfigured()) {
      return htmlResponse(
        buildHtmlMessagePage({
          title: 'Proveedor IA no configurado',
          body: `No hay un proveedor configurado para ejecutar el extractor. Prompt actual: ${ANAMNESIS_EXTRACTION_PROMPT_VERSION}. Modelo resuelto: ${getAnamnesisExtractionModelName()}.`,
        }),
        503,
        { 'Cache-Control': 'no-store' },
      )
    }

    const extraction = await executeAnamnesisExtraction(extractionRequest)
    const html = buildAnamnesisExtractionHtml({
      patientLabel: resolved.patientLabel,
      providerName: extraction.providerName,
      modelName: extraction.modelName,
      promptVersion: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
      request: extractionRequest,
      result: extraction.result,
    })

    return htmlResponse(html, 200, {
      'Content-Disposition': 'inline; filename="anamnesis-extract.html"',
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    logger.error('[GET /api/patients/anamnesis/extract/html] Error', error)
    return htmlResponse(
      buildHtmlMessagePage({
        title: 'Error interno',
        body: 'No fue posible renderizar la vista HTML del extractor de anamnesis.',
      }),
      500,
    )
  }
}
