import { createRouteHandlerClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = await createRouteHandlerClient()
    const { sessionId } = await params

    const body = await request.json().catch(() => ({})) as { event_type?: string; event_data?: any }
    const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : ''
    if (!eventType) {
      return NextResponse.json({ ok: false, error: 'event_type_required' }, { status: 400 })
    }

    const { error } = await (supabase as any)
      .from('telemedicine_session_events')
      .insert([{
        session_id: sessionId,
        event_type: eventType,
        event_data: body.event_data || {}
      }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    logger.error('[Telemedicina] events POST error', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
