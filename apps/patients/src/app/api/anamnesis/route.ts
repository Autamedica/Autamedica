import { resolvePatientContext } from '@/app/api/shared/patient-context'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { AppSupabaseClient } from '@autamedica/supabase-client'
import { createRouteHandlerClient } from '@autamedica/auth/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

// buildSupabaseAdmin removed as we now use createAdminClient()

async function ensureAnamnesisRecord(admin: AppSupabaseClient, patientId: string) {
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
    .insert({ patient_id: patientId, status: 'in_progress' })
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

async function getPatientId(): Promise<string | null> {
  const supabase = await createRouteHandlerClient()
  const context = await resolvePatientContext(supabase)
  return context?.patientId ?? null
}

function createAppAdminClient(): AppSupabaseClient {
  return createAdminClient() as unknown as AppSupabaseClient
}

export async function GET() {
  try {
    const patientId = await getPatientId()
    if (!patientId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const admin = createAppAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, patientId)

    const sectionsRes = await admin
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    if (sectionsRes.error) throw sectionsRes.error

    const sections = sectionsRes.data ?? []
    const progress = computeProgress(sections)

    // ensure completion percentage stays in sync
    if (anamnesis.completion_percentage !== progress.completion_percentage) {
      await admin
        .from('anamnesis')
        .update({ completion_percentage: progress.completion_percentage, sections_status: { completed: progress.completed_sections } })
        .eq('id', anamnesis.id)
    }

    return NextResponse.json({ ok: true, data: { anamnesis: { ...anamnesis, completion_percentage: progress.completion_percentage }, sections, progress } })
  } catch (e) {
    logger.error('[Anamnesis] GET error', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const patientId = await getPatientId()
    if (!patientId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const section = typeof body?.stepId === 'string' ? body.stepId : null
    const data = body?.data ?? {}
    const markCompleted = toBoolean(body?.completed, false)

    if (!section) {
      return NextResponse.json({ ok: false, error: 'missing_step' }, { status: 400 })
    }

    const admin = createAppAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, patientId)

    const upsert = await admin
      .from('anamnesis_sections')
      .upsert(
        {
          anamnesis_id: anamnesis.id,
          section,
          data,
          completed: markCompleted,
          completed_at: markCompleted ? new Date().toISOString() : null,
        },
        { onConflict: 'anamnesis_id,section' }
      )
      .select('*')
      .single()

    if (upsert.error) throw upsert.error

    const sectionsRes = await admin
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    if (sectionsRes.error) throw sectionsRes.error

    const sections = sectionsRes.data ?? []
    const progress = computeProgress(sections)

    await admin
      .from('anamnesis')
      .update({ completion_percentage: progress.completion_percentage, sections_status: { completed: progress.completed_sections } })
      .eq('id', anamnesis.id)

    return NextResponse.json({ ok: true, data: { section: upsert.data, progress } })
  } catch (e) {
    logger.error('[Anamnesis] POST error', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const patientId = await getPatientId()
    if (!patientId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
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
      return NextResponse.json({ ok: false, error: 'no_updates' }, { status: 400 })
    }

    const admin = createAppAdminClient()
    const anamnesis = await ensureAnamnesisRecord(admin, patientId)

    const updateRes = await admin
      .from('anamnesis')
      .update(updates)
      .eq('id', anamnesis.id)
      .select('*')
      .single()

    if (updateRes.error) throw updateRes.error

    return NextResponse.json({ ok: true, data: updateRes.data })
  } catch (e) {
    logger.error('[Anamnesis] PATCH error', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
