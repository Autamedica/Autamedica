package com.autamedica.android.domain.repository

/**
 * Manages FCM token lifecycle: registration, refresh, and deletion.
 */
interface NotificationRepository {
    /** Persist the FCM token to Supabase `profiles.fcm_token`. */
    suspend fun registerFcmToken(token: String): Result<Unit>

    /** Remove the stored FCM token (e.g., on logout). */
    suspend fun clearFcmToken(): Result<Unit>

    /** Get the current locally-cached FCM token, or null if not yet registered. */
    fun getCachedToken(): String?
}
