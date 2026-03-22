import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { addToWaitlist, cancelWaitlistEntry } from '@autamedica/scheduling'
import type { UUID } from '@autamedica/types'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const supabase = createServerClientFromRequest(request)

    const { data: entries, error } = await supabase
      .from('appointment_waitlist')
      .select('*')
      .eq('patient_id', context.patientId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[waitlist/GET] Query failed', error)
      return json({ success: false, error: 'Failed to fetch waitlist entries' }, 500)
    }

    return json({
      success: true,
      data: {
        entries: entries ?? [],
        total: entries?.length ?? 0,
      },
    })
  } catch (err) {
    logger.error('[waitlist/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const body = await request.json()
    const {
      doctor_id,
      preferred_date_start,
      preferred_date_end,
      preferred_time_start,
      preferred_time_end,
      appointment_type,
    } = body as {
      doctor_id?: string
      preferred_date_start?: string
      preferred_date_end?: string
      preferred_time_start?: string
      preferred_time_end?: string
      appointment_type?: string
    }

    if (!doctor_id || typeof doctor_id !== 'string' || !doctor_id.trim()) {
      return json({ success: false, error: 'doctor_id is required' }, 400)
    }

    const supabase = createServerClientFromRequest(request)

    const entry = await addToWaitlist(supabase, {
      patient_id: context.patientId as UUID,
      doctor_id: doctor_id.trim() as UUID,
      preferred_date_start: preferred_date_start ?? null,
      preferred_date_end: preferred_date_end ?? null,
      preferred_time_start: preferred_time_start ?? null,
      preferred_time_end: preferred_time_end ?? null,
      appointment_type: appointment_type ?? null,
    })

    return json({ success: true, data: entry }, 201)
  } catch (err) {
    logger.error('[waitlist/POST] Unexpected error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ success: false, error: message }, 500)
  }
}

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const url = new URL(request.url)
    const waitlistId = url.searchParams.get('id')

    if (!waitlistId) {
      return json({ success: false, error: 'Missing waitlist entry id' }, 400)
    }

    const supabase = createServerClientFromRequest(request)

    await cancelWaitlistEntry(supabase, waitlistId, context.patientId)

    return json({ success: true })
  } catch (err) {
    logger.error('[waitlist/DELETE] Unexpected error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ success: false, error: message }, 500)
  }
}
