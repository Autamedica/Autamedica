import { createRouteHandlerClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

async function updateAppointmentStatus(
  supabase: any,
  sessionId: string,
  status: 'completed'
) {
  const sessionRes = await supabase
    .from('telemedicine_sessions')
    .select('appointment_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionRes?.data?.appointment_id) {
    await supabase
      .from('appointments')
      .update({ status })
      .eq('id', sessionRes.data.appointment_id)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = (await createRouteHandlerClient()) as any
    const { sessionId } = await params

    const {
      data: { session: authSession },
    } = await supabase.auth.getSession()

    if (!authSession) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as {
      status?: string
      notes?: string
      ended?: boolean
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.status) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.ended) updates.ended_at = new Date().toISOString()

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ ok: false, error: 'no_updates' }, { status: 400 })
    }

    const res = await supabase
      .from('telemedicine_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select('*')
      .single()

    if (res.error || !res.data) {
      logger.error('[Telemedicina] PATCH error', res.error)
      return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
    }

    if (updates.status === 'completed' || updates.ended_at) {
      await updateAppointmentStatus(supabase, sessionId, 'completed')
    }

    return NextResponse.json({ ok: true, data: { status: res.data.status, ended_at: res.data.ended_at } })
  } catch (e) {
    logger.error('[Telemedicina] PATCH exception', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = (await createRouteHandlerClient()) as any
    const { sessionId } = await params

    const res = await supabase
      .from('telemedicine_sessions')
      .delete()
      .eq('id', sessionId)

    if (res.error) throw res.error

    return NextResponse.json({ ok: true })
  } catch (e) {
    logger.error('[Telemedicina] DELETE error', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
