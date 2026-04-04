/**
 * Repository: appointments table access for patient-scoped API routes.
 * Single source of truth for all appointment DB queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IAppointmentsRepository } from '@/lib/patients/ports/appointments.port'
import {
  computeEndTime,
  mapAppointment,
  mapTypeToDb,
  type DbAppointmentRow,
} from '@/lib/patients/api/appointment-utils'
import { buildPatientTelemedicineEntryUrl } from '@/lib/patients/lib/telemedicine-entry'
import type {
  AppointmentWithDoctor,
  AppointmentType,
  AppointmentStatus,
  CreateAppointmentInput,
} from '@/lib/patients/types/appointment'

type Db = SupabaseClient<Database>

const DOCTOR_SELECT =
  '*, doctor:doctors(id, specialty, user_id, profile:profiles!doctors_user_id_fkey(first_name, last_name))' as const

export function createAppointmentAdapter(supabase: Db): IAppointmentsRepository {
  return {
  async listByPatient(patientId: string): Promise<AppointmentWithDoctor[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select(DOCTOR_SELECT)
      .eq('patient_id', patientId)
      .order('start_time', { ascending: false })

    if (error) {
      logger.error('[appointmentsRepo] listByPatient failed', error)
      throw error
    }

    return (data as unknown as DbAppointmentRow[]).map(mapAppointment)
  },

  async findById(
    id: string,
    patientId: string,
  ): Promise<AppointmentWithDoctor | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select(DOCTOR_SELECT)
      .eq('id', id)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) {
      logger.error('[appointmentsRepo] findById failed', error)
      throw error
    }

    return data ? mapAppointment(data as unknown as DbAppointmentRow) : null
  },

  async doctorExists(doctorId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId.trim())
      .eq('active', true)
      .maybeSingle()

    if (error) return false
    return !!data
  },

  async create(
    patientId: string,
    input: CreateAppointmentInput & { meeting_url?: string | null; location?: string | null },
  ): Promise<AppointmentWithDoctor> {
    const {
      scheduled_at,
      doctor_id,
      duration_minutes = 30,
      type,
      notes,
      reason,
      meeting_url,
      location,
    } = input

    const effectiveType = mapTypeToDb(type as AppointmentType)
    const end_time = computeEndTime(scheduled_at, duration_minutes)
    const combinedNotes = [reason, notes].filter(Boolean).join(' — ') || null

    let effectiveMeetingUrl = meeting_url ?? null
    const needsCanonicalTelemedicineUrl =
      !effectiveMeetingUrl && (effectiveType === 'telemedicine' || effectiveType === 'emergency')

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: patientId,
        doctor_id: doctor_id.trim(),
        start_time: scheduled_at,
        end_time,
        duration_minutes,
        type: effectiveType,
        status: 'scheduled',
        notes: combinedNotes,
        meeting_url: needsCanonicalTelemedicineUrl ? null : effectiveMeetingUrl,
        location: location ?? null,
      } as never)
      .select(DOCTOR_SELECT)
      .single()

    if (error) {
      logger.error('[appointmentsRepo] create failed', error)
      throw error
    }

    const appointment = mapAppointment(data as unknown as DbAppointmentRow)

    if (!needsCanonicalTelemedicineUrl) {
      return appointment
    }

    effectiveMeetingUrl = buildPatientTelemedicineEntryUrl(appointment.id)

    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update({
        meeting_url: effectiveMeetingUrl,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', appointment.id)
      .eq('patient_id', patientId)
      .select(DOCTOR_SELECT)
      .single()

    if (updateError) {
      logger.error('[appointmentsRepo] create failed while setting telemedicine entry url', updateError)
      throw updateError
    }

    return mapAppointment(updatedAppointment as unknown as DbAppointmentRow)
  },

  async update(
    id: string,
    patientId: string,
    patch: {
      scheduled_at?: string
      duration_minutes?: number
      status?: AppointmentStatus
      type?: AppointmentType
      notes?: string
      meeting_url?: string | null
      location?: string | null
    },
  ): Promise<AppointmentWithDoctor> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (patch.scheduled_at !== undefined) updates.start_time = patch.scheduled_at
    if (patch.duration_minutes !== undefined) updates.duration_minutes = patch.duration_minutes
    if (patch.status !== undefined) updates.status = patch.status
    if (patch.type !== undefined) updates.type = mapTypeToDb(patch.type)
    if (patch.notes !== undefined) updates.notes = patch.notes
    if (patch.meeting_url !== undefined) updates.meeting_url = patch.meeting_url
    if (patch.location !== undefined) updates.location = patch.location

    // Recompute end_time when time/duration changes
    if (patch.scheduled_at !== undefined && patch.duration_minutes !== undefined) {
      updates.end_time = computeEndTime(patch.scheduled_at, patch.duration_minutes)
    } else if (patch.scheduled_at !== undefined) {
      updates.end_time = computeEndTime(patch.scheduled_at, patch.duration_minutes ?? 30)
    } else if (patch.duration_minutes !== undefined) {
      const { data: current } = await supabase
        .from('appointments')
        .select('start_time')
        .eq('id', id)
        .single()
      if (current?.start_time) {
        updates.end_time = computeEndTime(current.start_time, patch.duration_minutes)
      }
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates as never)
      .eq('id', id)
      .eq('patient_id', patientId)
      .select(DOCTOR_SELECT)
      .single()

    if (error) {
      logger.error('[appointmentsRepo] update failed', error)
      throw error
    }

    return mapAppointment(data as unknown as DbAppointmentRow)
  },

  async cancel(id: string, patientId: string): Promise<AppointmentWithDoctor | null> {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('patient_id', patientId)
      .select(DOCTOR_SELECT)
      .single()

    if (error) {
      logger.error('[appointmentsRepo] cancel failed', error)
      throw error
    }

    return data ? mapAppointment(data as unknown as DbAppointmentRow) : null
  },
}

/**
 * Factory: crea un adapter read-only que implementa IAppointmentQueryRepository
 * scoped a un paciente específico.
 */
}
