/**
 * Service: Medical chat operations (fetch chats, create, update status, send messages, mark as read).
 * Business logic layer — delegates all DB access to medical-chat adapter.
 * No React dependencies. Called from useMedicalChats and useChatMessages hooks.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { ChatStatusType, MedicalChatInsert, MedicalMessageInsert } from '@autamedica/types'
import { createMedicalChatAdapter } from '@/lib/patients/lib/repos/medical-chat.adapter'
import type { MedicalChatRowWithRelations, MedicalMessageRow } from '@/lib/patients/ports/medical-chat.port'

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

function toChatWithLastMessage(item: MedicalChatRowWithRelations): MedicalChatWithLastMessage {
  const messages = item.messages || []
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const unreadCount = messages.filter(
    (m) => !m.is_read && m.author_type !== 'patient',
  ).length

  return {
    id: item.id,
    patient_id: item.patient_id,
    specialist_id: item.specialist_id,
    appointment_id: item.appointment_id,
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
  }
}

export const medicalChatService = {
  async fetchChats(
    supabase: Db,
    options: {
      patientId?: string
      activeOnly?: boolean
    } = {},
  ): Promise<MedicalChatWithLastMessage[]> {
    const chatRepo = createMedicalChatAdapter(supabase)
    const rows = await chatRepo.listChats(options)
    return rows.map(toChatWithLastMessage)
  },

  async createChat(
    supabase: Db,
    data: MedicalChatInsert,
  ): Promise<{ id: string }> {
    const chatRepo = createMedicalChatAdapter(supabase)
    return chatRepo.createChat(data)
  },

  async updateChatStatus(
    supabase: Db,
    chatId: string,
    status: ChatStatusType,
  ): Promise<void> {
    const chatRepo = createMedicalChatAdapter(supabase)
    await chatRepo.updateChatStatus(chatId, status)
  },

  async fetchMessages(supabase: Db, chatId: string): Promise<MedicalMessageRow[]> {
    const chatRepo = createMedicalChatAdapter(supabase)
    return chatRepo.listMessages(chatId)
  },

  async sendMessage(
    supabase: Db,
    chatId: string,
    userId: string,
    messageData: MedicalMessageInsert,
  ): Promise<void> {
    const chatRepo = createMedicalChatAdapter(supabase)
    await chatRepo.insertMessage(chatId, userId, messageData)
    await chatRepo.updateChatLastMessage(chatId, 'waiting_response')
  },

  async markMessageAsRead(supabase: Db, messageId: string): Promise<void> {
    const chatRepo = createMedicalChatAdapter(supabase)
    await chatRepo.markMessageAsRead(messageId)
  },
}
