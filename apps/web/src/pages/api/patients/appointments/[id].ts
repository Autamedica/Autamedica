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
import { jsonOk, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'

const DOCTOR_SELECT =
  '*, doctor:doctors(id, specialty, user_id, profile:profiles!doctors_user_id_fkey(first_name, last_name))' as const

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return badRequest('Missing appointment id')
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
      return internalError('Failed to fetch appointment')
    }

    if (!data) {
      return notFound('Appointment not found')
    }

    return jsonOk(mapAppointment(data as unknown as DbAppointmentRow))
  } catch (err) {
    logger.error('[appointments/[id]/GET] Unexpected error', err)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return badRequest('Missing appointment id')
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
      return notFound('Appointment not found')
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
      return internalError('Failed to update appointment')
    }

    return jsonOk(mapAppointment(updated as unknown as DbAppointmentRow))
  } catch (err) {
    logger.error('[appointments/[id]/PATCH] Unexpected error', err)
    return internalError()
  }
}

export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const appointmentId = params.id
    if (!appointmentId) {
      return badRequest('Missing appointment id')
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
      return internalError('Failed to cancel appointment')
    }

    if (!cancelled) {
      return notFound('Appointment not found')
    }

    return jsonOk(mapAppointment(cancelled as unknown as DbAppointmentRow))
  } catch (err) {
    logger.error('[appointments/[id]/DELETE] Unexpected error', err)
    return internalError()
  }
}
