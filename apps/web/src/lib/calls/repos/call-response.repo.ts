import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call, CallStatus } from '@autamedica/telemedicine'

type Db = SupabaseClient<Database>

const CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason, appointment_id' as const
const LEGACY_CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason' as const

interface LooseCallSelectQuery<T = unknown> {
  eq(column: string, value: unknown): LooseCallSelectQuery<T>
  maybeSingle(): Promise<{ data: T | null; error: unknown }>
}

type LegacyCallRow = Omit<Call, 'appointment_id'> & { appointment_id?: string | null }

function selectCalls(supabase: Db, columns: typeof CALL_SELECT | typeof LEGACY_CALL_SELECT): LooseCallSelectQuery {
  return supabase.from('calls').select(columns) as unknown as LooseCallSelectQuery
}

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

export const callResponseRepo = {
  async findById(supabase: Db, callId: string): Promise<Call | null> {
    const primary = await selectCalls(supabase, CALL_SELECT)
      .eq('id', callId)
      .maybeSingle()

    if (!primary.error) {
      return withNullAppointmentId(primary.data as LegacyCallRow | null)
    }

    if (isMissingAppointmentIdColumn(primary.error)) {
      logger.warn('[callResponseRepo] findById falling back to legacy calls schema')
      const legacy = await selectCalls(supabase, LEGACY_CALL_SELECT)
        .eq('id', callId)
        .maybeSingle()

      if (legacy.error) {
        logger.error('[callResponseRepo] findById legacy fallback failed', legacy.error)
        throw legacy.error
      }

      return withNullAppointmentId(legacy.data as LegacyCallRow | null)
    }

    logger.error('[callResponseRepo] findById failed', primary.error)
    throw primary.error
  },

  async updateCallStatus(
    supabase: Db,
    callId: string,
    status: CallStatus,
    reason?: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('update_call_status', {
      p_call_id: callId,
      p_status: status,
      p_reason: reason ?? null,
    })

    if (error) {
      logger.error('[callResponseRepo] updateCallStatus failed', error)
      throw error
    }

    return Boolean(data)
  },
}
