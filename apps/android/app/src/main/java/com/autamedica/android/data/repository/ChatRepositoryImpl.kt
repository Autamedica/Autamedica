package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.AuthorType
import com.autamedica.android.domain.model.ChatStatus
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.model.MessageContentType
import com.autamedica.android.domain.repository.ChatRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : ChatRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // --- Cached state flows ---
    private val _chats = MutableStateFlow<List<MedicalChat>>(emptyList())
    private val _messagesByChat = mutableMapOf<String, MutableStateFlow<List<MedicalMessage>>>()

    // --- Realtime channels ---
    private var chatListChannel: RealtimeChannel? = null
    private val messageChannels = mutableMapOf<String, RealtimeChannel>()

    // ────────────────────────────────────────────────────────────
    //  Public API
    // ────────────────────────────────────────────────────────────

    override fun observeChats(): Flow<List<MedicalChat>> {
        scope.launch { loadChats() }
        scope.launch { subscribeToChatUpdates() }
        return _chats.asStateFlow()
    }

    override fun observeMessages(chatId: String): Flow<List<MedicalMessage>> {
        val flow = getOrCreateMessageFlow(chatId)
        scope.launch { loadMessages(chatId) }
        scope.launch { subscribeToMessageUpdates(chatId) }
        return flow.asStateFlow()
    }

    override suspend fun sendMessage(
        chatId: String,
        content: String,
        contentType: String,
    ): Result<Unit> = runCatching {
        val userId = requireUserId()
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"
        val authorType = if (role == "doctor") "doctor" else "patient"

        supabaseClient.postgrest
            .from("medical_messages")
            .insert(
                SendMessageDto(
                    chatId = chatId,
                    authorType = authorType,
                    authorId = userId,
                    contentType = contentType,
                    content = content,
                )
            )

        Timber.d("[Chat] Message sent to chat=$chatId")
    }.onFailure {
        Timber.e(it, "[Chat] Failed to send message")
    }

    override suspend fun markAsRead(chatId: String): Result<Unit> = runCatching {
        val userId = requireUserId()

        supabaseClient.postgrest
            .from("medical_messages")
            .update(mapOf("is_read" to true, "read_at" to "now()")) {
                filter {
                    eq("chat_id", chatId)
                    eq("is_read", false)
                    neq("author_id", userId)
                }
            }

        Timber.d("[Chat] Marked as read: chat=$chatId")
    }.onFailure {
        Timber.e(it, "[Chat] Failed to mark as read")
    }

    override suspend fun getTotalUnreadCount(): Result<Int> = runCatching {
        val userId = requireUserId()
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"

        // Get all chat IDs for this user
        val filterColumn = if (role == "doctor") "specialist_id" else "patient_id"
        val recordId = resolveRecordId(userId, role)

        val messages = supabaseClient.postgrest
            .from("medical_messages")
            .select(Columns.list("id", "chat_id")) {
                filter {
                    eq("is_read", false)
                    neq("author_id", userId)
                }
            }
            .decodeList<UnreadCountDto>()

        messages.size
    }.onFailure {
        Timber.e(it, "[Chat] Failed to get unread count")
    }

    // ────────────────────────────────────────────────────────────
    //  Data loaders
    // ────────────────────────────────────────────────────────────

    private suspend fun loadChats() {
        runCatching {
            val userId = requireUserId()
            val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"
            val recordId = resolveRecordId(userId, role)
            val filterColumn = if (role == "doctor") "specialist_id" else "patient_id"

            val dtos = supabaseClient.postgrest
                .from("medical_chats")
                .select(Columns.ALL) {
                    filter { eq(filterColumn, recordId) }
                    order("last_message_at", Order.DESCENDING)
                }
                .decodeList<MedicalChatDto>()

            _chats.value = dtos.map { it.toDomain() }
            Timber.d("[Chat] Loaded ${dtos.size} chats")
        }.onFailure {
            Timber.e(it, "[Chat] Failed to load chats")
        }
    }

    private suspend fun loadMessages(chatId: String) {
        runCatching {
            val dtos = supabaseClient.postgrest
                .from("medical_messages")
                .select(Columns.ALL) {
                    filter { eq("chat_id", chatId) }
                    order("created_at", Order.ASCENDING)
                }
                .decodeList<MedicalMessageDto>()

            getOrCreateMessageFlow(chatId).value = dtos.map { it.toDomain() }
            Timber.d("[Chat] Loaded ${dtos.size} messages for chat=$chatId")
        }.onFailure {
            Timber.e(it, "[Chat] Failed to load messages for chat=$chatId")
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Realtime subscriptions
    // ────────────────────────────────────────────────────────────

    private suspend fun subscribeToChatUpdates() {
        if (chatListChannel != null) return

        runCatching {
            val channel = supabaseClient.channel("medical-chats-list")
            val changeFlow = channel.postgresChangeFlow<PostgresAction>(
                schema = "public",
            ) {
                table = "medical_chats"
            }

            channel.subscribe()
            chatListChannel = channel

            changeFlow.collect {
                Timber.d("[Chat] Realtime chat list update: ${it::class.simpleName}")
                loadChats() // Reload all chats on any change
            }
        }.onFailure {
            Timber.e(it, "[Chat] Failed to subscribe to chat updates")
        }
    }

    private suspend fun subscribeToMessageUpdates(chatId: String) {
        if (messageChannels.containsKey(chatId)) return

        runCatching {
            val channel = supabaseClient.channel("medical-messages-$chatId")
            val changeFlow = channel.postgresChangeFlow<PostgresAction.Insert>(
                schema = "public",
            ) {
                table = "medical_messages"
                filter("chat_id", FilterOperator.EQ, chatId)
            }

            channel.subscribe()
            messageChannels[chatId] = channel

            changeFlow.collect { action ->
                Timber.d("[Chat] Realtime new message in chat=$chatId")
                // Parse the new record from the realtime payload
                val record = action.record
                val newMessage = MedicalMessage(
                    id = record["id"]?.jsonPrimitive?.content ?: return@collect,
                    chatId = record["chat_id"]?.jsonPrimitive?.content ?: chatId,
                    authorType = AuthorType.fromString(record["author_type"]?.jsonPrimitive?.content),
                    authorId = record["author_id"]?.jsonPrimitive?.content ?: "",
                    contentType = MessageContentType.fromString(record["content_type"]?.jsonPrimitive?.content),
                    content = record["content"]?.jsonPrimitive?.content ?: "",
                    attachmentUrl = record["attachment_url"]?.jsonPrimitive?.content,
                    isRead = record["is_read"]?.jsonPrimitive?.content?.toBooleanStrictOrNull() ?: false,
                    readAt = record["read_at"]?.jsonPrimitive?.content,
                    createdAt = record["created_at"]?.jsonPrimitive?.content ?: "",
                    senderName = null,
                )

                val flow = getOrCreateMessageFlow(chatId)
                val current = flow.value.toMutableList()
                if (current.none { it.id == newMessage.id }) {
                    current.add(newMessage)
                    flow.value = current
                }
            }
        }.onFailure {
            Timber.e(it, "[Chat] Failed to subscribe to messages for chat=$chatId")
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────

    private fun requireUserId(): String =
        securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

    private suspend fun resolveRecordId(userId: String, role: String): String {
        val table = if (role == "doctor") "doctors" else "patients"
        return supabaseClient.postgrest
            .from(table)
            .select(Columns.list("id")) { filter { eq("user_id", userId) } }
            .decodeSingle<RecordIdDto>().id
    }

    private fun getOrCreateMessageFlow(chatId: String): MutableStateFlow<List<MedicalMessage>> =
        _messagesByChat.getOrPut(chatId) { MutableStateFlow(emptyList()) }

    // ────────────────────────────────────────────────────────────
    //  DTOs
    // ────────────────────────────────────────────────────────────

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class UnreadCountDto(val id: String, @SerialName("chat_id") val chatId: String)

    @Serializable
    private data class SendMessageDto(
        @SerialName("chat_id") val chatId: String,
        @SerialName("author_type") val authorType: String,
        @SerialName("author_id") val authorId: String,
        @SerialName("content_type") val contentType: String,
        val content: String,
    )

    @Serializable
    private data class MedicalChatDto(
        val id: String,
        @SerialName("patient_id") val patientId: String,
        @SerialName("specialist_id") val specialistId: String,
        @SerialName("appointment_id") val appointmentId: String? = null,
        val status: String = "active",
        val subject: String,
        @SerialName("is_urgent") val isUrgent: Boolean = false,
        @SerialName("last_message_at") val lastMessageAt: String,
        @SerialName("created_at") val createdAt: String? = null,
    ) {
        fun toDomain() = MedicalChat(
            id = id,
            patientId = patientId,
            specialistId = specialistId,
            appointmentId = appointmentId,
            status = ChatStatus.fromString(status),
            subject = subject,
            isUrgent = isUrgent,
            lastMessageAt = lastMessageAt,
            lastMessagePreview = null,
            unreadCount = 0,
            otherParticipantName = null,
            otherParticipantAvatarUrl = null,
        )
    }

    @Serializable
    private data class MedicalMessageDto(
        val id: String,
        @SerialName("chat_id") val chatId: String,
        @SerialName("author_type") val authorType: String,
        @SerialName("author_id") val authorId: String,
        @SerialName("content_type") val contentType: String = "text",
        val content: String,
        @SerialName("attachment_url") val attachmentUrl: String? = null,
        @SerialName("is_read") val isRead: Boolean = false,
        @SerialName("read_at") val readAt: String? = null,
        @SerialName("created_at") val createdAt: String,
    ) {
        fun toDomain() = MedicalMessage(
            id = id,
            chatId = chatId,
            authorType = AuthorType.fromString(authorType),
            authorId = authorId,
            contentType = MessageContentType.fromString(contentType),
            content = content,
            attachmentUrl = attachmentUrl,
            isRead = isRead,
            readAt = readAt,
            createdAt = createdAt,
            senderName = null,
        )
    }
}
