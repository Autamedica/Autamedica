package com.autamedica.android.presentation.doctors.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.repository.BRAZIL_UFS
import com.autamedica.android.data.repository.DoctorOnboardingClient
import com.autamedica.android.data.repository.DoctorOnboardingException
import com.autamedica.android.data.repository.DoctorOnboardingSubmission
import com.autamedica.android.data.repository.validateDoctorOnboardingSubmission
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

data class DoctorOnboardingUiState(
    val isLoading: Boolean = true,
    val isSubmitting: Boolean = false,
    val submittedSuccess: Boolean = false,
    val error: String? = null,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String = "",
    val careCountry: String = "AR",
    val licenseType: String = "MN",
    val licenseNumber: String = "",
    val ufBrazil: String = "",
    val enrollmentJurisdiction: String = "",
    val specialty: String = "",
    val cpf: String = "",
)

@HiltViewModel
class DoctorOnboardingViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val doctorRepository: DoctorRepository,
    private val onboardingClient: DoctorOnboardingClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorOnboardingUiState())
    val uiState: StateFlow<DoctorOnboardingUiState> = _uiState.asStateFlow()

    init {
        loadInitialData()
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            val doctorProfile = user?.let {
                doctorRepository.getDoctorProfile(it.id).getOrNull()
            }

            val defaultCountry = when {
                doctorProfile?.countryCode == "BR" -> "BR"
                doctorProfile?.countryCode == "AR" -> "AR"
                doctorProfile?.licenseType.equals("CRM", ignoreCase = true) -> "BR"
                Locale.getDefault().country.equals("BR", ignoreCase = true) -> "BR"
                else -> "AR"
            }

            val defaultLicenseType = when {
                defaultCountry == "BR" -> "CRM"
                doctorProfile?.licenseType.equals("MP", ignoreCase = true) -> "MP"
                else -> "MN"
            }

            val sanitizedLicense = doctorProfile?.licenseNumber
                ?.trim()
                ?.takeUnless { Regex("^PENDING(-|$)", RegexOption.IGNORE_CASE).containsMatchIn(it) }
                .orEmpty()

            val sanitizedSpecialty = doctorProfile?.specialty
                ?.trim()
                ?.takeUnless { it.equals("General", ignoreCase = true) }
                .orEmpty()

            _uiState.update {
                it.copy(
                    isLoading = false,
                    firstName = user?.firstName.orEmpty(),
                    lastName = user?.lastName.orEmpty(),
                    phone = user?.phone.orEmpty(),
                    careCountry = defaultCountry,
                    licenseType = defaultLicenseType,
                    licenseNumber = sanitizedLicense,
                    ufBrazil = doctorProfile?.ufBrazil?.trim()?.uppercase().orEmpty(),
                    specialty = sanitizedSpecialty,
                )
            }
        }
    }

    fun onFirstNameChange(value: String) {
        _uiState.update { it.copy(firstName = value, error = null) }
    }

    fun onLastNameChange(value: String) {
        _uiState.update { it.copy(lastName = value, error = null) }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { it.copy(phone = value, error = null) }
    }

    fun onCountryChange(country: String) {
        val normalized = if (country.equals("BR", ignoreCase = true)) "BR" else "AR"
        _uiState.update { state ->
            state.copy(
                careCountry = normalized,
                licenseType = if (normalized == "BR") "CRM" else if (state.licenseType == "MP") "MP" else "MN",
                error = null,
            )
        }
    }

    fun onLicenseTypeChange(type: String) {
        val normalized = type.trim().uppercase()
        if (_uiState.value.careCountry == "BR") return
        if (normalized == "MN" || normalized == "MP") {
            _uiState.update { it.copy(licenseType = normalized, error = null) }
        }
    }

    fun onLicenseNumberChange(value: String) {
        _uiState.update { it.copy(licenseNumber = value, error = null) }
    }

    fun onUfBrazilChange(uf: String) {
        val normalized = uf.trim().uppercase()
        if (normalized in BRAZIL_UFS || normalized.isEmpty()) {
            _uiState.update { it.copy(ufBrazil = normalized, error = null) }
        }
    }

    fun onJurisdictionChange(value: String) {
        _uiState.update { it.copy(enrollmentJurisdiction = value, error = null) }
    }

    fun onSpecialtyChange(value: String) {
        _uiState.update { it.copy(specialty = value, error = null) }
    }

    fun onCpfChange(value: String) {
        _uiState.update { it.copy(cpf = value, error = null) }
    }

    fun submit() {
        val current = _uiState.value
        if (current.isSubmitting) return

        val candidate = DoctorOnboardingSubmission(
            firstName = current.firstName,
            lastName = current.lastName,
            phone = current.phone,
            careCountry = current.careCountry,
            licenseType = current.licenseType,
            licenseNumber = current.licenseNumber,
            specialty = current.specialty,
            ufBrazil = current.ufBrazil,
            enrollmentJurisdiction = current.enrollmentJurisdiction,
            cpf = current.cpf,
        )

        val validationError = runCatching { validateDoctorOnboardingSubmission(candidate) }
            .exceptionOrNull()
        if (validationError != null) {
            _uiState.update {
                it.copy(error = validationError.message ?: "Revisá los datos ingresados")
            }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, error = null) }

        viewModelScope.launch {
            onboardingClient.submitOnboarding(candidate).fold(
                onSuccess = {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            submittedSuccess = true,
                            error = null,
                        )
                    }
                },
                onFailure = { err ->
                    SecureLog.error("[DoctorOnboarding] Failed submitting onboarding", err)
                    val message = when {
                        err is DoctorOnboardingException && err.httpStatus == 409 ->
                            "Esa matrícula ya está registrada en otra cuenta."
                        else -> UiErrorMapper.map(err, "No se pudo enviar la solicitud profesional.")
                    }
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            error = message,
                        )
                    }
                },
            )
        }
    }
}
