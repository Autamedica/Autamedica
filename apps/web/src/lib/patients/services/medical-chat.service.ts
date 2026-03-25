/**
 * Service: Medical chat operations (fetch chats, create, update status, send messages, mark as read).
 * Pure async functions for DB queries and mutations.
 * No React dependencies. Called from useMedicalChats and useChatMessages hooks.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { ChatStatusType, MedicalChatInsert, MedicalMessageInsert } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export interface MedicalChatWithLastMessage {
  id: string
  patient_id: string
  specialist_id: string
  appointment_id: string | null
  status: string
  subject: string
  is_urgent: boolean
  last_message_at: string
  created_at: string
  updated_at: string
  last_message_content: string
  last_message_author: string
  unread_count: number
  specialist_name: string
}

export const medicalChatService = {
  async fetchChats(
    supabase: Db,
    options: {
      patientId?: string
      activeOnly?: boolean
    } = {},
  ): Promise<MedicalChatWithLastMessage[]> {
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

    if (options.patientId) {
      query = query.eq('patient_id', options.patientId)
    }

    if (options.activeOnly) {
      query = query.in('status', ['active', 'waiting_response'])
    }

    query = query.order('last_message_at', { ascending: false })

    const { data, error: fetchError } = await query

    if (fetchError) {
      logger.error('[medicalChatService] fetchChats failed', fetchError)
      throw fetchError
    }

    const transformedData: MedicalChatWithLastMessage[] = (data || []).map((dbItem) => {
      const item = dbItem as unknown as Record<string, unknown> & {
        id: string
        patient_id: string
        specialist_id: string
        appointment_id?: string
        status: string
        subject: string
        is_urgent: boolean
        last_message_at: string
        created_at: string
        updated_at: string
        messages?: Array<{
          content: string
          author_type: string
          is_read: boolean
          created_at: string
        }>
        specialist?: {
          doctor?: {
            first_name?: string
            last_name?: string
          }
        }
      }

      const messages = item.messages || []
      const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : null
      const unreadCount = messages.filter(
        (m) => !m.is_read && m.author_type !== 'patient',
      ).length

      return {
        id: item.id,
        patient_id: item.patient_id,
        specialist_id: item.specialist_id,
        appointment_id: item.appointment_id || null,
        status: item.status,
        subject: item.subject,
        is_urgent: item.is_urgent,
        last_message_at: item.last_message_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        last_message_content: lastMessage?.content || '',
        last_message_author: lastMessage?.author_type || 'system',
        unread_count: unreadCount,
        specialist_name: `Dr. ${item.specialist?.doctor?.first_name || ''} ${item.specialist?.doctor?.last_name || ''}`.trim(),
      } as unknown as MedicalChatWithLastMessage
    })

    return transformedData
  },

  async createChat(
    supabase: Db,
    data: MedicalChatInsert,
  ): Promise<{ id: string }> {
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

    const { data: result, error: insertError } = await supabase
      .from('medical_chats')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      logger.error('[medicalChatService] createChat failed', insertError)
      throw insertError
    }

    if (!result || typeof result !== 'object' || !('id' in result)) {
      throw new Error('Failed to retrieve chat ID')
    }

    return { id: result.id as string }
  },

  async updateChatStatus(
    supabase: Db,
    chatId: string,
    status: ChatStatusType,
  ): Promise<void> {
    const { error: updateError } = await supabase
      .from('medical_chats')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId)

    if (updateError) {
      logger.error('[medicalChatService] updateChatStatus failed', updateError)
      throw updateError
    }
  },

  async fetchMessages(supabase: Db, chatId: string): Promise<unknown[]> {
    const { data, error: fetchError } = await supabase
      .from('medical_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      logger.error('[medicalChatService] fetchMessages failed', fetchError)
      throw fetchError
    }

    return data || []
  },

  async sendMessage(
    supabase: Db,
    chatId: string,
    userId: string,
    messageData: MedicalMessageInsert,
  ): Promise<void> {
    const messageInsert = {
      chat_id: chatId,
      author_type: 'patient',
      author_id: userId,
      content_type: messageData.content_type || 'text',
      content: messageData.content,
      attachment_url: messageData.attachment_url,
      is_read: false,
      created_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase
      .from('medical_messages')
      .insert(messageInsert)

    if (insertError) {
      logger.error('[medicalChatService] sendMessage failed', insertError)
      throw insertError
    }

    // Update chat's last_message_at
    const { error: updateError } = await supabase
      .from('medical_chats')
      .update({
        last_message_at: new Date().toISOString(),
        status: 'waiting_response',
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId)

    if (updateError) {
      logger.error('[medicalChatService] sendMessage chat update failed', updateError)
      throw updateError
    }
  },

  async markMessageAsRead(supabase: Db, messageId: string): Promise<void> {
    const { error } = await supabase
      .from('medical_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    if (error) {
      logger.error('[medicalChatService] markMessageAsRead failed', error)
      throw error
    }
  },
}
