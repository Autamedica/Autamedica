package com.autamedica.android.presentation.pharmacy

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyOnDemandRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PharmacyIntakeUiState(
    val pharmacyId: String = "",
    val pharmacyName: String = "Farmacia de Turno",
    val patientName: String = "",
    val patientPhone: String = "",
    val patientDni: String = "",
    val selectedReasonChip: String? = null,
    val reasonText: String = "",
    val isAuthenticated: Boolean = false,
    val isLoadingProfile: Boolean = true,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    // Waiting room state
    val activeRequestId: String? = null,
    val status: PharmacyConsultationStatus? = null,
    val queuePosition: Int = 0,
    val estimatedMinutes: Int = 0,
    val assignedDoctorName: String? = null,
    val assignedDoctorSpecialty: String? = null,
    val roomId: String? = null,
    val readyToJoinCall: Boolean = false,
) {
    val effectiveReason: String
        get() = when {
            reasonText.isNotBlank() && selectedReasonChip != null && !reasonText.contains(selectedReasonChip) ->
                "$selectedReasonChip - $reasonText"
            reasonText.isNotBlank() -> reasonText
            selectedReasonChip != null -> selectedReasonChip
            else -> ""
        }

    val isFormValid: Boolean
        get() = patientName.trim().isNotBlank() &&
            patientPhone.trim().length >= 6 &&
            patientDni.trim().length >= 5 &&
            effectiveReason.trim().isNotBlank()
}

@HiltViewModel
class PharmacyIntakeViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val profileRepository: ProfileRepository,
    private val pharmacyOnDemandRepository: PharmacyOnDemandRepository,
) : ViewModel() {

    private val pharmacyIdParam: String = savedStateHandle["pharmacyId"] ?: ""

    private val _uiState = MutableStateFlow(
        PharmacyIntakeUiState(pharmacyId = pharmacyIdParam)
    )
    val uiState: StateFlow<PharmacyIntakeUiState> = _uiState.asStateFlow()

    private var statusPollingJob: Job? = null

    val reasonChips: List<String> = listOf(
        "Renovación de Receta",
        "Presión / Hipertensión",
        "Gripe / Fiebre",
        "Alergia",
        "Dolor Muscular"
    )

    init {
        loadUserProfile()
    }

    fun loadUserProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingProfile = true, error = null) }
            runCatching {
                val currentUser = authRepository.getCurrentUser()
                val profile = profileRepository.getProfile().getOrNull()
                val snapshot = profileRepository.getPatientProfileSnapshot().getOrNull()

                if (currentUser != null) {
                    val displayName = profile?.displayName?.takeIf { it.isNotBlank() && !it.contains("@") }
                        ?: currentUser.displayName.takeIf { it.isNotBlank() && !it.contains("@") }
                        ?: currentUser.displayName
                    val phone = profile?.phone?.takeIf { it.isNotBlank() }
                        ?: currentUser.phone.orEmpty()
                    val dni = snapshot?.dni.orEmpty()

                    _uiState.update { state ->
                        state.copy(
                            isAuthenticated = true,
                            patientName = if (state.patientName.isBlank()) displayName else state.patientName,
                            patientPhone = if (state.patientPhone.isBlank()) phone else state.patientPhone,
                            patientDni = if (state.patientDni.isBlank()) dni else state.patientDni,
                            isLoadingProfile = false,
                        )
                    }
                } else {
                    _uiState.update { it.copy(isAuthenticated = false, isLoadingProfile = false) }
                }
            }.onFailure { e ->
                SecureLog.error("[PharmacyIntakeVM] Failed loading user profile", e)
                _uiState.update { it.copy(isLoadingProfile = false) }
            }
        }
    }

    fun onPatientNameChanged(name: String) {
        _uiState.update { it.copy(patientName = name, error = null) }
    }

    fun onPatientPhoneChanged(phone: String) {
        _uiState.update { it.copy(patientPhone = phone, error = null) }
    }

    fun onPatientDniChanged(dni: String) {
        _uiState.update { it.copy(patientDni = dni, error = null) }
    }

    fun onReasonChipSelected(chip: String) {
        _uiState.update { state ->
            val isSame = state.selectedReasonChip == chip
            val newChip = if (isSame) null else chip
            val newText = if (state.reasonText.isBlank() && newChip != null) newChip else state.reasonText
            state.copy(selectedReasonChip = newChip, reasonText = newText, error = null)
        }
    }

    fun onReasonTextChanged(text: String) {
        _uiState.update { it.copy(reasonText = text, error = null) }
    }

    fun submitRequest() {
        val state = _uiState.value
        if (!state.isFormValid) {
            _uiState.update {
                it.copy(
                    error = when {
                        state.patientName.isBlank() -> "Ingresá el nombre completo del paciente"
                        state.patientDni.length < 5 -> "Ingresá un DNI válido (mínimo 5 caracteres)"
                        state.patientPhone.length < 6 -> "Ingresá un teléfono de contacto válido"
                        state.effectiveReason.isBlank() -> "Indicá el motivo de consulta o medicamento solicitado"
                        else -> "Completá los datos obligatorios"
                    }
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            pharmacyOnDemandRepository.createRequest(
                pharmacyId = state.pharmacyId.takeIf { it.isNotBlank() },
                pharmacyName = state.pharmacyName,
                patientDni = state.patientDni.trim(),
                patientName = state.patientName.trim(),
                patientPhone = state.patientPhone.trim(),
                reason = state.effectiveReason.trim(),
            ).onSuccess { request ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        activeRequestId = request.id,
                        status = request.status,
                        queuePosition = 1,
                        estimatedMinutes = 3,
                        error = null,
                    )
                }
                startStatusPolling(request.id)
            }.onFailure { err ->
                SecureLog.error("[PharmacyIntakeVM] Failed creating request", err)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        error = "No pudimos crear la solicitud. Verificá tu conexión e intentá nuevamente."
                    )
                }
            }
        }
    }

    private fun startStatusPolling(requestId: String) {
        statusPollingJob?.cancel()
        statusPollingJob = viewModelScope.launch {
            while (true) {
                delay(2000)
                pharmacyOnDemandRepository.getRequestStatus(requestId)
                    .onSuccess { statusResp ->
                        val isAssignedOrInCall = statusResp.status == PharmacyConsultationStatus.ASSIGNED ||
                            statusResp.status == PharmacyConsultationStatus.IN_CALL
                        val hasRoom = !statusResp.roomId.isNullOrBlank()

                        _uiState.update { state ->
                            state.copy(
                                status = statusResp.status,
                                queuePosition = statusResp.queuePosition,
                                estimatedMinutes = (statusResp.queuePosition * 3).coerceAtLeast(1),
                                assignedDoctorName = statusResp.doctorName,
                                assignedDoctorSpecialty = statusResp.doctorSpecialty,
                                roomId = statusResp.roomId,
                                readyToJoinCall = isAssignedOrInCall && hasRoom,
                            )
                        }

                        if (isAssignedOrInCall && hasRoom) {
                            // Target reached, call room is ready
                            return@launch
                        }

                        if (statusResp.status == PharmacyConsultationStatus.CANCELLED ||
                            statusResp.status == PharmacyConsultationStatus.EXPIRED
                        ) {
                            _uiState.update {
                                it.copy(
                                    error = "La solicitud fue cancelada o expiró. Podés iniciar una nueva.",
                                    activeRequestId = null,
                                )
                            }
                            return@launch
                        }
                    }
                    .onFailure { err ->
                        SecureLog.error("[PharmacyIntakeVM] Error polling request status", err)
                    }
            }
        }
    }

    fun cancelActiveRequest() {
        val reqId = _uiState.value.activeRequestId ?: return
        statusPollingJob?.cancel()
        statusPollingJob = null
        viewModelScope.launch {
            runCatching {
                pharmacyOnDemandRepository.cancelRequest(reqId)
            }
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    activeRequestId = null,
                    status = null,
                    queuePosition = 0,
                    estimatedMinutes = 0,
                    assignedDoctorName = null,
                    assignedDoctorSpecialty = null,
                    roomId = null,
                    readyToJoinCall = false,
                    error = null,
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        statusPollingJob?.cancel()
    }
}
