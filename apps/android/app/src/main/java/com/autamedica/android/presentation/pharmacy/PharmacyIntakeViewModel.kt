package com.autamedica.android.presentation.pharmacy

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
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
    val activeRequestId: String? = null,
    val status: PharmacyConsultationStatus? = null,
    val queuePosition: Int = 0,
    val estimatedMinutes: Int = 0,
    val assignedDoctorName: String? = null,
    val assignedDoctorSpecialty: String? = null,
    val roomId: String? = null,
    val readyToJoinCall: Boolean = false,
    val activeDoctors: List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo> = emptyList(),
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
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
) : ViewModel() {

    private val pharmacyIdParam: String = savedStateHandle["pharmacyId"] ?: ""

    private val _uiState = MutableStateFlow(
        PharmacyIntakeUiState(pharmacyId = pharmacyIdParam)
    )
    val uiState: StateFlow<PharmacyIntakeUiState> = _uiState.asStateFlow()

    private var statusPollingJob: Job? = null
    private var observeActiveDoctorsJob: Job? = null

    val reasonChips: List<String> = listOf(
        "Renovación de Receta",
        "Presión / Hipertensión",
        "Gripe / Fiebre",
        "Alergia",
        "Dolor Muscular"
    )

    init {
        loadUserProfile()
        observeActiveDoctors()
    }

    fun observeActiveDoctors() {
        observeActiveDoctorsJob?.cancel()
        observeActiveDoctorsJob = viewModelScope.launch {
            pharmacyDispatchRepository.observeActiveOnDutyDoctors().collect { docs ->
                _uiState.update { it.copy(activeDoctors = docs.ifEmpty { emptyList() }) }
            }
        }
    }

    fun loadActiveDoctors() {
        observeActiveDoctors()
    }

    fun loadUserProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingProfile = true, error = null) }
            runCatching {
                val currentUser = authRepository.getCurrentUser()
                val profile = profileRepository.getProfile().getOrNull()
                val snapshot = profileRepository.getPatientProfileSnapshot().getOrNull()

                if (currentUser != null) {
                    val rawDisplayName = profile?.displayName?.takeIf { it.isNotBlank() }
                        ?: currentUser.displayName
                    val cleanDisplayName = when {
                        rawDisplayName.contains("@") -> com.autamedica.android.domain.model.formatCleanNameFromEmail(rawDisplayName)
                        rawDisplayName.isNotBlank() -> com.autamedica.android.domain.model.formatCleanName(rawDisplayName)
                        else -> ""
                    }
                    val phone = profile?.phone?.takeIf { it.isNotBlank() }
                        ?: currentUser.phone.orEmpty()
                    val dni = snapshot?.dni.orEmpty()

                    _uiState.update { state ->
                        val currentName = state.patientName
                        val resolvedPatientName = when {
                            currentName.isBlank() -> cleanDisplayName
                            currentName.contains("@") -> com.autamedica.android.domain.model.formatCleanNameFromEmail(currentName)
                            else -> currentName
                        }
                        state.copy(
                            isAuthenticated = true,
                            patientName = resolvedPatientName,
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
            pharmacyDispatchRepository.createPatientDispatchRequest(
                patientDni = state.patientDni.trim(),
                patientPhone = state.patientPhone.trim(),
                patientName = state.patientName.trim(),
                tierRequested = "general",
                symptomSummary = state.effectiveReason.trim(),
            ).onSuccess { request ->
                val hasRoom = request.cloudflareRoomId.isNotBlank()
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        activeRequestId = request.id,
                        status = PharmacyConsultationStatus.PENDING,
                        queuePosition = 1,
                        estimatedMinutes = 3,
                        roomId = if (hasRoom) request.cloudflareRoomId else null,
                        readyToJoinCall = false,
                        error = null,
                    )
                }
                // La espera queda activa (radar) mientras el request está searching/matched.
                // readyToJoinCall solo se enciende cuando el médico atiende (in_call) y la sala existe.
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
            pharmacyDispatchRepository.observePatientRequest(requestId).collect { request ->
                val isJoinable = request.doctorAttendedCall
                val isTerminalFailure = request.status == "cancelled" || request.status == "expired"
                val hasRoom = request.cloudflareRoomId.isNotBlank()

                _uiState.update { state ->
                    state.copy(
                        status = mapDispatchStatus(request.status),
                        queuePosition = if (request.status == "searching") 1 else state.queuePosition,
                        estimatedMinutes = if (request.status == "searching") 3 else state.estimatedMinutes,
                        roomId = if (hasRoom) request.cloudflareRoomId else state.roomId,
                        readyToJoinCall = isJoinable && hasRoom,
                    )
                }

                if (isJoinable && hasRoom) {
                    statusPollingJob?.cancel()
                }
                if (isTerminalFailure) {
                    statusPollingJob?.cancel()
                    _uiState.update {
                        it.copy(
                            error = "La solicitud fue cancelada o expiró. Podés iniciar una nueva.",
                            activeRequestId = null,
                        )
                    }
                }
            }
        }
    }

    fun onCallNavigated() {
        statusPollingJob?.cancel()
        _uiState.update {
            it.copy(
                readyToJoinCall = false,
                activeRequestId = null,
                roomId = null,
                status = null,
            )
        }
    }

    private fun mapDispatchStatus(dispatchStatus: String): PharmacyConsultationStatus? = when (dispatchStatus) {
        "searching" -> PharmacyConsultationStatus.PENDING
        "matched" -> PharmacyConsultationStatus.ASSIGNED
        "in_call" -> PharmacyConsultationStatus.IN_CALL
        "completed" -> PharmacyConsultationStatus.COMPLETED
        "cancelled" -> PharmacyConsultationStatus.CANCELLED
        "expired" -> PharmacyConsultationStatus.EXPIRED
        else -> null
    }

    fun cancelActiveRequest() {
        val reqId = _uiState.value.activeRequestId ?: return
        statusPollingJob?.cancel()
        statusPollingJob = null
        viewModelScope.launch {
            runCatching {
                pharmacyDispatchRepository.updateDispatchRequestStatus(reqId, "cancelled")
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
        observeActiveDoctorsJob?.cancel()
    }
}
