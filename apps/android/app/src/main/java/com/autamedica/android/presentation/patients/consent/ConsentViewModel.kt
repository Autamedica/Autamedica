package com.autamedica.android.presentation.patients.consent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import javax.inject.Inject

private const val LGPD_CONSENT_VERSION = "1.0"

data class ConsentUiState(
    val hasReadConsent: Boolean = false,
    val isAccepted: Boolean = false,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ConsentViewModel @Inject constructor(
    private val supabase: SupabaseClient,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ConsentUiState())
    val uiState: StateFlow<ConsentUiState> = _uiState.asStateFlow()

    fun onReadConsentChanged(hasRead: Boolean) {
        _uiState.update { it.copy(hasReadConsent = hasRead) }
    }

    fun onAcceptedChanged(isAccepted: Boolean) {
        _uiState.update { it.copy(isAccepted = isAccepted) }
    }

    fun submitConsent() {
        if (!_uiState.value.hasReadConsent || !_uiState.value.isAccepted || _uiState.value.isLoading) return
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val userId = supabase.auth.currentSessionOrNull()?.user?.id
                    ?: throw IllegalStateException("Iniciá sesión para registrar el consentimiento")
                val acceptedAt = Instant.now().toString()
                supabase.postgrest.from("patients").update(
                    buildJsonObject {
                        put("lgpd_consent", true)
                        put("lgpd_consent_date", acceptedAt)
                        put("lgpd_consent_version", LGPD_CONSENT_VERSION)
                    }
                ) {
                    filter { eq("user_id", userId) }
                }
                val persisted = supabase.postgrest.from("patients")
                    .select(Columns.list("lgpd_consent", "lgpd_consent_date", "lgpd_consent_version")) {
                        filter { eq("user_id", userId) }
                        limit(1)
                    }.decodeSingleOrNull<PatientConsentRecord>()
                check(persisted?.lgpdConsent == true && !persisted.lgpdConsentDate.isNullOrBlank()
                    && persisted.lgpdConsentVersion == LGPD_CONSENT_VERSION) {
                    "No se confirmó la persistencia del consentimiento del paciente"
                }
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = UiErrorMapper.map(e, "No se pudo guardar el consentimiento"))
                }
            }
        }
    }
}

@kotlinx.serialization.Serializable
private data class PatientConsentRecord(
    @kotlinx.serialization.SerialName("lgpd_consent") val lgpdConsent: Boolean = false,
    @kotlinx.serialization.SerialName("lgpd_consent_date") val lgpdConsentDate: String? = null,
    @kotlinx.serialization.SerialName("lgpd_consent_version") val lgpdConsentVersion: String? = null,
)
