import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { Database } from '@autamedica/types'
import { toCamel, logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'patient' | 'doctor' | 'assistant' | 'system'
  rawText: string
  createdAt: string
  metadata?: Record<string, unknown> | null
}

export interface ChatSession {
  id: string
  patientId: string
  doctorId?: string
  caseId: string
  status: 'active' | 'closed'
  channel: 'chat' | 'voice'
}

export interface AssignedChatDoctor {
  doctorId: string
  firstName: string | null
  lastName: string | null
  specialty: string | null
  label: string
}

type ChatClient = SupabaseClient<Database>
type ConversationEventRow = Database['public']['Tables']['conversation_events']['Row']
type ConversationSessionRow = Database['public']['Tables']['conversation_sessions']['Row']
const CHAT_MESSAGE_ROLES = new Set(['patient', 'doctor'])

function isChatMessageRow(row: ConversationEventRow): boolean {
  return row.event_type === 'message' && CHAT_MESSAGE_ROLES.has(row.role)
}

function mapAssignedDoctor(row: {
  doctor_id: string
  first_name: string | null
  last_name: string | null
  specialty: string | null
}): AssignedChatDoctor {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()

  return {
    doctorId: row.doctor_id,
    firstName: row.first_name,
    lastName: row.last_name,
    specialty: row.specialty,
    label: fullName ? `Dr. ${fullName}` : 'Tu médico',
  }
}

export const chatRepo = {
  async getAssignedDoctor(patientId: string, client: ChatClient = getBrowserSupabaseClient()): Promise<AssignedChatDoctor | null> {
    const { data, error } = await client.rpc('get_assigned_chat_doctor' as never, {
      target_patient_id: patientId,
    } as never)

    if (error) {
      logger.error('[chatRepo] getAssignedDoctor failed', error)
      throw error
    }

    const rows = data as unknown as Array<{
      doctor_id: string
      first_name: string | null
      last_name: string | null
      specialty: string | null
    }> | null

    return rows?.[0] ? mapAssignedDoctor(rows[0]) : null
  },

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

    return toCamel<ChatMessage[]>((data ?? []).filter(isChatMessageRow))
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
    const { data, error } = await client
      .rpc('get_or_create_p2p_chat_session' as never, {
        target_patient_id: payload.patientId,
        target_doctor_id: payload.doctorId,
        target_case_id: payload.caseId,
      } as never)

    if (error) {
      logger.error('[chatRepo] getOrCreateSession failed', error)
      throw error
    }

    return toCamel<ChatSession>(data as unknown as ConversationSessionRow)
  }
}
