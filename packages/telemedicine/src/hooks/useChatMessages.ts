import { useState, useCallback, useRef } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { TelemedicineDebugLevel } from '../debug'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'

export interface UiChatMessage {
  id: string
  text: string
  senderId: string
  senderType: string
  senderName?: string
  senderLabel: string
  timestamp: number
  mine: boolean
}

interface UseChatMessagesOptions {
  client: WebRTCClient | CloudflareCallsClient | null
  userId: string
  userType: string
  userName?: string
  emitDebug: (level: TelemedicineDebugLevel, message: string, payload?: Record<string, unknown>) => void
  setCallError: (error: string | null) => void
}

export function useChatMessages({
  client, userId, userType, userName, emitDebug, setCallError,
}: UseChatMessagesOptions) {
  const [chatMessages, setChatMessages] = useState<UiChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false)
  const chatPanelOpenRef = useRef(false)

  const syncPanelRef = useCallback((open: boolean) => {
    chatPanelOpenRef.current = open
  }, [])

  const addRemoteMessage = useCallback((message: { id: string; text: string; senderId: string; senderType: string; senderName?: string; timestamp: number }) => {
    setChatMessages((prev) => [
      ...prev,
      { ...message, mine: false, senderLabel: message.senderName || message.senderId },
    ])
    if (!chatPanelOpenRef.current) setUnreadMessages((prev) => prev + 1)
  }, [])

  const sendChat = useCallback(() => {
    if (!client) return
    const text = chatInput.trim()
    if (!text) return

    if (!client.sendChatMessage(text)) {
      emitDebug('warn', 'Envio de chat rechazado porque el canal no esta listo')
      setCallError('Chat aún no listo. Espera la conexión del otro participante.')
      return
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        senderId: userId,
        senderType: userType,
        senderName: userName,
        senderLabel: 'Tú',
        timestamp: Date.now(),
        mine: true,
      },
    ])
    setChatInput('')
    setCallError(null)
    emitDebug('info', 'Mensaje de chat enviado', { length: text.length })
  }, [chatInput, client, emitDebug, setCallError, userId, userName, userType])

  const handleChatSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      sendChat()
    },
    [sendChat]
  )

  const handleChatKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendChat()
      }
    },
    [sendChat]
  )

  const toggleChatPanel = useCallback(() => {
    setIsChatPanelOpen((prev) => {
      const next = !prev
      chatPanelOpenRef.current = next
      if (next) setUnreadMessages(0)
      return next
    })
  }, [])

  return {
    chatMessages,
    chatInput,
    setChatInput,
    unreadMessages,
    isChatPanelOpen,
    setIsChatPanelOpen,
    syncPanelRef,
    addRemoteMessage,
    sendChat,
    handleChatSubmit,
    handleChatKeyDown,
    toggleChatPanel,
  }
}
