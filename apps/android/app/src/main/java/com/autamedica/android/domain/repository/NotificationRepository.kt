package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.PortalNotification
import kotlinx.coroutines.flow.StateFlow

/**
 * Manages FCM push notifications and in-app portal notifications.
 */
interface NotificationRepository {
    /** Persist the FCM token to Supabase `profiles.fcm_token`. */
    suspend fun registerFcmToken(token: String): Result<Unit>

    /** Remove the stored FCM token (e.g., on logout). */
    suspend fun clearFcmToken(): Result<Unit>

    /** Get the current locally-cached FCM token, or null if not yet registered. */
    fun getCachedToken(): String?

    /** Fetch recent portal notifications from Supabase */
    suspend fun getNotifications(limit: Int = 30): Result<List<PortalNotification>>

    /** Reactive flow of in-app notifications */
    fun observeNotifications(): StateFlow<List<PortalNotification>>

    /** Reactive flow of unread notifications count */
    fun observeUnreadCount(): StateFlow<Int>

    /** Mark a notification as read */
    suspend fun markAsRead(id: String): Result<Unit>

    /** Mark all notifications as read */
    suspend fun markAllAsRead(): Result<Unit>

    /** Listen to real-time notification inserts from Supabase */
    suspend fun startRealtimeListener()

    /** Trigger an immediate real Android notification in status bar */
    fun showLocalNotification(
        title: String,
        body: String,
        category: String = "general",
        deepLink: String? = null,
    )
}
