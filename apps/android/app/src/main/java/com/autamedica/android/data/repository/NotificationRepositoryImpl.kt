package com.autamedica.android.data.repository

import android.content.Context
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PortalNotification
import com.autamedica.android.domain.model.PushPayload
import com.autamedica.android.domain.repository.NotificationRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.service.NotificationHelper
import dagger.hilt.android.qualifiers.ApplicationContext
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.jsonPrimitive
import timber.log.Timber
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : NotificationRepository {

    private val repositoryScope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _notifications = MutableStateFlow<List<PortalNotification>>(emptyList())
    private val _unreadCount = MutableStateFlow(0)

    private var realtimeChannel: RealtimeChannel? = null

    override fun observeNotifications(): StateFlow<List<PortalNotification>> = _notifications.asStateFlow()

    override fun observeUnreadCount(): StateFlow<Int> = _unreadCount.asStateFlow()

    override suspend fun registerFcmToken(token: String): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
                ?: throw IllegalStateException("No user ID found — cannot register FCM token")

            val persistedToken = supabaseClient.postgrest
                .from("profiles")
                .update(FcmTokenDto(fcmToken = token, platform = "android")) {
                    filter { eq("user_id", userId) }
                    select(Columns.list("fcm_token", "device_platform"))
                }
                .decodeSingleOrNull<FcmTokenDto>()

            check(persistedToken?.fcmToken == token && persistedToken.platform == "android") {
                "Supabase did not confirm persistence of the active FCM token"
            }
            securePreferences.putString(KEY_FCM_TOKEN, token)
            Timber.d("[Notifications] FCM token registered")
        }.onFailure {
            SecureLog.error("[Notifications] Failed to register FCM token", it)
        }
    }

    override suspend fun clearFcmToken(): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            if (userId != null) {
                supabaseClient.postgrest
                    .from("profiles")
                    .update(FcmTokenDto(fcmToken = null, platform = null)) {
                        filter { eq("user_id", userId) }
                    }
            }
            securePreferences.remove(KEY_FCM_TOKEN)
            realtimeChannel?.let {
                runCatching { supabaseClient.realtime.removeChannel(it) }
            }
            realtimeChannel = null
            _notifications.value = emptyList()
            _unreadCount.value = 0
            Timber.d("[Notifications] FCM token and channels cleared")
        }.onFailure {
            SecureLog.error("[Notifications] Failed to clear FCM token", it)
        }
    }

    override fun getCachedToken(): String? =
        securePreferences.getString(KEY_FCM_TOKEN)

    override suspend fun getNotifications(limit: Int): Result<List<PortalNotification>> = withContext(ioDispatcher) {
        runCatching {
            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
                ?: return@runCatching emptyList()

            // An empty successful response is authoritative: no invented messages
            // and no stale inbox content from a previous fetch. Only a network
            // failure may fall back to the in-memory cache.
            val remoteResult = runCatching {
                supabaseClient.postgrest
                    .from("portal_notifications")
                    .select {
                        filter {
                            eq("user_id", userId)
                        }
                        order(column = "created_at", order = Order.DESCENDING)
                        limit(limit.toLong())
                    }
                    .decodeList<PortalNotification>()
            }.onFailure { error ->
                SecureLog.warn("[Notifications] Failed to query portal_notifications, retaining cached messages", error)
            }

            val finalNotifications = resolvePortalInbox(remoteResult, _notifications.value)

            _notifications.value = finalNotifications
            _unreadCount.value = finalNotifications.count { !it.isRead }
            finalNotifications
        }.onFailure {
            SecureLog.error("[Notifications] Error getting notifications", it)
        }
    }

    override suspend fun markAsRead(id: String): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val nowStr = Instant.now().toString()
            _notifications.update { currentList ->
                currentList.map { item ->
                    if (item.id == id) item.copy(readAt = nowStr) else item
                }
            }
            _unreadCount.value = _notifications.value.count { !it.isRead }

            runCatching {
                supabaseClient.postgrest
                    .from("portal_notifications")
                    .update(mapOf("read_at" to nowStr)) {
                        filter { eq("id", id) }
                    }
            }.onFailure {
                SecureLog.warn("[Notifications] Could not sync markAsRead to Supabase", it)
            }
            Unit
        }
    }

    override suspend fun markAllAsRead(): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val nowStr = Instant.now().toString()
            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)

            _notifications.update { currentList ->
                currentList.map { it.copy(readAt = it.readAt ?: nowStr) }
            }
            _unreadCount.value = 0

            if (userId != null) {
                runCatching {
                    supabaseClient.postgrest
                        .from("portal_notifications")
                        .update(mapOf("read_at" to nowStr)) {
                            filter {
                                eq("user_id", userId)
                                exact("read_at", null)
                            }
                        }
                }.onFailure {
                    SecureLog.warn("[Notifications] Could not sync markAllAsRead to Supabase", it)
                }
            }
            Unit
        }
    }

    override suspend fun startRealtimeListener() {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: return
        if (realtimeChannel != null) return

        repositoryScope.launch {
            runCatching {
                val channel = supabaseClient.channel("portal-notifs-$userId")
                val changeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "portal_notifications"
                    filter("user_id", FilterOperator.EQ, userId)
                }

                channel.subscribe()
                realtimeChannel = channel
                Timber.d("[Notifications] Realtime channel subscribed for user $userId")

                changeFlow.collect { action ->
                    when (action) {
                        is PostgresAction.Insert -> {
                            val record = action.record
                            // Without a server ID, a Realtime event cannot be deduplicated.
                            val id = record["id"]?.jsonPrimitive?.content
                                ?.takeIf { it.isNotBlank() } ?: return@collect
                            val title = record["title"]?.jsonPrimitive?.content ?: "AutaMedica"
                            val body = record["body"]?.jsonPrimitive?.content ?: ""
                            val category = record["category"]?.jsonPrimitive?.content ?: "appointment"
                            val type = record["type"]?.jsonPrimitive?.content ?: "general"
                            val actionUrl = record["action_url"]?.jsonPrimitive?.content
                            val actionLabel = record["action_label"]?.jsonPrimitive?.content

                            val newNotification = PortalNotification(
                                id = id,
                                userId = userId,
                                category = category,
                                type = type,
                                title = title,
                                body = body,
                                actionUrl = actionUrl,
                                actionLabel = actionLabel,
                                readAt = null,
                                createdAt = Instant.now().toString(),
                            )

                            // Replayed INSERT events (or a concurrent inbox refresh)
                            // must never increase the badge or display a second toast.
                            val isNew = _notifications.value.none { it.id == id }
                            _notifications.update { current ->
                                addPortalNotificationIfNew(current, newNotification)
                            }
                            _unreadCount.value = _notifications.value.count { !it.isRead }

                            if (isNew) {
                                showLocalNotification(
                                    title = title,
                                    body = body,
                                    category = category,
                                    deepLink = actionUrl,
                                )
                            }
                        }
                        is PostgresAction.Update -> {
                            getNotifications()
                        }
                        else -> Unit
                    }
                }
            }.onFailure {
                SecureLog.error("[Notifications] Failed realtime subscription", it)
            }
        }
    }

    override fun showLocalNotification(
        title: String,
        body: String,
        category: String,
        deepLink: String?,
    ) {
        val notifType = when (category.lowercase()) {
            "appointment" -> NotificationType.APPOINTMENT_NEW
            "chat", "message" -> NotificationType.MESSAGE_NEW
            "prescription" -> NotificationType.PRESCRIPTION_READY
            "call" -> NotificationType.CALL_STARTED
            else -> NotificationType.GENERAL
        }

        val payload = PushPayload(
            type = notifType,
            title = title,
            body = body,
            deepLink = deepLink,
        )

        // Purely an Android system notification. Persisting a new row here
        // would trigger PostgresAction.Insert and recurse indefinitely.
        // portal_notifications is written by the authorized backend only.
        NotificationHelper.show(context, payload)
    }

    companion object {
        private const val KEY_FCM_TOKEN = "fcm_token"
    }
}

@Serializable
private data class FcmTokenDto(
    @SerialName("fcm_token") val fcmToken: String?,
    @SerialName("device_platform") val platform: String?,
)
