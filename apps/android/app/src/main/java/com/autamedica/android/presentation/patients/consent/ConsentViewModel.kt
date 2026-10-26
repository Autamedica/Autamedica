package com.autamedica.android.presentation.patients.consent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.BuildConfig
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor

data class ConsentUiState(
    val hasReadConsent: Boolean = false,
    val isAccepted: Boolean = false,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null,
)

/**
 * Confirms a real, versioned consent using the authenticated web API.
 * No UI success may be emitted before an HTTP success from /patients/consent/sign.
 */
@HiltViewModel
class ConsentViewModel @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val httpClient: OkHttpClient,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ConsentUiState())
    val uiState: StateFlow<ConsentUiState> = _uiState.asStateFlow()

    fun onReadConsentChanged(hasRead: Boolean) {
        _uiState.update { it.copy(hasReadConsent = hasRead, isSuccess = false) }
    }

    fun onAcceptedChanged(isAccepted: Boolean) {
        _uiState.update { it.copy(isAccepted = isAccepted, isSuccess = false) }
    }

    fun submitConsent() {
        val state = _uiState.value
        if (state.isLoading || !state.hasReadConsent || !state.isAccepted) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, isSuccess = false) }
            runCatching {
                val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                    ?.takeIf { it.isNotBlank() } ?: error("Sesión no disponible")
                val baseUrl = BuildConfig.WEB_API_URL.trimEnd('/')
                require(baseUrl.startsWith("https://")) { "La API segura no está configurada" }
                val payload = buildJsonObject {
                    put("consentType", "general")
                    put("templateVersion", "android-general-v1")
                    put("acceptedSections", JsonArray(listOf(JsonPrimitive("general"))))
                }
                withContext(ioDispatcher) {
                    // Avoid dumping personal consent data or bearer tokens to debug logs.
                    val privateClient = httpClient.newBuilder().apply {
                        interceptors().removeAll { it is HttpLoggingInterceptor }
                        networkInterceptors().removeAll { it is HttpLoggingInterceptor }
                    }.build()
                    val request = Request.Builder()
                        .url("$baseUrl/api/patients/consent/sign")
                        .header("Authorization", "Bearer $accessToken")
                        .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                        .build()
                    privateClient.newCall(request).execute().use { response ->
                        check(response.isSuccessful) {
                            "El servidor no confirmó el consentimiento (HTTP ${response.code})"
                        }
                    }
                }
            }.onSuccess {
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = UiErrorMapper.map(error, "No se pudo registrar el consentimiento. Intentá nuevamente."),
                    )
                }
            }
        }
    }
}
