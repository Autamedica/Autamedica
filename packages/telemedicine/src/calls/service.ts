import { createClient, type SupabaseClient, type RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import type { Call, CallStatus, CallEvent } from './types'
import { createTelemedicineLogger, type TelemedicineDebugLevel } from '../debug'

// Service for call management
export class CallService {
  private supabase: SupabaseClient<Database>
  private functionsBaseUrl: string
  private anonKey: string
  private readonly debugLogger = createTelemedicineLogger({ source: 'CallService' })
  private callEventsPersistenceDisabled = false

  constructor(supabaseUrl: string, supabaseKey: string, existingClient?: SupabaseClient<Database>) {
    this.supabase = existingClient ?? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    this.anonKey = supabaseKey
    this.functionsBaseUrl = `${new URL(supabaseUrl).origin}/functions/v1`
  }

  private writeLocalDebug(
    level: TelemedicineDebugLevel,
    message: string,
    payload?: Record<string, unknown>,
  ): void {
    switch (level) {
      case 'error':
        this.debugLogger.error(message, undefined, payload)
        break
      case 'warn':
        this.debugLogger.warn(message, payload)
        break
      default:
        this.debugLogger.info(message, payload)
        break
    }
  }

  private disableCallEventsPersistence(error: unknown): void {
    if (this.callEventsPersistenceDisabled) {
      return
    }

    this.callEventsPersistenceDisabled = true
    this.writeLocalDebug('warn', 'Persistencia de call_events deshabilitada por error de auth/RLS', {
      error,
    })
  }

  private shouldDisableCallEventsPersistence(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const maybeError = error as {
      code?: string
      message?: string
      details?: string
      hint?: string
      status?: number
      statusCode?: number
    }

    const message = [
      maybeError.message,
      maybeError.details,
      maybeError.hint,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLowerCase()

    return (
      maybeError.status === 401
      || maybeError.statusCode === 401
      || maybeError.code === '401'
      || message.includes('401')
      || message.includes('unauthorized')
      || message.includes('jwt')
      || message.includes('permission denied')
      || message.includes('row-level security')
      || message.includes('not allowed')
    )
  }

  async logDebugEvent(
    callId: string,
    level: TelemedicineDebugLevel,
    source: string,
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (this.callEventsPersistenceDisabled) {
      return
    }

    try {
      await this.logEvent(callId, 'debug_log', {
        level,
        source,
        message,
        payload: (payload ?? null) as Json,
      })
    } catch (error) {
      this.writeLocalDebug('warn', 'No fue posible persistir debug_log', {
        callId,
        source,
        message,
        payload,
        error,
      })

      if (this.shouldDisableCallEventsPersistence(error)) {
        this.disableCallEventsPersistence(error)
      }
    }
  }

  async createCall(doctorId: string, patientId: string, appointmentId?: string): Promise<Call> {
    this.writeLocalDebug('info', 'Iniciando createCall', { doctorId, patientId, appointmentId })

    try {
      // Get auth session for authorization header
      const { data: { session } } = await this.supabase.auth.getSession()

      if (!session?.access_token) {
        this.writeLocalDebug('error', 'createCall sin sesion activa', { doctorId, patientId })
        throw new Error('No active session found. Please login first.')
      }

      // Primary path: Edge Function
      const response = await fetch(`${this.functionsBaseUrl}/create-call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({
          doctorId,
          patientId,
          ...(appointmentId && { appointmentId })
        })
      })

      // Fallback path for environments where Edge Functions are not deployed yet
      if (response.status === 404) {
        logger.warn('create-call edge function not found, falling back to RPC')
        this.writeLocalDebug('warn', 'create-call edge function ausente; usando RPC', {
          doctorId,
          patientId,
          appointmentId,
        })
        return await this.createCallViaRpc(doctorId, patientId, appointmentId)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.success === false) {
        throw new Error(result.error || 'Failed to create call')
      }

      if (result.call) {
        void this.logDebugEvent(result.call.id, 'info', 'CallService', 'Llamada creada via edge function', {
          doctorId,
          patientId,
          roomId: result.call.room_id,
        })
        return result.call as Call
      }

      // Backward compatibility with direct payload responses
      void this.logDebugEvent((result as Call).id, 'info', 'CallService', 'Llamada creada via payload directo', {
        doctorId,
        patientId,
        roomId: (result as Call).room_id,
      })
      return result as Call
    } catch (err) {
      logger.error('Error in createCall:', err)
      this.writeLocalDebug('error', 'Error en createCall', {
        doctorId,
        patientId,
        error: err,
      })
      throw err
    }
  }

  async updateCallStatus(callId: string, status: CallStatus, reason?: string): Promise<boolean> {
    this.writeLocalDebug('info', 'Iniciando updateCallStatus', { callId, status, reason })

    try {
      // Get auth session for authorization header
      const { data: { session } } = await this.supabase.auth.getSession()

      if (!session?.access_token) {
        this.writeLocalDebug('error', 'updateCallStatus sin sesion activa', { callId, status, reason })
        throw new Error('No active session found. Please login first.')
      }

      // Primary path: Edge Function
      const response = await fetch(`${this.functionsBaseUrl}/update-call-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({
          callId,
          status,
          reason
        })
      })

      // Fallback path for environments where Edge Functions are not deployed yet
      if (response.status === 404) {
        logger.warn('update-call-status edge function not found, falling back to RPC')
        this.writeLocalDebug('warn', 'update-call-status edge function ausente; usando RPC', {
          callId,
          status,
          reason,
        })
        return await this.updateCallStatusViaRpc(callId, status, reason)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.success === false) {
        throw new Error(result.error || 'Failed to update call status')
      }

      if (typeof result.updated === 'boolean') {
        void this.logDebugEvent(callId, 'info', 'CallService', 'Estado de llamada actualizado', {
          status,
          reason,
          updated: result.updated,
        })
        return result.updated
      }

      void this.logDebugEvent(callId, 'info', 'CallService', 'Estado de llamada actualizado', {
        status,
        reason,
        updated: Boolean(result),
      })
      return Boolean(result)
    } catch (err) {
      logger.error('Error in updateCallStatus:', err)
      this.writeLocalDebug('error', 'Error en updateCallStatus', {
        callId,
        status,
        reason,
        error: err,
      })
      void this.logDebugEvent(callId, 'error', 'CallService', 'Error al actualizar estado de llamada', {
        status,
        reason,
        error: err,
      })
      throw err
    }
  }

  private async createCallViaRpc(doctorId: string, patientId: string, appointmentId?: string): Promise<Call> {
    // p_appointment_id added in migration 20260323100000 — cast needed until types are regenerated
    const rpcArgs: Record<string, unknown> = {
      p_doctor_id: doctorId,
      p_patient_id: patientId,
      ...(appointmentId && { p_appointment_id: appointmentId }),
    }
    const { data, error } = await this.supabase.rpc('create_call', rpcArgs as {
      p_doctor_id: string
      p_patient_id: string
    })

    if (error) throw error

    if (Array.isArray(data)) {
      const first = data[0]
      if (!first) throw new Error('RPC create_call returned no rows')
      void this.logDebugEvent(first.id, 'info', 'CallService', 'Llamada creada via RPC', {
        doctorId,
        patientId,
        roomId: first.room_id,
      })
      return first as Call
    }

    if (!data) throw new Error('RPC create_call returned empty payload')
    void this.logDebugEvent((data as Call).id, 'info', 'CallService', 'Llamada creada via RPC', {
      doctorId,
      patientId,
      roomId: (data as Call).room_id,
    })
    return data as Call
  }

  private async updateCallStatusViaRpc(callId: string, status: CallStatus, reason?: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('update_call_status', {
      p_call_id: callId,
      p_status: status,
      p_reason: reason ?? null
    })

    if (error) throw error
    return Boolean(data)
  }

  async getCall(callId: string): Promise<Call | null> {
    this.writeLocalDebug('info', 'Consultando llamada', { callId })
    const { data, error } = await this.supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle()

    if (error) throw error
    return data as Call | null
  }

  async getCallByRoomId(roomId: string): Promise<Call | null> {
    const { data, error } = await this.supabase
      .from('calls')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()

    if (error) throw error
    return data as Call | null
  }

  async getActiveCallsForDoctor(doctorId: string): Promise<Call[]> {
    this.writeLocalDebug('info', 'Consultando llamadas activas del doctor', { doctorId })
    const { data, error } = await this.supabase
      .from('calls')
      .select('*')
      .eq('doctor_id', doctorId)
      .in('status', ['requested', 'ringing', 'accepted', 'connecting', 'connected'])
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Call[]
  }

  async getActiveCallsForPatient(patientId: string): Promise<Call[]> {
    this.writeLocalDebug('info', 'Consultando llamadas activas del paciente', { patientId })
    const { data, error } = await this.supabase
      .from('calls')
      .select('*')
      .eq('patient_id', patientId)
      .in('status', ['requested', 'ringing', 'accepted', 'connecting', 'connected'])
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Call[]
  }

  async logEvent(callId: string, type: string, payload?: Json): Promise<void> {
    if (this.callEventsPersistenceDisabled) {
      return
    }

    this.writeLocalDebug('info', 'Persistiendo call_event', { callId, type, payload })
    const { error } = await this.supabase
      .from('call_events')
      .insert({
        call_id: callId,
        type,
        payload
      })

    if (error) {
      if (this.shouldDisableCallEventsPersistence(error)) {
        this.disableCallEventsPersistence(error)
        return
      }

      throw error
    }
  }

  async getCallEvents(callId: string): Promise<CallEvent[]> {
    this.writeLocalDebug('info', 'Leyendo call_events', { callId })
    const { data, error } = await this.supabase
      .from('call_events')
      .select('*')
      .eq('call_id', callId)
      .order('at', { ascending: true })

    if (error) throw error
    return data as CallEvent[]
  }

  // Subscribe to call changes
  subscribeToCall(callId: string, callback: (call: Call) => void) {
    this.writeLocalDebug('info', 'Suscribiendo realtime de llamada', { callId })
    const channel = this.supabase
      .channel(`call:${callId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `id=eq.${callId}`
      }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const nextCall = (payload.new ?? payload.old) as Call | undefined
        if (nextCall) {
          this.writeLocalDebug('info', 'Realtime de llamada recibido', {
            callId,
            status: nextCall.status,
            roomId: nextCall.room_id,
          })
          callback(nextCall)
        }
      })
      .subscribe()

    return () => {
      void this.supabase.removeChannel(channel)
    }
  }

  // Subscribe to calls for a user (doctor or patient)
  subscribeToUserCalls(userId: string, userType: 'doctor' | 'patient', callback: (call: Call) => void) {
    const column = userType === 'doctor' ? 'doctor_id' : 'patient_id'
    this.writeLocalDebug('info', 'Suscribiendo realtime de usuario', { userId, userType, column })

    const channel = this.supabase
      .channel(`user_calls:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `${column}=eq.${userId}`
      }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const nextCall = (payload.new ?? payload.old) as Call | undefined
        if (nextCall) {
          this.writeLocalDebug('info', 'Realtime de usuario recibido', {
            userId,
            userType,
            callId: nextCall.id,
            status: nextCall.status,
          })
          callback(nextCall)
        }
      })
      .subscribe()

    return () => {
      void this.supabase.removeChannel(channel)
    }
  }

  subscribeToCallEvents(callId: string, callback: (event: CallEvent) => void) {
    this.writeLocalDebug('info', 'Suscribiendo realtime de call_events', { callId })

    const channel = this.supabase
      .channel(`call_events:${callId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_events',
        filter: `call_id=eq.${callId}`,
      }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const nextEvent = (payload.new ?? payload.old) as CallEvent | undefined
        if (nextEvent) {
          callback(nextEvent)
        }
      })
      .subscribe()

    return () => {
      void this.supabase.removeChannel(channel)
    }
  }
}

// Utility function to generate room ID
export function generateRoomId(): string {
  return `room_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`
}

// Create service instance with environment variables.
// Passing an existing SupabaseClient avoids creating a new GoTrueClient instance.
export function createCallService(existingClient?: SupabaseClient<Database>): CallService {
  const supabaseUrl = getClientEnvOrDefault('PUBLIC_SUPABASE_URL', '')
  const supabaseKey = getClientEnvOrDefault('PUBLIC_SUPABASE_ANON_KEY', '')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return new CallService(supabaseUrl, supabaseKey, existingClient)
}
