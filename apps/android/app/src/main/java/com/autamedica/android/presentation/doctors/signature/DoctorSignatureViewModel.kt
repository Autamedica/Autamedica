package com.autamedica.android.presentation.doctors.signature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.BuildConfig
import com.autamedica.android.R
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import com.autamedica.android.data.local.SecurePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import com.autamedica.android.presentation.common.UiErrorMapper
import java.util.concurrent.TimeUnit
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
    val careCountry: String? = null,
    val licenseType: String? = null,
    val ufBrazil: String? = null,
)

@HiltViewModel
class DoctorSignatureViewModel @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : ViewModel() {
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
    private val _state = MutableStateFlow(DoctorSignatureState())
    val state: StateFlow<DoctorSignatureState> = _state.asStateFlow()

    fun loadDoctorJurisdiction() {
        viewModelScope.launch {
            runCatching {
                val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: return@runCatching
                val doctor = supabaseClient.postgrest.from("doctors")
                    .select(Columns.list("id", "license_number", "license_type", "uf_brazil", "care_country", "cpf")) {
                        filter { eq("user_id", userId) }
                    }.decodeSingleOrNull<DoctorValidationRecordDto>()
                if (doctor != null) {
                    _state.update {
                        it.copy(
                            careCountry = doctor.careCountry,
                            licenseType = doctor.licenseType,
                            ufBrazil = doctor.ufBrazil,
                        )
                    }
                }
            }
        }
    }

    fun validateDoctorLicense(dni: String, medicalLicense: String) {
        val normalizedDocument = dni.trim()
        val normalizedLicense = medicalLicense.trim()
        if (normalizedLicense.length < 3) {
            _state.update { it.copy(isLoading = false, sisaValidated = false,
                errorMessage = null, errorMessageRes = R.string.signature_error_invalid_license) }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, errorMessageRes = null,
                validationMessage = null, validationMessageRes = null) }
            runCatching {
                val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
                    ?: throw IllegalStateException("doctor_session_missing")
                val doctor = supabaseClient.postgrest.from("doctors")
                    .select(Columns.list("id", "license_number", "license_type", "uf_brazil", "care_country", "cpf")) {
                        filter { eq("user_id", userId) }
                    }.decodeSingleOrNull<DoctorValidationRecordDto>()
                    ?: throw IllegalStateException("doctor_profile_missing")

                _state.update {
                    it.copy(
                        careCountry = doctor.careCountry,
                        licenseType = doctor.licenseType,
                        ufBrazil = doctor.ufBrazil,
                    )
                }

                if (doctor.licenseType?.uppercase() == "CRM" || doctor.careCountry?.uppercase() == "BR") {
                    if (!validCpf(normalizedDocument)) throw IllegalArgumentException("invalid_brazil_cpf")
                    val cpfOnRecord = digits(doctor.cpf)
                    if (cpfOnRecord.isNotBlank() && cpfOnRecord != digits(normalizedDocument)) {
                        throw IllegalArgumentException("brazil_cpf_mismatch")
                    }
                    val enteredCrm = parseBrazilianCrm(normalizedLicense)
                        ?: throw IllegalArgumentException("cfm_license_invalid")
                    val doctorCrm = digits(doctor.licenseNumber)
                    val uf = doctor.ufBrazil?.uppercase().orEmpty()
                    if (doctor.licenseType?.uppercase() != "CRM" ||
                        enteredCrm.first != doctorCrm ||
                        enteredCrm.second != uf ||
                        !uf.matches(Regex("^[A-Z]{2}$"))) {
                        throw IllegalArgumentException("cfm_license_invalid")
                    }
                    val licenses = supabaseClient.postgrest.from("doctor_licenses")
                        .select(Columns.list(
                            "license_number", "license_type", "uf_brazil", "status",
                            "cfm_validation_status", "cfm_evidence_path", "cfm_review_notes",
                            "cfm_reviewed_by", "cfm_reviewed_at", "cfm_last_checked_at",
                        )) {
                            filter {
                                eq("doctor_id", doctor.id)
                                eq("license_type", "CRM")
                                eq("status", "active")
                                eq("cfm_validation_status", "valid")
                            }
                        }.decodeList<CfmLicenseValidationDto>()
                    val verified = licenses.any { license ->
                        digits(license.licenseNumber) == doctorCrm &&
                            license.ufBrazil?.uppercase() == uf &&
                            !license.evidencePath.isNullOrBlank() &&
                            (license.reviewNotes?.trim()?.length ?: 0) >= 10 &&
                            !license.reviewedBy.isNullOrBlank() &&
                            !license.reviewedAt.isNullOrBlank() &&
                            !license.lastCheckedAt.isNullOrBlank()
                    }
                    if (!verified) throw IllegalStateException("cfm_license_not_verified")
                    _state.update { it.copy(
                        isLoading = false, sisaValidated = true, validationStatus = "valid",
                        validationMessage = null, validationMessageRes = R.string.signature_status_cfm_verified,
                        lastCheckedAt = licenses.firstOrNull()?.lastCheckedAt,
                        errorMessage = null, errorMessageRes = null,
                    ) }
                    return@launch
                }

                if (!normalizedDocument.matches(Regex("^\\d{7,9}$"))) {
                    throw IllegalArgumentException("invalid_argentine_dni")
                }
                val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                    ?: throw IllegalStateException("doctor_session_missing")
                val payload = buildJsonObject {
                    put("dni", normalizedDocument)
                    put("matricula", normalizedLicense)
                }
                val endpoint = BuildConfig.SUPABASE_URL.trimEnd('/') + "/functions/v1/verify-doctor-license"
                val (httpCode, responseText) = withContext(Dispatchers.IO) {
                    val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                    val httpRequest = Request.Builder()
                        .url(endpoint)
                        .header("Authorization", "Bearer $accessToken")
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Accept", "application/json")
                        .post(body)
                        .build()
                    httpClient.newCall(httpRequest).execute().use { resp ->
                        resp.code to resp.body?.string().orEmpty()
                    }
                }
                val dto = runCatching {
                    Json { ignoreUnknownKeys = true }.decodeFromString<VerifyDoctorLicenseResponseDto>(responseText)
                }.getOrNull()
                if (httpCode !in 200..299) {
                    if (dto?.code == "LICENSE_PENDING_REVIEW") {
                        _state.update { it.copy(
                            isLoading = false,
                            sisaValidated = false,
                            validationStatus = "pending_review",
                            validationMessage = dto.error ?: dto.message,
                            validationMessageRes = R.string.signature_status_unverified,
                            lastCheckedAt = dto.data?.checkedAt,
                            errorMessage = dto.error ?: dto.message ?: dto.code,
                            errorMessageRes = R.string.signature_status_unverified,
                        ) }
                        return@launch
                    }
                    throw IllegalStateException(
                        dto?.message ?: dto?.error ?: dto?.code ?: "verify_doctor_license_http_$httpCode",
                    )
                }
                val parsedDto = dto ?: throw IllegalStateException("verify_doctor_license_invalid_response")
                val status = parsedDto.data?.status
                val verified = status == "valid" || status == "exempt"
                val messageRes = when (status) {
                    "valid" -> R.string.signature_status_sisa_verified
                    "exempt" -> R.string.signature_status_exempt
                    else -> R.string.signature_status_unverified
                }
                _state.update { it.copy(
                    isLoading = false, sisaValidated = verified,
                    validationStatus = status ?: "pending_review",
                    validationMessage = null, validationMessageRes = messageRes,
                    lastCheckedAt = parsedDto.data?.checkedAt,
                    errorMessage = if (verified) null else parsedDto.message ?: parsedDto.error ?: parsedDto.code,
                    errorMessageRes = if (verified) null else messageRes,
                ) }
            }.onFailure { error ->
                val errorRes = when (error.message) {
                    "invalid_brazil_cpf" -> R.string.signature_error_invalid_cpf
                    "brazil_cpf_mismatch" -> R.string.signature_error_cpf_mismatch
                    "cfm_license_invalid" -> R.string.signature_error_invalid_license
                    else -> R.string.signature_error_verification_failed
                }
                val errorMsg = if (errorRes == R.string.signature_error_verification_failed) {
                    UiErrorMapper.map(error, "Não foi possível validar a matrícula").takeIf { it.isNotBlank() }
                } else null
                _state.update { it.copy(
                    isLoading = false, sisaValidated = false, validationStatus = "pending_review",
                    validationMessage = errorMsg, validationMessageRes = if (errorMsg == null) errorRes else null,
                    errorMessage = errorMsg, errorMessageRes = if (errorMsg == null) errorRes else null,
                ) }
            }
        }
    }

    private fun parseBrazilianCrm(value: String): Pair<String, String>? {
        val input = value.trim().uppercase()
        val patterns = listOf(
            Regex("^CRM\\s*[-/]\\s*([A-Z]{2})\\s*(\\d{3,})$"),
            Regex("^CRM\\s*(\\d{3,})\\s*[-/]\\s*([A-Z]{2})$"),
            Regex("^(\\d{3,})\\s*[-/]\\s*([A-Z]{2})$"),
            Regex("^([A-Z]{2})\\s*[-/]?\\s*(\\d{3,})$"),
        )
        patterns.forEachIndexed { index, pattern ->
            val match = pattern.matchEntire(input) ?: return@forEachIndexed
            return when (index) {
                0, 3 -> match.groupValues[2] to match.groupValues[1]
                else -> match.groupValues[1] to match.groupValues[2]
            }
        }
        return null
    }

    private fun digits(value: String?): String = value.orEmpty().filter(Char::isDigit)

    private fun validCpf(value: String): Boolean {
        val cpf = digits(value)
        if (!cpf.matches(Regex("^\\d{11}$")) || cpf.all { it == cpf.first() }) return false
        for (length in 9..10) {
            var sum = 0
            for (index in 0 until length) sum += cpf[index].digitToInt() * (length + 1 - index)
            val digit = (sum * 10) % 11
            if ((if (digit == 10) 0 else digit) != cpf[length].digitToInt()) return false
        }
        return true
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
private data class DoctorValidationRecordDto(
    val id: String,
    @SerialName("license_number") val licenseNumber: String? = null,
    @SerialName("license_type") val licenseType: String? = null,
    @SerialName("uf_brazil") val ufBrazil: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
    val cpf: String? = null,
)

@Serializable
private data class CfmLicenseValidationDto(
    @SerialName("license_number") val licenseNumber: String? = null,
    @SerialName("license_type") val licenseType: String? = null,
    @SerialName("uf_brazil") val ufBrazil: String? = null,
    val status: String? = null,
    @SerialName("cfm_evidence_path") val evidencePath: String? = null,
    @SerialName("cfm_review_notes") val reviewNotes: String? = null,
    @SerialName("cfm_reviewed_by") val reviewedBy: String? = null,
    @SerialName("cfm_reviewed_at") val reviewedAt: String? = null,
    @SerialName("cfm_last_checked_at") val lastCheckedAt: String? = null,
)

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