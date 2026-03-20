import { resolvePatientContext } from '@/app/api/shared/patient-context'
import { createRouteHandlerClient } from '@autamedica/auth/server'
import { buildAnamnesisExportHtml, buildAnamnesisSummary, logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function resolvePatientLabel(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
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
    logger.warn('[Anamnesis export] Unable to resolve patient profile label', query.error)
    return 'Paciente autenticado'
  }

  const profile = query.data as { first_name?: string | null; last_name?: string | null } | null
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

  return fullName || 'Paciente autenticado'
}

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient()
    const context = await resolvePatientContext(supabase)

    if (!context) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: anamnesisRow, error: anamnesisError } = await supabase
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', context.patientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (anamnesisError) {
      throw anamnesisError
    }

    const anamnesis = anamnesisRow as {
      id: string
      status: string
      privacy_accepted: boolean | null
    } | null

    if (!anamnesis) {
      return NextResponse.json({ ok: false, error: 'anamnesis_not_found' }, { status: 404 })
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    if (sectionsError) {
      throw sectionsError
    }

    const summary = buildAnamnesisSummary(sections ?? [])
    const patientLabel = await resolvePatientLabel(supabase, context.userId)
    const html = buildAnamnesisExportHtml({
      patientLabel,
      status: anamnesis.status,
      privacyAccepted: anamnesis.privacy_accepted === true,
      summary,
    })

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'inline; filename="anamnesis-resumen.html"',
      },
    })
  } catch (error) {
    logger.error('[Anamnesis export] GET error', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
