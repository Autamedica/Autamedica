/**
 * API Controller: Download anamnesis as PDF.
 * Capa 5 -- Auth + fetch data + delegate to pdf-report.service.
 *
 * GET /api/patients/anamnesis/pdf          -> latest version
 * GET /api/patients/anamnesis/pdf?version=N -> specific version snapshot
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { createAnamnesisExtractionAdapter } from '@/lib/patients/lib/repos/anamnesis-extraction.adapter'
import { createAnamnesisVersionsAdapter } from '@/lib/patients/lib/repos/anamnesis-versions.adapter'
import { generateAnamnesisPdf } from '@/lib/patients/services/pdf-report.service'
import { logger } from '@autamedica/shared'

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return jsonError('unauthorized', 401)

  try {
    const admin = createAstroAdminClient()
    const anamnesisExtractionRepo = createAnamnesisExtractionAdapter(admin)
    const anamnesisVersionsRepo = createAnamnesisVersionsAdapter(admin)
    const url = new URL(request.url)
    const versionParam = url.searchParams.get('version')

    const { data: anamnesis } = await admin
      .from('anamnesis')
      .select('id, status, completion_percentage, completed_at, created_at')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (!anamnesis) return jsonError('no_anamnesis', 404)

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', context.userId)
      .single()

    const { data: patientRow } = await admin
      .from('patients')
      .select('birth_date, gender')
      .eq('user_id', context.userId)
      .single()

    const patientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Paciente'
    const patientAge = patientRow?.birth_date
      ? Math.floor((Date.now() - new Date(patientRow.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    let sections: { section: string; data: Record<string, unknown>; completed: boolean }[]
    let extraction: Record<string, unknown> | null = null
    let versionMeta: { versionNumber: number; trigger: string; relevance: string | null; changesSummary: { added: string[]; modified: string[]; unchanged: string[] } | null; createdAt: string } | null = null

    if (versionParam) {
      const versionNumber = parseInt(versionParam, 10)
      if (isNaN(versionNumber)) return jsonError('invalid_version', 400)

      const version = await anamnesisVersionsRepo.getByVersion(anamnesis.id, versionNumber)
      if (!version) return jsonError('version_not_found', 404)

      sections = (Array.isArray(version.sections_snapshot) ? version.sections_snapshot : []) as { section: string; data: Record<string, unknown>; completed: boolean }[]
      extraction = version.extraction_snapshot
      versionMeta = {
        versionNumber: version.version_number,
        trigger: version.trigger,
        relevance: version.relevance,
        changesSummary: version.changes_summary,
        createdAt: version.created_at,
      }
    } else {
      const { data: liveSections } = await admin
        .from('anamnesis_sections')
        .select('section, data, completed')
        .eq('anamnesis_id', anamnesis.id)
        .order('updated_at', { ascending: true })

      sections = (liveSections ?? []).map(s => ({
        section: s.section,
        data: (s.data ?? {}) as Record<string, unknown>,
        completed: s.completed ?? false,
      }))

      const latestExtraction = await anamnesisExtractionRepo.getLatest(anamnesis.id)
      extraction = latestExtraction?.extraction_result ?? null

      const latestVersion = await anamnesisVersionsRepo.getLatest(anamnesis.id).catch(() => null)
      if (latestVersion) {
        versionMeta = {
          versionNumber: latestVersion.version_number,
          trigger: latestVersion.trigger,
          relevance: latestVersion.relevance,
          changesSummary: latestVersion.changes_summary,
          createdAt: latestVersion.created_at,
        }
      }
    }

    const pdf = generateAnamnesisPdf({
      patient: { name: patientName, age: patientAge, gender: patientRow?.gender ?? null },
      anamnesis: {
        id: anamnesis.id,
        completedAt: anamnesis.completed_at,
        completionPercentage: anamnesis.completion_percentage ?? 0,
      },
      version: versionMeta ? {
        versionNumber: versionMeta.versionNumber,
        trigger: versionMeta.trigger as 'initial' | 'update' | 'review',
        relevance: versionMeta.relevance,
        changesSummary: versionMeta.changesSummary,
        createdAt: versionMeta.createdAt,
      } : null,
      extraction: extraction as AnamnesisPdfExtraction ?? null,
      sections,
    })

    try {
      await admin.from('audit_logs').insert({
        user_id: context.userId,
        action: 'download_anamnesis_pdf',
        resource_type: 'anamnesis',
        resource_id: anamnesis.id,
        details: { filename: pdf.filename, version: versionParam ?? 'latest' },
      } as never)
    } catch {
      logger.warn('[anamnesis/pdf] audit log insert failed')
    }

    return new Response(pdf.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Content-Length': String(pdf.buffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    logger.error('[anamnesis/pdf] generation failed', err)
    return jsonError('pdf_generation_failed', 500)
  }
}

type AnamnesisPdfExtraction = Parameters<typeof generateAnamnesisPdf>[0]['extraction']
