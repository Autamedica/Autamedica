package com.autamedica.android.presentation.doctors.signature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.presentation.common.UiErrorMapper
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
import com.autamedica.android.util.CountryContext
import com.autamedica.android.util.CpfValidator
import java.util.Locale
import javax.inject.Inject

data class DoctorSignatureState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val errorMessage: String? = null,
    val sisaValidated: Boolean = false,
    val validationStatus: String? = null,
    val validationMessage: String? = null,
    val lastCheckedAt: String? = null,
)

@HiltViewModel
class DoctorSignatureViewModel @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : ViewModel() {
    private val _state = MutableStateFlow(DoctorSignatureState())
    val state: StateFlow<DoctorSignatureState> = _state.asStateFlow()

    fun validateWithSisaRefeps(dni: String, medicalLicense: String) {
        validateProfessionalDocument(
            documentNumber = dni,
            medicalLicense = medicalLicense,
            countryCode = "AR",
        )
    }

    fun validateProfessionalDocument(
        documentNumber: String,
        medicalLicense: String,
        countryCode: String? = null,
        locale: Locale = Locale.getDefault(),
    ) {
        val normalizedDoc = documentNumber.trim()
        val normalizedLicense = medicalLicense.trim()
        val isBrazil = CountryContext.isBrazil(countryCode = countryCode, locale = locale)

        if (isBrazil) {
            val cleanedCpf = CpfValidator.clean(normalizedDoc)
            if (!CpfValidator.isValid(cleanedCpf)) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        sisaValidated = false,
                        errorMessage = "Informe um CPF válido (11 dígitos)",
                    )
                }
                return
            }
            if (normalizedLicense.length < 3) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        sisaValidated = false,
                        errorMessage = "Informe um CRM válido",
                    )
                }
                return
            }
        } else {
            if (!normalizedDoc.matches(Regex("^\\d{7,9}$"))) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        sisaValidated = false,
                        errorMessage = "Ingrese un DNI válido (7 a 9 dígitos)",
                    )
                }
                return
            }
            if (normalizedLicense.length < 3) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        sisaValidated = false,
                        errorMessage = "Ingrese una matrícula válida",
                    )
                }
                return
            }
        }

        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, validationMessage = null) }
            val result = runCatching {
                val payload = buildJsonObject {
                    if (isBrazil) {
                        val cleanedCpf = CpfValidator.clean(normalizedDoc)
                        put("cpf", cleanedCpf)
                        put("crm", normalizedLicense)
                        put("dni", cleanedCpf)
                        put("matricula", normalizedLicense)
                    } else {
                        put("dni", normalizedDoc)
                        put("matricula", normalizedLicense)
                    }
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
                    val message = when (status) {
                        "valid" -> if (isBrazil) "CRM verificado com sucesso" else "Matrícula verificada en SISA/REFEPS"
                        "exempt" -> if (isBrazil) "CRM dispensado de validação prévia" else "Matrícula exceptuada de verificación"
                        else -> (dto.message ?: dto.code ?: if (isBrazil) "CRM sem verificação" else "Matrícula sin verificar").takeIf { it.isNotBlank() }
                    }
                    _state.update {
                        it.copy(
                            isLoading = false,
                            sisaValidated = verified,
                            validationStatus = status ?: "pending_review",
                            validationMessage = message,
                            lastCheckedAt = dto.data?.checkedAt,
                            errorMessage = if (verified) null else message,
                        )
                    }
                }
                .onFailure { error ->
                    val fallbackMessage = if (isBrazil) {
                        "Não foi possível verificar o documento. Tente novamente."
                    } else {
                        "No se pudo verificar la matrícula. Intente nuevamente."
                    }
                    val message = UiErrorMapper.map(error, fallbackMessage)
                    _state.update {
                        it.copy(
                            isLoading = false,
                            sisaValidated = false,
                            validationStatus = "pending_review",
                            validationMessage = message,
                            errorMessage = message,
                        )
                    }
                }
        }
    }

    fun saveSignature(signatureData: ByteArray) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            if (_state.value.sisaValidated) {
                _state.update { it.copy(isLoading = false, isSuccess = true) }
            } else {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Debe validar la matrícula con SISA antes de guardar",
                    )
                }
            }
        }
    }

    fun clearError() {
        _state.update { it.copy(errorMessage = null, validationMessage = null) }
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