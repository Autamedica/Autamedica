/**
 * Adapter: medical_chats + medical_messages table access.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ChatStatusType, MedicalChatInsert, MedicalMessageInsert } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IMedicalChatRepository, MedicalChatRowWithRelations, MedicalMessageRow } from '@/lib/patients/ports/medical-chat.port'

type Db = SupabaseClient<Database>

export function createMedicalChatAdapter(supabase: Db): IMedicalChatRepository {
  return {
    async listChats(options?: {
      patientId?: string
      activeOnly?: boolean
    }): Promise<MedicalChatRowWithRelations[]> {
      let query = supabase.from('medical_chats').select(
        `
          *,
          specialist:reproductive_health_specialists!inner (
            doctor:doctors!inner (
              first_name,
              last_name
            )
          ),
          messages:medical_messages (
            content,
            author_type,
            created_at,
            is_read
          )
        `,
      )

      if (options?.patientId) {
        query = query.eq('patient_id', options.patientId)
      }

      if (options?.activeOnly) {
        query = query.in('status', ['active', 'waiting_response'])
      }

      query = query.order('last_message_at', { ascending: false })

      const { data, error } = await query

      if (error) {
        logger.error('[medicalChatRepo] listChats failed', error)
        throw error
      }

      return (data ?? []) as MedicalChatRowWithRelations[]
    },

    async createChat(data: MedicalChatInsert): Promise<{ id: string }> {
      const insertData = {
        patient_id: data.patient_id,
        specialist_id: data.specialist_id,
        subject: data.subject,
        is_urgent: data.is_urgent || false,
        status: 'active' as ChatStatusType,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data: result, error } = await supabase
        .from('medical_chats')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        logger.error('[medicalChatRepo] createChat failed', error)
        throw error
      }

      if (!result || typeof result !== 'object' || !('id' in result)) {
        throw new Error('Failed to retrieve chat ID')
      }

      return { id: result.id as string }
    },

    async updateChatStatus(chatId: string, status: ChatStatusType): Promise<void> {
      const { error } = await supabase
        .from('medical_chats')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', chatId)

      if (error) {
        logger.error('[medicalChatRepo] updateChatStatus failed', error)
        throw error
      }
    },

    async listMessages(chatId: string): Promise<MedicalMessageRow[]> {
      const { data, error } = await supabase
        .from('medical_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })

      if (error) {
        logger.error('[medicalChatRepo] listMessages failed', error)
        throw error
      }

      return (data ?? []) as MedicalMessageRow[]
    },

    async insertMessage(
      chatId: string,
      userId: string,
      data: MedicalMessageInsert,
    ): Promise<void> {
      const messageInsert = {
        chat_id: chatId,
        author_type: 'patient',
        author_id: userId,
        content_type: data.content_type || 'text',
        content: data.content,
        attachment_url: data.attachment_url,
        is_read: false,
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('medical_messages')
        .insert(messageInsert)

      if (error) {
        logger.error('[medicalChatRepo] insertMessage failed', error)
        throw error
      }
    },

    async updateChatLastMessage(chatId: string, status: ChatStatusType): Promise<void> {
      const { error } = await supabase
        .from('medical_chats')
        .update({
          last_message_at: new Date().toISOString(),
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', chatId)

      if (error) {
        logger.error('[medicalChatRepo] updateChatLastMessage failed', error)
        throw error
      }
    },

    async markMessageAsRead(messageId: string): Promise<void> {
      const { error } = await supabase
        .from('medical_messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', messageId)

      if (error) {
        logger.error('[medicalChatRepo] markMessageAsRead failed', error)
        throw error
      }
    },
  }
}
