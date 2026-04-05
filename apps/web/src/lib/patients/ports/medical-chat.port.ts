import type { ChatStatusType, MedicalChatInsert, MedicalMessageInsert } from '@autamedica/types'

export interface MedicalChatRow {
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
}

export interface MedicalMessageRow {
  id: string
  chat_id: string
  author_type: string
  author_id: string
  content_type: string
  content: string
  attachment_url: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface MedicalChatRowWithRelations extends MedicalChatRow {
  messages: Array<{
    content: string
    author_type: string
    is_read: boolean
    created_at: string
  }>
  specialist: {
    doctor: {
      first_name: string | null
      last_name: string | null
    } | null
  } | null
}

export interface IMedicalChatRepository {
  listChats(options?: {
    patientId?: string
    activeOnly?: boolean
  }): Promise<MedicalChatRowWithRelations[]>
  createChat(data: MedicalChatInsert): Promise<{ id: string }>
  updateChatStatus(chatId: string, status: ChatStatusType): Promise<void>
  listMessages(chatId: string): Promise<MedicalMessageRow[]>
  insertMessage(chatId: string, userId: string, data: MedicalMessageInsert): Promise<void>
  updateChatLastMessage(chatId: string, status: ChatStatusType): Promise<void>
  markMessageAsRead(messageId: string): Promise<void>
}
