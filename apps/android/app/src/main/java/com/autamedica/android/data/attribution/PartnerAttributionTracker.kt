package com.autamedica.android.data.attribution

import android.content.Context
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.autamedica.android.BuildConfig
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLDecoder
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Extracts an anonymous, one-time scan token from Google's Play install referrer.
 * No UTM value is an authorization role, a commission or a clinical identifier.
 */
internal fun extractPartnerClickToken(rawReferrer: String): String? {
    val term = rawReferrer.split('&')
        .firstOrNull { it.substringBefore('=') == "utm_term" }
        ?.substringAfter('=', "")
        ?.let { URLDecoder.decode(it, "UTF-8") }
        ?: return null
    return term.removePrefix("click_")
        .takeIf { term.startsWith("click_") && it.matches(Regex("[0-9a-f]{32}")) }
}

@Singleton
class PartnerAttributionTracker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabase: SupabaseClient,
) {
    private val prefs = context.getSharedPreferences("partner_attribution", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val submitMutex = Mutex()
    private val client = OkHttpClient.Builder()
        .callTimeout(10, TimeUnit.SECONDS)
        .build()

    /**
     * Run once after a Google Play install. An unavailable Play service may be retried.
     * Successful reads are not repeated unless the application is reinstalled.
     */
    fun captureInstallReferrer() {
        if (prefs.getBoolean("install_referrer_checked", false)) return

        val referrerClient = try {
            InstallReferrerClient.newBuilder(context).build()
        } catch (error: Exception) {
            SecureLog.warn("Partner install referrer unavailable", error)
            return
        }

        try {
            referrerClient.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    try {
                        when (responseCode) {
                            InstallReferrerClient.InstallReferrerResponse.OK -> {
                                val raw = referrerClient.installReferrer.installReferrer
                                val token = extractPartnerClickToken(raw)
                                prefs.edit()
                                    .putBoolean("install_referrer_checked", true)
                                    .apply()
                                if (token != null && !prefs.contains("pending_click_token")) {
                                    prefs.edit().putString("pending_click_token", token).apply()
                                }
                                scope.launch { submitPending() }
                            }
                            InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED -> {
                                prefs.edit().putBoolean("install_referrer_checked", true).apply()
                            }
                            else -> Unit // Play Store may not be available yet; retry next launch.
                        }
                    } catch (error: Exception) {
                        SecureLog.warn("Partner install referrer read failed", error)
                    } finally {
                        referrerClient.endConnection()
                    }
                }

                override fun onInstallReferrerServiceDisconnected() {
                    // A subsequent app opening can retry if no read has completed.
                }
            })
        } catch (error: Exception) {
            SecureLog.warn("Partner install referrer connection failed", error)
            referrerClient.endConnection()
        }
    }

    /** Called after an authenticated session is available (including after user registration). */
    suspend fun submitPending() = withContext(Dispatchers.IO) {
        submitMutex.withLock {
            val token = prefs.getString("pending_click_token", null) ?: return@withLock
            val accessToken = supabase.auth.currentSessionOrNull()?.accessToken
                ?: return@withLock

            val body = JSONObject()
                .put("click_token", token)
                .put("source", "play_install_referrer")
                .toString()
                .toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url(BuildConfig.WEB_API_URL.trimEnd('/') + "/api/partners/claim")
                .header("Authorization", "Bearer $accessToken")
                .post(body)
                .build()

            try {
                client.newCall(request).execute().use { response ->
                    when (response.code) {
                        200, 400, 409 -> prefs.edit().remove("pending_click_token").apply()
                        // 401 and 503 are transient for our purposes: allow retry
                        // when the session refreshes or the API is restored.
                        else -> Unit
                    }
                }
            } catch (error: Exception) {
                SecureLog.warn("Partner attribution claim deferred", error)
            }
        }
    }
}
