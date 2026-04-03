import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call } from '@autamedica/telemedicine'

type Db = SupabaseClient<Database>

const CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason, appointment_id' as const
const LEGACY_CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason' as const

type LegacyCallRow = Omit<Call, 'appointment_id'> & { appointment_id?: string | null }

function isMissingAppointmentIdColumn(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '42703' &&
    'message' in error &&
    typeof (error as { message?: string }).message === 'string' &&
    (error as { message: string }).message.includes('calls.appointment_id')
  )
}

function withNullAppointmentId(row: LegacyCallRow | null): Call | null {
  if (!row) {
    return null
  }

  return {
    ...row,
    appointment_id: row.appointment_id ?? null,
  } as Call
}

export const callSessionRepo = {
  async findLatestByRoomId(supabase: Db, roomId: string): Promise<Call | null> {
    const primary = await supabase
      .from('calls')
      .select(CALL_SELECT)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!primary.error) {
      return withNullAppointmentId(primary.data as unknown as LegacyCallRow | null)
    }

    if (isMissingAppointmentIdColumn(primary.error)) {
      logger.warn('[callSessionRepo] findLatestByRoomId falling back to legacy calls schema')
      const legacy = await supabase
        .from('calls')
        .select(LEGACY_CALL_SELECT)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (legacy.error) {
        logger.error('[callSessionRepo] findLatestByRoomId legacy fallback failed', legacy.error)
        throw legacy.error
      }

      return withNullAppointmentId(legacy.data as LegacyCallRow | null)
    }

    logger.error('[callSessionRepo] findLatestByRoomId failed', primary.error)
    throw primary.error
  },

  async resolveDoctorProfileIdByUserId(supabase: Db, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('[callSessionRepo] resolveDoctorProfileIdByUserId failed', error)
      throw error
    }

    return (data as { id: string } | null)?.id ?? null
  },

  async resolvePatientProfileIdByUserId(supabase: Db, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('[callSessionRepo] resolvePatientProfileIdByUserId failed', error)
      throw error
    }

    return (data as { id: string } | null)?.id ?? null
  },

  async resolveDisplayNameByUserId(supabase: Db, userId: string): Promise<string | undefined> {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.warn('[callSessionRepo] resolveDisplayNameByUserId failed', error)
      return undefined
    }

    const profile = data as { first_name: string | null; last_name: string | null } | null
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    return fullName || undefined
  },

  async acceptCall(supabase: Db, callId: string): Promise<void> {
    const { error } = await supabase
      .from('calls')
      .update({ 
        status: 'in_progress',
        accepted_at: new Date().toISOString()
      })
      .eq('id', callId)

    if (error) {
      logger.error('[callSessionRepo] acceptCall failed', error)
      throw error
    }
  }
}
