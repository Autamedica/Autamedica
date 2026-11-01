import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call, CallStatus } from '@autamedica/telemedicine'

type Db = SupabaseClient<Database>

const CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason, appointment_id' as const
const LEGACY_CALL_SELECT =
  'id, room_id, doctor_id, patient_id, status, created_at, accepted_at, ended_at, reason' as const
const ACTIVE_CALL_STATUS_FILTER =
  'status.eq.requested,status.eq.ringing,status.eq.accepted,status.eq.connecting,status.eq.connected'

interface LooseCallSelectQuery<T = unknown> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  eq(column: string, value: unknown): LooseCallSelectQuery<T>
  or(filters: string): LooseCallSelectQuery<T>
  order(column: string, options: { ascending: boolean }): LooseCallSelectQuery<T>
  limit(count: number): LooseCallSelectQuery<T>
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

function isLegacyCreateCallSignatureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''

  return (
    (code === 'PGRST202' || code === '42883') &&
    message.includes('create_call') &&
    message.includes('p_appointment_id')
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



import type { ICallStartRepository, StartCallAppointmentRecord } from '@/lib/calls/ports/call-start.port'

export function createCallStartAdapter(supabase: Db): ICallStartRepository {
  return {
  async findAppointmentById(appointmentId: string): Promise<StartCallAppointmentRecord | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, doctor_id, patient_id, type, status, start_time, end_time, duration_minutes, created_by')
      .eq('id', appointmentId)
      .maybeSingle()

    if (error) {
      logger.error('[callStartRepo] findAppointmentById failed', error)
      throw error
    }

    return data as StartCallAppointmentRecord | null
  },

  async findPatientById(patientId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .maybeSingle()

    if (error) {
      logger.error('[callStartRepo] findPatientById failed', error)
      throw error
    }

    return data as { id: string } | null
  },

  async findActiveByAppointmentId(appointmentId: string): Promise<Call | null> {
    const { data, error } = await selectCalls(supabase, CALL_SELECT)
      .eq('appointment_id', appointmentId)
      .or(ACTIVE_CALL_STATUS_FILTER)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (isMissingAppointmentIdColumn(error)) {
      logger.warn('[callStartRepo] findActiveByAppointmentId falling back to legacy calls schema')
      return null
    }

    if (error) {
      logger.error('[callStartRepo] findActiveByAppointmentId failed', error)
      throw error
    }

    return withNullAppointmentId(data as LegacyCallRow | null)
  },

  async findActiveByParticipants(doctorId: string, patientId: string | null): Promise<Call | null> {
    if (!patientId) return null;
    const primary = await selectCalls(supabase, CALL_SELECT)
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .or(ACTIVE_CALL_STATUS_FILTER)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!primary.error) {
      return withNullAppointmentId(primary.data as LegacyCallRow | null)
    }

    if (isMissingAppointmentIdColumn(primary.error)) {
      logger.warn('[callStartRepo] findActiveByParticipants falling back to legacy calls schema')
      const legacy = await selectCalls(supabase, LEGACY_CALL_SELECT)
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .or(ACTIVE_CALL_STATUS_FILTER)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (legacy.error) {
        logger.error('[callStartRepo] findActiveByParticipants legacy fallback failed', legacy.error)
        throw legacy.error
      }

      return withNullAppointmentId(legacy.data as LegacyCallRow | null)
    }

    logger.error('[callStartRepo] findActiveByParticipants failed', primary.error)
    throw primary.error
  },

  async listPendingByParticipants(doctorId: string, patientId: string | null): Promise<Call[]> {
    if (!patientId) return [];
    const pendingFilter = 'status.eq.requested,status.eq.ringing,status.eq.accepted'
    const primary = await selectCalls(supabase, CALL_SELECT)
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .or(pendingFilter)
      .order('created_at', { ascending: false })

    const primaryResponse = primary as unknown as { data: LegacyCallRow[] | null; error: unknown }

    if (!primaryResponse.error) {
      return (primaryResponse.data ?? []).map((row) => withNullAppointmentId(row)).filter(Boolean) as Call[]
    }

    if (isMissingAppointmentIdColumn(primaryResponse.error)) {
      logger.warn('[callStartRepo] listPendingByParticipants falling back to legacy calls schema')
      const legacy = await selectCalls(supabase, LEGACY_CALL_SELECT)
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .or(pendingFilter)
        .order('created_at', { ascending: false }) as unknown as { data: LegacyCallRow[] | null; error: unknown }

      if (legacy.error) {
        logger.error('[callStartRepo] listPendingByParticipants legacy fallback failed', legacy.error)
        throw legacy.error
      }

      return (legacy.data ?? []).map((row) => withNullAppointmentId(row)).filter(Boolean) as Call[]
    }

    logger.error('[callStartRepo] listPendingByParticipants failed', primaryResponse.error)
    throw primaryResponse.error
  },

  async createCall(
    doctorId: string,
    patientId: string | null,
    appointmentId?: string,
  ): Promise<Call> {
    const baseArgs = {
      p_doctor_id: doctorId,
      p_patient_id: patientId,
    }

    let data: unknown
    let error: unknown

    if (appointmentId) {
      const withAppointment = await supabase.rpc('create_call', {
        ...baseArgs,
        p_appointment_id: appointmentId,
      } as {
        p_doctor_id: string
        p_patient_id: string
        p_appointment_id: string
      })

      if (withAppointment.error && isLegacyCreateCallSignatureError(withAppointment.error)) {
        logger.warn('[callStartRepo] createCall falling back to legacy create_call signature')
        const legacy = await supabase.rpc('create_call', baseArgs)
        data = legacy.data
        error = legacy.error
      } else {
        data = withAppointment.data
        error = withAppointment.error
      }
    } else {
      const response = await supabase.rpc('create_call', baseArgs)
      data = response.data
      error = response.error
    }

    if (error) {
      logger.error('[callStartRepo] createCall failed', error)
      throw error
    }

    if (Array.isArray(data)) {
      const first = data[0]
      if (!first) {
        throw new Error('create_call returned no rows')
      }
      const call = withNullAppointmentId(first as LegacyCallRow)
      if (!call) {
        throw new Error('create_call returned empty call payload')
      }
      return call
    }

    if (!data) {
      throw new Error('create_call returned empty payload')
    }

    const call = withNullAppointmentId(data as LegacyCallRow)
    if (!call) {
      throw new Error('create_call returned empty call payload')
    }

    return call
  },

  async updateCallStatus(
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
      logger.error('[callStartRepo] updateCallStatus failed', error)
      throw error
    }

    return Boolean(data)
  },

  /**
   * Cancel superseded calls through the same authorized transition boundary.
   * Audit events are appended by the database rather than by the browser.
   */
  async cancelCallsBatch(
    calls: Array<{ id: string; status: string }>,
    reason: string,
  ): Promise<void> {
    if (calls.length === 0) return

    // The actor-checked RPC serializes transitions and appends one audit event.
    await Promise.all(calls.map(async (call) => {
      const { error } = await supabase.rpc('update_call_status', {
        p_call_id: call.id,
        p_status: 'canceled',
        p_reason: reason,
      })
      if (error) {
        logger.error('[callStartRepo] cancelCallsBatch failed', error)
        throw error
      }
    }))
  },
}

}

