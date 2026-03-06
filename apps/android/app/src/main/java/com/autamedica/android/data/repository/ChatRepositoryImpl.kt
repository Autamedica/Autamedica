package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.AuthorType
import com.autamedica.android.domain.model.ChatStatus
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.model.MessageContentType
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.logging.SecureLog
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
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.jsonPrimitive
import timber.log.Timber
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : ChatRepository {

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)

    // --- Cached state flows ---
    private val _chats = MutableStateFlow<List<MedicalChat>>(emptyList())
    private val _messagesByChat = mutableMapOf<String, MutableStateFlow<List<MedicalMessage>>>()

    // --- Name cache (auth user_id → "First Last") ---
    private val nameCache = mutableMapOf<String, String>()

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

        Timber.d("[Chat] Message sent")
    }.onFailure {
        SecureLog.error("[Chat] Failed to send message", it)
    }

    override suspend fun markAsRead(chatId: String): Result<Unit> = runCatching {
        val userId = requireUserId()
        val readAt = OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        supabaseClient.postgrest
            .from("medical_messages")
            .update(mapOf("is_read" to true, "read_at" to readAt)) {
                filter {
                    eq("chat_id", chatId)
                    eq("is_read", false)
                    neq("author_id", userId)
                }
            }

        Timber.d("[Chat] Marked as read")
    }.onFailure {
        SecureLog.error("[Chat] Failed to mark as read", it)
    }

    override suspend fun getTotalUnreadCount(): Result<Int> = runCatching {
        val userId = requireUserId()
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"

        val filterColumn = if (role == "doctor") "specialist_id" else "patient_id"
        val recordId = resolveRecordId(userId, role)
        val chatIds = supabaseClient.postgrest
            .from("medical_chats")
            .select(Columns.list("id")) {
                filter { eq(filterColumn, recordId) }
            }
            .decodeList<ChatIdDto>()
            .map { it.id }

        if (chatIds.isEmpty()) {
            return@runCatching 0
        }

        val messages = supabaseClient.postgrest
            .from("medical_messages")
            .select(Columns.list("id", "chat_id")) {
                filter {
                    isIn("chat_id", chatIds)
                    eq("is_read", false)
                    neq("author_id", userId)
                }
            }
            .decodeList<UnreadCountDto>()

        messages.size
    }.onFailure {
        SecureLog.error("[Chat] Failed to get unread count", it)
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

            if (dtos.isEmpty()) {
                _chats.value = emptyList()
                return@runCatching
            }

            val chatIds = dtos.map { it.id }

            // Resolve other participant: patient sees doctor name, doctor sees patient name
            val otherRecordIds = if (role == "doctor") {
                dtos.map { it.patientId }.toSet()
            } else {
                dtos.map { it.specialistId }.toSet()
            }
            val otherTable = if (role == "doctor") "patients" else "doctors"
            val otherUserIds = resolveUserIdsFromRecords(otherTable, otherRecordIds)
            batchResolveNames(otherUserIds.values.toSet())

            // Map recordId → display name
            val recordToName = otherUserIds.mapValues { (_, authId) -> nameCache[authId] }

            // Per-chat unread counts + last message preview
            val unreadMessages = supabaseClient.postgrest
                .from("medical_messages")
                .select(Columns.list("id", "chat_id")) {
                    filter {
                        isIn("chat_id", chatIds)
                        eq("is_read", false)
                        neq("author_id", userId)
                    }
                }
                .decodeList<UnreadCountDto>()

            val unreadByChatId = unreadMessages.groupBy { it.chatId }
                .mapValues { (_, msgs) -> msgs.size }

            // Last message per chat — fetch recent messages, deduplicate below
            val previewLimit = (chatIds.size * 20).toLong().coerceAtLeast(100)
            val lastMessages = supabaseClient.postgrest
                .from("medical_messages")
                .select(Columns.list("chat_id", "content", "content_type")) {
                    filter { isIn("chat_id", chatIds) }
                    order("created_at", Order.DESCENDING)
                    limit(previewLimit)
                }
                .decodeList<LastMessageDto>()

            val lastMessageByChatId = mutableMapOf<String, String>()
            for (msg in lastMessages) {
                if (!lastMessageByChatId.containsKey(msg.chatId)) {
                    lastMessageByChatId[msg.chatId] = when (msg.contentType) {
                        "image" -> "\uD83D\uDCF7 Imagen"
                        "audio" -> "\uD83C\uDFA4 Audio"
                        "document" -> "\uD83D\uDCC4 Documento"
                        else -> msg.content.take(80)
                    }
                }
            }

            _chats.value = dtos.map { dto ->
                val otherRecordId = if (role == "doctor") dto.patientId else dto.specialistId
                dto.toDomain().copy(
                    otherParticipantName = recordToName[otherRecordId],
                    unreadCount = unreadByChatId[dto.id] ?: 0,
                    lastMessagePreview = lastMessageByChatId[dto.id],
                )
            }
            Timber.d("[Chat] Loaded ${dtos.size} chats with names and unread counts")
        }.onFailure {
            SecureLog.error("[Chat] Failed to load chats", it)
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

            val authorIds = dtos.map { it.authorId }.toSet()
            batchResolveNames(authorIds)

            getOrCreateMessageFlow(chatId).value = dtos.map { dto ->
                dto.toDomain().copy(senderName = nameCache[dto.authorId])
            }
            Timber.d("[Chat] Loaded ${dtos.size} messages with sender names")
        }.onFailure {
            SecureLog.error("[Chat] Failed to load messages", it)
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
            SecureLog.error("[Chat] Failed to subscribe to chat updates", it)
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
                Timber.d("[Chat] Realtime new message")
                val record = action.record
                val authorId = record["author_id"]?.jsonPrimitive?.content ?: ""

                // Resolve sender name (uses cache, only queries if missing)
                if (authorId.isNotEmpty() && !nameCache.containsKey(authorId)) {
                    batchResolveNames(setOf(authorId))
                }

                val newMessage = MedicalMessage(
                    id = record["id"]?.jsonPrimitive?.content ?: return@collect,
                    chatId = record["chat_id"]?.jsonPrimitive?.content ?: chatId,
                    authorType = AuthorType.fromString(record["author_type"]?.jsonPrimitive?.content),
                    authorId = authorId,
                    contentType = MessageContentType.fromString(record["content_type"]?.jsonPrimitive?.content),
                    content = record["content"]?.jsonPrimitive?.content ?: "",
                    attachmentUrl = record["attachment_url"]?.jsonPrimitive?.content,
                    isRead = record["is_read"]?.jsonPrimitive?.content?.toBooleanStrictOrNull() ?: false,
                    readAt = record["read_at"]?.jsonPrimitive?.content,
                    createdAt = record["created_at"]?.jsonPrimitive?.content ?: "",
                    senderName = nameCache[authorId],
                )

                val flow = getOrCreateMessageFlow(chatId)
                val current = flow.value.toMutableList()
                if (current.none { it.id == newMessage.id }) {
                    current.add(newMessage)
                    flow.value = current
                }
            }
        }.onFailure {
            SecureLog.error("[Chat] Failed to subscribe to messages", it)
        }
    }

    override suspend fun cleanup() {
        chatListChannel?.let {
            runCatching { supabaseClient.realtime.removeChannel(it) }
            chatListChannel = null
        }
        messageChannels.values.forEach { channel ->
            runCatching { supabaseClient.realtime.removeChannel(channel) }
        }
        messageChannels.clear()
        _messagesByChat.clear()
        nameCache.clear()
        _chats.value = emptyList()
        Timber.d("[Chat] Cleanup complete — channels and caches cleared")
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

    private suspend fun resolveUserIdsFromRecords(
        table: String,
        recordIds: Set<String>,
    ): Map<String, String> {
        if (recordIds.isEmpty()) return emptyMap()
        val rows = supabaseClient.postgrest
            .from(table)
            .select(Columns.list("id", "user_id")) {
                filter { isIn("id", recordIds.toList()) }
            }
            .decodeList<RecordUserIdDto>()
        return rows.associate { it.id to it.userId }
    }

    private suspend fun batchResolveNames(authUserIds: Set<String>) {
        val missing = authUserIds.filter { it.isNotEmpty() && !nameCache.containsKey(it) }
        if (missing.isEmpty()) return

        runCatching {
            val profiles = supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("user_id", "first_name", "last_name")) {
                    filter { isIn("user_id", missing) }
                }
                .decodeList<ProfileNameDto>()

            for (p in profiles) {
                val name = listOfNotNull(p.firstName, p.lastName)
                    .joinToString(" ")
                    .ifBlank { "Usuario" }
                nameCache[p.userId] = name
            }
        }.onFailure {
            SecureLog.error("[Chat] Failed to resolve names", it)
        }
    }

    private fun getOrCreateMessageFlow(chatId: String): MutableStateFlow<List<MedicalMessage>> =
        _messagesByChat.getOrPut(chatId) { MutableStateFlow(emptyList()) }

    // ────────────────────────────────────────────────────────────
    //  DTOs
    // ────────────────────────────────────────────────────────────

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class RecordUserIdDto(
        val id: String,
        @SerialName("user_id") val userId: String,
    )

    @Serializable
    private data class ChatIdDto(val id: String)

    @Serializable
    private data class UnreadCountDto(val id: String, @SerialName("chat_id") val chatId: String)

    @Serializable
    private data class ProfileNameDto(
        @SerialName("user_id") val userId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
    )

    @Serializable
    private data class LastMessageDto(
        @SerialName("chat_id") val chatId: String,
        val content: String,
        @SerialName("content_type") val contentType: String = "text",
    )

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
