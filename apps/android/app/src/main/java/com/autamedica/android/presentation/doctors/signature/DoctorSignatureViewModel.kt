package com.autamedica.android.presentation.doctors.signature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class DoctorSignatureState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errorMessageRes: Int? = null,
    val sisaValidated: Boolean = false,
    val validationStatus: String? = null,
    val validationMessage: String? = null,
    val validationMessageRes: Int? = null,
    val lastCheckedAt: String? = null,
)

@HiltViewModel
class DoctorSignatureViewModel @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : ViewModel() {
    private val _state = MutableStateFlow(DoctorSignatureState())
    val state: StateFlow<DoctorSignatureState> = _state.asStateFlow()

    fun validateWithSisaRefeps(dni: String, medicalLicense: String) {
        val normalizedDni = dni.trim()
        val normalizedLicense = medicalLicense.trim()

        if (!normalizedDni.matches(Regex("^\\d{7,9}$"))) {
            _state.update {
                it.copy(
                    isLoading = false,
                    sisaValidated = false,
                    errorMessage = null,
                    errorMessageRes = R.string.signature_error_invalid_dni,
                )
            }
            return
        }
        if (normalizedLicense.length < 3) {
            _state.update {
                it.copy(
                    isLoading = false,
                    sisaValidated = false,
                    errorMessage = null,
                    errorMessageRes = R.string.signature_error_invalid_license,
                )
            }
            return
        }

        viewModelScope.launch {
            _state.update {
                it.copy(
                    isLoading = true,
                    errorMessage = null,
                    errorMessageRes = null,
                    validationMessage = null,
                    validationMessageRes = null
                )
            }
            val result = runCatching {
                val payload = buildJsonObject {
                    put("dni", normalizedDni)
                    put("matricula", normalizedLicense)
                }
                val response = supabaseClient.functions("verify-doctor-license", payload)
                val text = response.bodyAsText()
                val json = Json { ignoreUnknownKeys = true }
                json.decodeFromString<VerifyDoctorLicenseResponseDto>(text)
            }

            result
                .onSuccess { dto ->
                    val status = dto.data?.status
                    val verified = status == "valid" || status == "exempt"
                    val (messageStr, messageRes) = when (status) {
                        "valid" -> Pair(null, R.string.signature_status_sisa_verified)
                        "exempt" -> Pair(null, R.string.signature_status_exempt)
                        else -> Pair(
                            dto.message ?: dto.code,
                            if (dto.message == null && dto.code == null) R.string.signature_status_unverified else null
                        )
                    }
                    _state.update {
                        it.copy(
                            isLoading = false,
                            sisaValidated = verified,
                            validationStatus = status ?: "pending_review",
                            validationMessage = messageStr,
                            validationMessageRes = messageRes,
                            lastCheckedAt = dto.data?.checkedAt,
                            errorMessage = if (verified) null else messageStr,
                            errorMessageRes = if (verified) null else messageRes,
                        )
                    }
                }
                .onFailure { error ->
                    val errorMsg = UiErrorMapper.map(error, "No se pudo firmar el documento").takeIf { it.isNotBlank() }
                    _state.update {
                        it.copy(
                            isLoading = false,
                            sisaValidated = false,
                            validationStatus = "pending_review",
                            validationMessage = errorMsg,
                            validationMessageRes = if (errorMsg == null) R.string.signature_error_verification_failed else null,
                            errorMessage = errorMsg,
                            errorMessageRes = if (errorMsg == null) R.string.signature_error_verification_failed else null,
                        )
                    }
                }
        }
    }

    fun clearError() {
        _state.update {
            it.copy(
                errorMessage = null,
                errorMessageRes = null,
                validationMessage = null,
                validationMessageRes = null
            )
        }
    }
}

@Serializable
private data class VerifyDoctorLicenseResponseDto(
    val success: Boolean = false,
    val code: String? = null,
    val message: String? = null,
    val error: String? = null,
    val data: VerifyDoctorLicenseDataDto? = null,
)

@Serializable
private data class VerifyDoctorLicenseDataDto(
    val status: String? = null,
    val profession: String? = null,
    @SerialName("is_psychiatrist") val isPsychiatrist: Boolean? = null,
    @SerialName("checked_at") val checkedAt: String? = null,
)