import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { toCamel, logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'patient' | 'doctor' | 'assistant' | 'system'
  rawText: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface ChatSession {
  id: string
  patientId: string
  doctorId?: string
  caseId: string
  status: 'active' | 'closed'
  channel: 'chat' | 'voice'
}

type ChatClient = SupabaseClient

export const chatRepo = {
  async getMessages(sessionId: string, client: ChatClient = getBrowserSupabaseClient()): Promise<ChatMessage[]> {
    const { data, error } = await client
      .from('conversation_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence_number', { ascending: true })

    if (error) {
      logger.error('[chatRepo] getMessages failed', error)
      throw error
    }

    return toCamel<ChatMessage[]>(data ?? [])
  },

  async sendMessage(
    payload: {
      sessionId: string
      patientId: string
      caseId: string
      role: 'patient' | 'doctor'
      text: string
      channel?: 'text' | 'voice'
    },
    client: ChatClient = getBrowserSupabaseClient()
  ): Promise<ChatMessage> {
    const { data, error } = await client
      .from('conversation_events')
      .insert({
        session_id: payload.sessionId,
        patient_id: payload.patientId,
        case_id: payload.caseId,
        role: payload.role,
        raw_text: payload.text,
        event_type: 'message',
        channel: payload.channel ?? 'text'
      })
      .select()
      .single()

    if (error) {
      logger.error('[chatRepo] sendMessage failed', error)
      throw error
    }

    return toCamel<ChatMessage>(data)
  },

  async getOrCreateSession(
    payload: {
      patientId: string
      doctorId: string
      caseId: string
    },
    client: ChatClient = getBrowserSupabaseClient()
  ): Promise<ChatSession> {
    // Try to find active session
    const { data: existing } = await client
      .from('conversation_sessions')
      .select('*')
      .eq('patient_id', payload.patientId)
      .eq('doctor_id', payload.doctorId)
      .eq('case_id', payload.caseId)
      .eq('status', 'active')
      .eq('channel', 'chat')
      .maybeSingle()

    if (existing) {
      return toCamel<ChatSession>(existing)
    }

    // Create new
    const { data, error } = await client
      .from('conversation_sessions')
      .insert({
        patient_id: payload.patientId,
        doctor_id: payload.doctorId,
        case_id: payload.caseId,
        status: 'active',
        channel: 'chat',
        workflow_type: 'p2p_chat'
      })
      .select()
      .single()

    if (error) {
      logger.error('[chatRepo] createSession failed', error)
      throw error
    }

    return toCamel<ChatSession>(data)
  }
}
