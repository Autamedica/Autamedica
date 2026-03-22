import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import {
  computeEndTime,
  mapAppointment,
  mapTypeToDb,
  type DbAppointmentRow,
} from '@/lib/patients/api/appointment-utils'
import type { AppointmentStatus, AppointmentType } from '@/lib/patients/types/appointment'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DOCTOR_SELECT =
  '*, doctor:doctors(id, specialty, user_id, profile:profiles!doctors_user_id_fkey(first_name, last_name))' as const

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return json({ success: false, error: 'Missing appointment id' }, 400)
    }

    const supabase = createServerClientFromRequest(request)
    const { data, error } = await supabase
      .from('appointments')
      .select(DOCTOR_SELECT)
      .eq('id', appointmentId)
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (error) {
      logger.error('[appointments/[id]/GET] Query failed', error)
      return json({ success: false, error: 'Failed to fetch appointment' }, 500)
    }

    if (!data) {
      return json({ success: false, error: 'Appointment not found' }, 404)
    }

    return json({ success: true, data: mapAppointment(data as unknown as DbAppointmentRow) })
  } catch (err) {
    logger.error('[appointments/[id]/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return json({ success: false, error: 'Missing appointment id' }, 400)
    }

    const supabase = createServerClientFromRequest(request)

    // Verify ownership
    const { data: existing, error: existingError } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', appointmentId)
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (existingError || !existing) {
      return json({ success: false, error: 'Appointment not found' }, 404)
    }

    const body = await request.json()
    const {
      scheduled_at,
      duration_minutes,
      status,
      type,
      notes,
      meeting_url,
      location,
    } = body as {
      scheduled_at?: string
      duration_minutes?: number
      status?: AppointmentStatus
      type?: AppointmentType
      notes?: string
      meeting_url?: string | null
      location?: string | null
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (scheduled_at !== undefined) {
      updates.start_time = scheduled_at
    }
    if (duration_minutes !== undefined) {
      updates.duration_minutes = duration_minutes
    }
    if (scheduled_at !== undefined || duration_minutes !== undefined) {
      // Re-fetch existing start_time if only duration changed
      if (scheduled_at !== undefined && duration_minutes !== undefined) {
        updates.end_time = computeEndTime(scheduled_at, duration_minutes)
      } else if (scheduled_at !== undefined) {
        updates.end_time = computeEndTime(scheduled_at, duration_minutes ?? 30)
      }
      // If only duration changed, we need the current start_time
      if (scheduled_at === undefined && duration_minutes !== undefined) {
        const { data: current } = await supabase
          .from('appointments')
          .select('start_time')
          .eq('id', appointmentId)
          .single()
        if (current?.start_time) {
          updates.end_time = computeEndTime(current.start_time, duration_minutes)
        }
      }
    }
    if (status !== undefined) {
      updates.status = status
    }
    if (type !== undefined) {
      updates.type = mapTypeToDb(type)
    }
    if (notes !== undefined) {
      updates.notes = notes
    }
    if (meeting_url !== undefined) {
      updates.meeting_url = meeting_url
    }
    if (location !== undefined) {
      updates.location = location
    }

    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update(updates as never)
      .eq('id', appointmentId)
      .eq('patient_id', context.patientId)
      .select(DOCTOR_SELECT)
      .single()

    if (updateError) {
      logger.error('[appointments/[id]/PATCH] Update failed', updateError)
      return json({ success: false, error: 'Failed to update appointment' }, 500)
    }

    return json({ success: true, data: mapAppointment(updated as unknown as DbAppointmentRow) })
  } catch (err) {
    logger.error('[appointments/[id]/PATCH] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}

export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return json({ success: false, error: 'Missing appointment id' }, 400)
    }

    const supabase = createServerClientFromRequest(request)

    // Soft delete: set status to cancelled
    const { data: cancelled, error: cancelError } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() } as never)
      .eq('id', appointmentId)
      .eq('patient_id', context.patientId)
      .select(DOCTOR_SELECT)
      .single()

    if (cancelError) {
      logger.error('[appointments/[id]/DELETE] Cancel failed', cancelError)
      return json({ success: false, error: 'Failed to cancel appointment' }, 500)
    }

    if (!cancelled) {
      return json({ success: false, error: 'Appointment not found' }, 404)
    }

    return json({ success: true, data: mapAppointment(cancelled as unknown as DbAppointmentRow) })
  } catch (err) {
    logger.error('[appointments/[id]/DELETE] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
