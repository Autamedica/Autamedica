import { createClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import type { Call, CallStatus, CallEvent } from './types'

// Service for call management
export class CallService {
  private supabase: any
  private functionsBaseUrl: string
  private anonKey: string

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey)
    this.anonKey = supabaseKey
    this.functionsBaseUrl = `${new URL(supabaseUrl).origin}/functions/v1`
  }

  async createCall(doctorId: string, patientId: string): Promise<Call> {
    try {
      // Get auth session for authorization header
      const { data: { session } } = await this.supabase.auth.getSession()

      if (!session?.access_token) {
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
          patientId
        })
      })

      // Fallback path for environments where Edge Functions are not deployed yet
      if (response.status === 404) {
        logger.warn('create-call edge function not found, falling back to RPC')
        return await this.createCallViaRpc(doctorId, patientId)
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
        return result.call as Call
      }

      // Backward compatibility with direct payload responses
      return result as Call
    } catch (err) {
      logger.error('Error in createCall:', err)
      throw err
    }
  }

  async updateCallStatus(callId: string, status: CallStatus, reason?: string): Promise<boolean> {
    try {
      // Get auth session for authorization header
      const { data: { session } } = await this.supabase.auth.getSession()

      if (!session?.access_token) {
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
        return result.updated
      }

      return Boolean(result)
    } catch (err) {
      logger.error('Error in updateCallStatus:', err)
      throw err
    }
  }

  private async createCallViaRpc(doctorId: string, patientId: string): Promise<Call> {
    const { data, error } = await this.supabase.rpc('create_call', {
      p_doctor_id: doctorId,
      p_patient_id: patientId
    })

    if (error) throw error

    if (Array.isArray(data)) {
      const first = data[0]
      if (!first) throw new Error('RPC create_call returned no rows')
      return first as Call
    }

    if (!data) throw new Error('RPC create_call returned empty payload')
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
    const { data, error } = await this.supabase
      .from('calls')
      .select('*')
      .eq('patient_id', patientId)
      .in('status', ['requested', 'ringing', 'accepted', 'connecting', 'connected'])
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Call[]
  }

  async logEvent(callId: string, type: string, payload?: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .from('call_events')
      .insert({
        call_id: callId,
        type,
        payload
      })

    if (error) throw error
  }

  async getCallEvents(callId: string): Promise<CallEvent[]> {
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
    return this.supabase
      .channel(`call:${callId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `id=eq.${callId}`
      }, (payload: any) => {
        callback(payload.new as Call)
      })
      .subscribe()
  }

  // Subscribe to calls for a user (doctor or patient)
  subscribeToUserCalls(userId: string, userType: 'doctor' | 'patient', callback: (call: Call) => void) {
    const column = userType === 'doctor' ? 'doctor_id' : 'patient_id'

    return this.supabase
      .channel(`user_calls:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `${column}=eq.${userId}`
      }, (payload: any) => {
        callback(payload.new as Call)
      })
      .subscribe()
  }
}

// Utility function to generate room ID
export function generateRoomId(): string {
  return `room_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`
}

// Create service instance with environment variables
export function createCallService(): CallService {
  const supabaseUrl = getClientEnvOrDefault('NEXT_PUBLIC_SUPABASE_URL', '')
  const supabaseKey = getClientEnvOrDefault('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return new CallService(supabaseUrl, supabaseKey)
}
