'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { chatRepo, type ChatMessage } from '@/lib/doctors/lib/repos/chat'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { logger } from '@autamedica/shared'
import type { Database } from '@autamedica/types'

interface UseChatProps {
  patientId: string
  doctorId: string
  caseId: string
  role: 'doctor' | 'patient'
}

const CHAT_MESSAGE_ROLES = new Set(['patient', 'doctor'])

export function useChat({ patientId, doctorId, caseId, role }: UseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const loadChat = useCallback(async () => {
    if (!patientId || !doctorId || !caseId) {
      setMessages([])
      setSessionId(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      setMessages([])
      setSessionId(null)
      const session = await chatRepo.getOrCreateSession({ patientId, doctorId, caseId })
      setSessionId(session.id)
      
      const history = await chatRepo.getMessages(session.id)
      setMessages(history)
    } catch (err) {
      logger.error('[useChat] Failed to load chat', err)
      setError('No pudimos abrir el canal seguro con este profesional.')
    } finally {
      setLoading(false)
    }
  }, [patientId, doctorId, caseId])

  useEffect(() => {
    void loadChat()
  }, [loadChat])

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return

    const supabase = getBrowserSupabaseClient()
    const channel = supabase
      .channel(`chat:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_events',
          filter: `session_id=eq.${sessionId}`
        },
         (payload) => {
           const newMessage = payload.new as Database['public']['Tables']['conversation_events']['Row']
           if (
            newMessage.event_type !== 'message'
            || !CHAT_MESSAGE_ROLES.has(newMessage.role)
            || typeof newMessage.raw_text !== 'string'
          ) {
            return
          }

          const mapped: ChatMessage = {
            id: newMessage.id,
            sessionId: newMessage.session_id,
            role: newMessage.role,
            rawText: newMessage.raw_text,
            createdAt: newMessage.created_at,
            metadata: newMessage.metadata
          }
          
          setMessages(current => {
            if (current.some(m => m.id === mapped.id)) return current
            return [...current, mapped]
          })
        }
      )
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [sessionId])

  const sendMessage = async (text: string) => {
    if (!sessionId || !text.trim()) return
    
    try {
      setSending(true)
      setError(null)
      await chatRepo.sendMessage({
        sessionId,
        patientId,
        caseId,
        role,
        text
      })
    } catch (err) {
      logger.error('[useChat] Failed to send message', err)
      setError('No pudimos enviar el mensaje. Intentá nuevamente.')
      throw err
    } finally {
      setSending(false)
    }
  }

  return {
    messages,
    loading,
    sending,
    error,
    sendMessage,
    sessionId
  }
}
