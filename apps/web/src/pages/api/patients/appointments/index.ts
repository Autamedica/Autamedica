import type { APIRoute } from 'astro'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import {
  computeEndTime,
  mapAppointment,
  mapTypeToDb,
  type DbAppointmentRow,
} from '@/lib/patients/api/appointment-utils'
import type { AppointmentType } from '@/lib/patients/types/appointment'
import { jsonOk, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'

const DOCTOR_SELECT =
  '*, doctor:doctors(id, specialty, user_id, profile:profiles!doctors_user_id_fkey(first_name, last_name))' as const

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('appointments')
      .select(DOCTOR_SELECT)
      .eq('patient_id', context.patientId)
      .order('start_time', { ascending: false })

    if (error) {
      logger.error('[appointments/GET] Query failed', error)
      return internalError('Failed to fetch appointments')
    }

    const mapped = (data as unknown as DbAppointmentRow[]).map(mapAppointment)
    return jsonOk(mapped)
  } catch (err) {
    logger.error('[appointments/GET] Unexpected error', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized()
    }

    const body = await request.json()
    const {
      scheduled_at,
      doctor_id,
      duration_minutes = 30,
      type,
      notes,
      reason,
      meeting_url,
      location,
    } = body as {
      scheduled_at?: string
      doctor_id?: string
      duration_minutes?: number
      type?: AppointmentType
      notes?: string
      reason?: string
      meeting_url?: string
      location?: string
    }

    if (!scheduled_at || typeof scheduled_at !== 'string' || !scheduled_at.trim()) {
      return badRequest('scheduled_at is required')
    }

    if (!doctor_id || typeof doctor_id !== 'string' || !doctor_id.trim()) {
      return badRequest('doctor_id is required')
    }

    const admin = createAdminClient()

    // Verify doctor exists and is active
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id')
      .eq('id', doctor_id.trim())
      .eq('active', true)
      .maybeSingle()

    if (doctorError || !doctor) {
      return notFound('Doctor not found or inactive')
    }

    const end_time = computeEndTime(scheduled_at, duration_minutes)
    const combinedNotes = [reason, notes].filter(Boolean).join(' — ') || null

    const { data: inserted, error: insertError } = await admin
      .from('appointments')
      .insert({
        patient_id: context.patientId,
        doctor_id: doctor_id.trim(),
        start_time: scheduled_at,
        end_time,
        duration_minutes,
        type: mapTypeToDb(type),
        status: 'scheduled',
        notes: combinedNotes,
        meeting_url: meeting_url ?? null,
        location: location ?? null,
      } as never)
      .select(DOCTOR_SELECT)
      .single()

    if (insertError) {
      logger.error('[appointments/POST] Insert failed', insertError)
      return internalError('Failed to create appointment')
    }

    return jsonOk(mapAppointment(inserted as unknown as DbAppointmentRow), 201)
  } catch (err) {
    logger.error('[appointments/POST] Unexpected error', err)
    return internalError()
  }
}
