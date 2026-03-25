 
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type {
  ChatStatusType,
  MedicalChatInsert,
  MedicalMessage,
  MedicalMessageInsert
} from '@autamedica/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { medicalChatService, type MedicalChatWithLastMessage } from '@/lib/patients/services/medical-chat.service';

interface UseMedicalChatsOptions {
  patientId?: string;
  activeOnly?: boolean;
}

interface UseMedicalChatsResult {
  chats: MedicalChatWithLastMessage[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createChat: (data: MedicalChatInsert) => Promise<{ success: boolean; chatId?: string; error?: unknown }>;
  updateChatStatus: (chatId: string, status: ChatStatusType) => Promise<{ success: boolean; error?: unknown }>;
}

export function useMedicalChats(
  options: UseMedicalChatsOptions = {}
): UseMedicalChatsResult {
  const supabase = useSupabase();
  const [chats, setChats] = useState<MedicalChatWithLastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await medicalChatService.fetchChats(supabase, {
        patientId: options.patientId,
        activeOnly: options.activeOnly,
      });

      setChats(data);
    } catch (err) {
      logger.error('Error fetching medical chats:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, options.patientId, options.activeOnly]);

  const createChat = useCallback(async (data: MedicalChatInsert) => {
    if (!supabase) {
      return { success: false, error: 'Supabase client not available' as unknown };
    }

    try {
      const result = await medicalChatService.createChat(supabase, data);
      await fetchChats();
      return {
        success: true,
        chatId: result.id,
      };
    } catch (err) {
      logger.error('Error creating chat:', err);
      return {
        success: false,
        error: err,
      };
    }
  }, [supabase, fetchChats]);

  const updateChatStatus = useCallback(async (
    chatId: string,
    status: ChatStatusType
  ) => {
    if (!supabase) {
      return { success: false, error: 'Supabase client not available' as unknown };
    }

    try {
      await medicalChatService.updateChatStatus(supabase, chatId, status);
      await fetchChats();
      return { success: true };
    } catch (err) {
      logger.error('Error updating chat status:', err);
      return {
        success: false,
        error: err,
      };
    }
  }, [supabase, fetchChats]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  return {
    chats,
    isLoading,
    error,
    refetch: fetchChats,
    createChat,
    updateChatStatus
  };
}

// Hook para mensajes de un chat específico con Realtime
interface UseChatMessagesResult {
  messages: MedicalMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, contentType?: 'text' | 'image' | 'document') => Promise<{ success: boolean; error?: unknown }>;
  markAsRead: (messageId: string) => Promise<void>;
}

export function useChatMessages(
  chatId: string | null,
  userId: string | null
): UseChatMessagesResult {
  const supabase = useSupabase();
  const [messages, setMessages] = useState<MedicalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!chatId || !supabase) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await medicalChatService.fetchMessages(supabase, chatId);
      setMessages((data || []) as MedicalMessage[]);
    } catch (err) {
      logger.error('Error fetching messages:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, chatId]);

  const sendMessage = useCallback(async (
    content: string,
    contentType: 'text' | 'image' | 'document' = 'text'
  ) => {
    if (!chatId || !userId || !supabase) {
      return {
        success: false,
        error: 'Missing chatId, userId, or supabase client',
      };
    }

    try {
      const messageData = {
        chat_id: chatId,
        author_type: 'patient' as const,
        author_id: userId,
        content_type: contentType,
        content,
        attachment_url: undefined,
      } as MedicalMessageInsert;

      await medicalChatService.sendMessage(supabase, chatId, userId, messageData);
      return { success: true };
    } catch (err) {
      logger.error('Error sending message:', err);
      return {
        success: false,
        error: err,
      };
    }
  }, [supabase, chatId, userId]);

  const markAsRead = useCallback(async (messageId: string) => {
    if (!supabase) return;

    try {
      await medicalChatService.markMessageAsRead(supabase, messageId);
    } catch (err) {
      logger.error('Error marking message as read:', err);
    }
  }, [supabase]);

  // Setup Realtime subscription
  useEffect(() => {
    if (!chatId || !supabase) return;

    const channel = supabase
      .channel(`medical_chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'medical_messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          // logger.info('New message received:', payload);
          const newMessage = payload.new as MedicalMessage;
          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, chatId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    markAsRead
  };
}
