package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.MedicalMessage
import kotlinx.coroutines.flow.Flow

interface ChatRepository {

    /** Returns a flow of all chats for the current user, updated in realtime via Supabase Realtime. */
    fun observeChats(): Flow<List<MedicalChat>>

    /** Returns a flow of messages for a specific chat, updated in realtime. */
    fun observeMessages(chatId: String): Flow<List<MedicalMessage>>

    /** Sends a text message to a chat. */
    suspend fun sendMessage(chatId: String, content: String, contentType: String = "text"): Result<Unit>

    /** Marks all unread messages in a chat as read for the current user. */
    suspend fun markAsRead(chatId: String): Result<Unit>

    /** Returns the total number of unread messages across all chats. */
    suspend fun getTotalUnreadCount(): Result<Int>

    /** Unsubscribes from realtime channels and clears cached state. Call on logout. */
    suspend fun cleanup()
}
