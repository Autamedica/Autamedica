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

export interface IMedicalChatRepository {
  listChats(options?: {
    patientId?: string
    activeOnly?: boolean
  }): Promise<unknown[]>
  createChat(data: MedicalChatInsert): Promise<{ id: string }>
  updateChatStatus(chatId: string, status: ChatStatusType): Promise<void>
  listMessages(chatId: string): Promise<unknown[]>
  insertMessage(chatId: string, userId: string, data: MedicalMessageInsert): Promise<void>
  updateChatLastMessage(chatId: string, status: ChatStatusType): Promise<void>
  markMessageAsRead(messageId: string): Promise<void>
}
