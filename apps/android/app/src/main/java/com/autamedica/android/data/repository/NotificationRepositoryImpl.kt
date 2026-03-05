package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.repository.NotificationRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : NotificationRepository {

    override suspend fun registerFcmToken(token: String): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found — cannot register FCM token")

        supabaseClient.postgrest
            .from("profiles")
            .update(FcmTokenDto(fcmToken = token, platform = "android")) {
                filter { eq("user_id", userId) }
            }

        securePreferences.putString(KEY_FCM_TOKEN, token)
        Timber.d("[Notifications] FCM token registered for user $userId")
    }.onFailure {
        Timber.e(it, "[Notifications] Failed to register FCM token")
    }

    override suspend fun clearFcmToken(): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
        if (userId != null) {
            supabaseClient.postgrest
                .from("profiles")
                .update(FcmTokenDto(fcmToken = null, platform = null)) {
                    filter { eq("user_id", userId) }
                }
        }
        securePreferences.remove(KEY_FCM_TOKEN)
        Timber.d("[Notifications] FCM token cleared")
    }.onFailure {
        Timber.e(it, "[Notifications] Failed to clear FCM token")
    }

    override fun getCachedToken(): String? =
        securePreferences.getString(KEY_FCM_TOKEN)

    companion object {
        private const val KEY_FCM_TOKEN = "fcm_token"
    }
}

@Serializable
private data class FcmTokenDto(
    @SerialName("fcm_token") val fcmToken: String?,
    @SerialName("device_platform") val platform: String?,
)
