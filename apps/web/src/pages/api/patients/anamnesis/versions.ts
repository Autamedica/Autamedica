/**
 * API Controller: Anamnesis versions (history).
 * GET /api/patients/anamnesis/versions -- list all versions
 * POST /api/patients/anamnesis/versions -- create new version (manual update)
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { anamnesisVersionService } from '@/lib/patients/services/anamnesis-version.service'
import { createAnamnesisAdapter } from '@/lib/patients/lib/repos/anamnesis.adapter'
import { logger } from '@autamedica/shared'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient()
    const anamnesisRepo = createAnamnesisAdapter(admin)
    const anamnesis = await anamnesisRepo.findByPatient(context.patientId)
    if (!anamnesis) return jsonOk({ versions: [] })

    const versions = await anamnesisVersionService.listVersions(admin, anamnesis.id)

    return jsonOk({
      versions: versions.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        trigger: v.trigger,
        relevance: v.relevance,
        changesSummary: v.changes_summary,
        pdfFilename: v.pdf_filename,
        notes: v.notes,
        createdAt: v.created_at,
      })),
    })
  } catch (e) {
    logger.error('[anamnesis/versions/GET]', e)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const notes = typeof body.notes === 'string' ? body.notes : undefined

  try {
    const admin = createAstroAdminClient()
    const anamnesisRepo = createAnamnesisAdapter(admin)
    const anamnesis = await anamnesisRepo.findByPatient(context.patientId)
    if (!anamnesis) return badRequest('no_anamnesis')

    const version = await anamnesisVersionService.createVersion(
      admin,
      context.patientId,
      anamnesis.id,
      'update',
      notes,
    )

    return jsonOk({ version })
  } catch (e) {
    logger.error('[anamnesis/versions/POST]', e)
    return internalError()
  }
}
