import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Appointment,
  AppointmentInsert,
  AppointmentUpdate,
  Database,
  IAppointmentCommandRepository,
} from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { computeEndTime } from '@/lib/patients/api/appointment-utils'
import { buildPatientTelemedicineEntryUrl } from '@/lib/patients/lib/telemedicine-entry'

type Db = SupabaseClient<Database>

export function createDoctorAppointmentCommandAdapter(
  supabase: Db,
  doctorId: string,
  createdByUserId: string,
): IAppointmentCommandRepository<Appointment> {
  return {
    async create(patientId: string, input: AppointmentInsert): Promise<Appointment> {
      const durationMinutes = input.duration_minutes ?? 30
      const startTime = input.start_time
      const type = input.type ?? 'consultation'
      const needsTelemedicineUrl = type === 'telemedicine' && !input.meeting_url
      
      // Manejar patientId vacío como null (para invitados externos)
      const finalPatientId = patientId?.trim() || null

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          patient_id: finalPatientId,
          doctor_id: doctorId,
          start_time: startTime,
          end_time: input.end_time ?? computeEndTime(startTime, durationMinutes),
          duration_minutes: durationMinutes,
          type,
          status: input.status ?? 'scheduled',
          notes: input.notes ?? null,
          location: input.location ?? null,
          meeting_url: needsTelemedicineUrl ? null : (input.meeting_url ?? null),
          created_by: createdByUserId,
        } as never)
        .select('*')
        .single()

      if (error) {
        logger.error('[doctorAppointmentsRepo] create failed', error)
        throw error
      }

      if (!needsTelemedicineUrl) {
        return data as unknown as Appointment
      }

      const telemedicineUrl = buildPatientTelemedicineEntryUrl(data.id)
      const { data: updated, error: updateError } = await supabase
        .from('appointments')
        .update({
          meeting_url: telemedicineUrl,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', data.id)
        .select('*')
        .single()

      if (updateError) {
        logger.error('[doctorAppointmentsRepo] failed to set telemedicine url', updateError)
        throw updateError
      }

      return updated as unknown as Appointment
    },

    async update(id: string, patch: AppointmentUpdate): Promise<Appointment> {
      const { data, error } = await supabase
        .from('appointments')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .eq('doctor_id', doctorId)
        .select('*')
        .single()

      if (error) {
        logger.error('[doctorAppointmentsRepo] update failed', error)
        throw error
      }

      return data as unknown as Appointment
    },

    async cancel(id: string): Promise<Appointment | null> {
      const { data, error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .eq('doctor_id', doctorId)
        .select('*')
        .maybeSingle()

      if (error) {
        logger.error('[doctorAppointmentsRepo] cancel failed', error)
        throw error
      }

      return (data as unknown as Appointment | null) ?? null
    },
  }
}
