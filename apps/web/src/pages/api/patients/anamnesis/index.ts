import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

const TOTAL_SECTIONS = 13
const KNOWN_SECTIONS = [
  'edad',
  'ocupacion',
  'motivo_consulta',
  'enfermedades_previas',
  'medicamentos',
  'alergias',
  'antecedentes_familiares',
  'habitos',
  'cardiovascular',
  'respiratorio',
  'digestivo',
  'genitourinario',
  'resumen_final',
]

interface AnamnesisSectionRow {
  completed?: unknown
  section?: string | null
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim()
    if (v === 'true') return true
    if (v === 'false') return false
  }
  return fallback
}

async function ensureAnamnesisRecord(admin: ReturnType<typeof createAstroAdminClient>, patientId: string) {
  const existing = await admin
    .from('anamnesis')
    .select('*')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing.data) {
    return existing.data
  }

  const insert = await admin
    .from('anamnesis')
    .insert({ patient_id: patientId, status: 'in_progress' } as never)
    .select('*')
    .single()

  if (insert.error) throw insert.error
  return insert.data
}

function computeProgress(sections: AnamnesisSectionRow[]) {
  const completed = sections.filter((s) => toBoolean(s.completed))
  const completedIds = completed
    .map((s) => s.section)
    .filter((section): section is string => typeof section === 'string' && section.length > 0)
  const pending = KNOWN_SECTIONS.filter((section) => !completedIds.includes(section))
  const completion = TOTAL_SECTIONS > 0 ? Math.round((completed.length / TOTAL_SECTIONS) * 100) : 0

  return {
    completion_percentage: completion,
    completed_sections: completedIds,
    pending_sections: pending,
    total_sections: TOTAL_SECTIONS,
  }
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const admin = createAstroAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, context.patientId)

    const sectionsRes = await admin
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', (anamnesis as { id: string }).id)
      .order('updated_at', { ascending: true })

    if (sectionsRes.error) throw sectionsRes.error

    const sections = sectionsRes.data ?? []
    const progress = computeProgress(sections as AnamnesisSectionRow[])
    const anamnesisRecord = anamnesis as { id: string; completion_percentage: number | null }

    if (anamnesisRecord.completion_percentage !== progress.completion_percentage) {
      await admin
        .from('anamnesis')
        .update({ completion_percentage: progress.completion_percentage, sections_status: { completed: progress.completed_sections } } as never)
        .eq('id', anamnesisRecord.id)
    }

    return jsonOk({
      anamnesis: { ...anamnesis, completion_percentage: progress.completion_percentage },
      sections,
      progress,
    })
  } catch (e) {
    logger.error('[Anamnesis] GET error', e)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const body = await request.json().catch(() => ({}))
    const section = typeof body?.stepId === 'string' ? body.stepId : null
    const data = body?.data ?? {}
    const markCompleted = toBoolean(body?.completed, false)

    if (!section) {
      return badRequest('missing_step')
    }

    const admin = createAstroAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, context.patientId)
    const anamnesisId = (anamnesis as { id: string }).id

    const upsert = await admin
      .from('anamnesis_sections')
      .upsert(
        {
          anamnesis_id: anamnesisId,
          section,
          data,
          completed: markCompleted,
          completed_at: markCompleted ? new Date().toISOString() : null,
        } as never,
        { onConflict: 'anamnesis_id,section' },
      )
      .select('*')
      .single()

    if (upsert.error) throw upsert.error

    const sectionsRes = await admin
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', anamnesisId)
      .order('updated_at', { ascending: true })

    if (sectionsRes.error) throw sectionsRes.error

    const sections = sectionsRes.data ?? []
    const progress = computeProgress(sections as AnamnesisSectionRow[])

    await admin
      .from('anamnesis')
      .update({ completion_percentage: progress.completion_percentage, sections_status: { completed: progress.completed_sections } } as never)
      .eq('id', anamnesisId)

    return jsonOk({ section: upsert.data, progress })
  } catch (e) {
    logger.error('[Anamnesis] POST error', e)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (typeof body?.status === 'string') {
      updates.status = body.status
      if (body.status === 'completed' && !body.completed_at) {
        updates.completed_at = new Date().toISOString()
      }
    }

    if (typeof body?.completion_percentage === 'number') {
      updates.completion_percentage = Math.min(100, Math.max(0, Math.round(body.completion_percentage)))
    }

    if (body?.completed_at) {
      updates.completed_at = body.completed_at
    }

    if (Object.keys(updates).length === 0) {
      return badRequest('no_updates')
    }

    const admin = createAstroAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, context.patientId)
    const anamnesisId = (anamnesis as { id: string }).id

    const updateRes = await admin
      .from('anamnesis')
      .update(updates as never)
      .eq('id', anamnesisId)
      .select('*')
      .single()

    if (updateRes.error) throw updateRes.error

    return jsonOk(updateRes.data)
  } catch (e) {
    logger.error('[Anamnesis] PATCH error', e)
    return internalError()
  }
}
