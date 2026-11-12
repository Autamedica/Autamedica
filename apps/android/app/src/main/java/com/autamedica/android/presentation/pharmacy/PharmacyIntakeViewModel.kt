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
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PharmacyIntakeUiState(
    val pharmacyId: String = "",
    val referralCode: String = "",
    val activeReferralPartnerId: String? = null,
    val paymentStatus: String = "not_started",
    val isPaymentLoading: Boolean = false,
    val paymentCheckoutUrl: String? = null,
    val paymentError: String? = null,
    val pharmacyName: String = "Farmacia de Turno",
    val patientName: String = "",
    val patientPhone: String = "",
    val patientDni: String = "",
    val careCountry: String? = null,
    val selectedReasonChip: String? = null,
    val reasonText: String = "",
    val isAuthenticated: Boolean = false,
    val isLoadingProfile: Boolean = true,
    val isRestoringRequest: Boolean = true,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    // Normal queue outcomes are informational, not validation/network errors.
    val statusNotice: String? = null,
    val activeRequestId: String? = null,
    val status: PharmacyConsultationStatus? = null,
    val queuePosition: Int = 0,
    val estimatedMinutes: Int = 0,
    val assignedDoctorName: String? = null,
    val assignedDoctorSpecialty: String? = null,
    val roomId: String? = null,
    val readyToJoinCall: Boolean = false,
    val activeDoctors: List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo> = emptyList(),
    // Privacy-safe backend capacity aggregate for the chosen care country.
    // Null means unavailable/unknown, not zero.
    val onlineDoctorsInMarket: Int? = null,
) {
    /** The signed backend resolves partner provenance; recovery must not bypass payment. */
    val requiresBrazilianPayment: Boolean
        get() = careCountry == "BR" && (referralCode == "JORDAN" || activeReferralPartnerId != null)

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
            careCountry in setOf("AR", "BR") &&
            (if (careCountry == "BR")
                patientDni.count(Char::isDigit) == 11
             else patientDni.count(Char::isDigit) in 5..10) &&
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
    private val referralCodeParam: String = (savedStateHandle.get<String>("referralCode") ?: "")
        .trim().uppercase(java.util.Locale.ROOT)
        .takeIf { it.matches(Regex("^[A-Z0-9_-]{3,32}$")) } ?: ""

    private val _uiState = MutableStateFlow(
        PharmacyIntakeUiState(
            pharmacyId = pharmacyIdParam,
            referralCode = referralCodeParam,
            careCountry = if (referralCodeParam == "JORDAN") "BR" else null,
        )
    )
    val uiState: StateFlow<PharmacyIntakeUiState> = _uiState.asStateFlow()

    private var statusPollingJob: Job? = null
    private var paymentPollingJob: Job? = null
    private var observeActiveDoctorsJob: Job? = null
    private var marketCapacityJob: Job? = null

    private fun refreshCountryDoctorCount(country: String?) {
        if (country !in setOf("AR", "BR")) return
        marketCapacityJob?.cancel()
        marketCapacityJob = viewModelScope.launch {
            pharmacyDispatchRepository.getCountryOnDutyCapacity(requireNotNull(country))
                .onSuccess { count ->
                    _uiState.update { state ->
                        if (state.careCountry == country) {
                            state.copy(onlineDoctorsInMarket = count.coerceAtLeast(0))
                        } else state
                    }
                }
                .onFailure {
                    _uiState.update { state ->
                        if (state.careCountry == country) state.copy(onlineDoctorsInMarket = null)
                        else state
                    }
                }
        }
    }

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
            _uiState.update { it.copy(isRestoringRequest = true) }
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

            // The active queue lives on the server, not in a transient Compose
            // screen. Recover the same country/request after app restart.
            // Both logged-in patients and guests with an encrypted device
            // recovery credential restore the SAME request after app restart.
            if (_uiState.value.activeRequestId == null) {
                pharmacyDispatchRepository.getActivePatientDispatchRequest()
                    .onSuccess { request ->
                        if (request != null && _uiState.value.activeRequestId == null) {
                            _uiState.update {
                                it.copy(
                                    activeRequestId = request.id,
                                    careCountry = request.careCountry,
                                    activeReferralPartnerId = request.referralPartnerId,
                                    patientName = request.patientName ?: it.patientName,
                                    patientDni = request.patientDni,
                                    patientPhone = request.patientPhone,
                                    reasonText = request.symptomSummary ?: it.reasonText,
                                    status = mapDispatchStatus(request.status),
                                    roomId = request.cloudflareRoomId.takeIf(String::isNotBlank),
                                    // Dispatch state alone never authorizes a Jordan video call after process death.
                                    readyToJoinCall = request.doctorAttendedCall &&
                                        request.cloudflareRoomId.isNotBlank() &&
                                        !(request.careCountry == "BR" &&
                                            (referralCodeParam == "JORDAN" || request.referralPartnerId != null)),
                                    error = null,
                                    statusNotice = null,
                                )
                            }
                            refreshCountryDoctorCount(request.careCountry)
                            // Observe the request even if the doctor already attended: payment is independent.
                            startStatusPolling(request.id)
                            if (request.careCountry == "BR" && request.status in setOf("searching", "matched", "in_call") &&
                                (referralCodeParam == "JORDAN" || request.referralPartnerId != null)) {
                                startPaymentStatusPolling(request.id)
                            }
                        }
                    }
                    .onFailure { error ->
                        SecureLog.warn("[PharmacyIntakeVM] Queue recovery unavailable: ${error.message}")
                    }
            }
            _uiState.update { it.copy(isRestoringRequest = false) }
        }
    }

    fun onPatientNameChanged(name: String) {
        _uiState.update { it.copy(patientName = name, error = null, statusNotice = null) }
    }

    fun onPatientPhoneChanged(phone: String) {
        _uiState.update { it.copy(patientPhone = phone, error = null) }
    }

    fun onPatientDniChanged(dni: String) {
        _uiState.update { it.copy(patientDni = dni, error = null) }
    }

    fun onCountrySelected(country: String) {
        require(country == "AR" || country == "BR")
        // Brazil-only QR partner may never be submitted as an Argentine intake.
        if (_uiState.value.referralCode == "JORDAN" && country != "BR") return
        _uiState.update { state ->
            // Initial selection is not a switch between clinical markets.
            val countryChanged = state.careCountry != null && state.careCountry != country
            val reasonWasAutoFilled = state.selectedReasonChip != null &&
                state.reasonText == state.selectedReasonChip
            state.copy(
                careCountry = country,
                // Do not reuse one patient's national identifier in another jurisdiction.
                patientDni = if (countryChanged) "" else state.patientDni,
                // A localized reason chip must never travel to the other country's intake.
                selectedReasonChip = if (countryChanged) null else state.selectedReasonChip,
                reasonText = if (countryChanged && reasonWasAutoFilled) "" else state.reasonText,
                error = null,
                onlineDoctorsInMarket = null,
            )
        }
        refreshCountryDoctorCount(country)
    }

    fun onReasonChipSelected(chip: String) {
        _uiState.update { state ->
            val isSame = state.selectedReasonChip == chip
            val newChip = if (isSame) null else chip
            // A previous auto-filled chip is never a second clinical reason.
            // Preserve only genuinely custom text entered by the patient.
            val previousWasAutoFilled = state.reasonText == state.selectedReasonChip
            val newText = when {
                newChip != null && (state.reasonText.isBlank() || previousWasAutoFilled) -> newChip
                newChip == null && previousWasAutoFilled -> ""
                else -> state.reasonText
            }
            state.copy(selectedReasonChip = newChip, reasonText = newText, error = null)
        }
    }

    fun onReasonTextChanged(text: String) {
        _uiState.update { it.copy(reasonText = text, error = null) }
    }

    fun submitRequest() {
        val state = _uiState.value
        if (state.isRestoringRequest || state.isSubmitting || state.activeRequestId != null) return
        if (!state.isFormValid) {
            _uiState.update {
                it.copy(
                    error = when {
                        state.patientName.isBlank() -> "Ingresá el nombre completo del paciente"
                        state.careCountry !in setOf("AR", "BR") -> "Seleccioná Argentina o Brasil"
                        state.careCountry == "BR" && state.patientDni.count(Char::isDigit) != 11 ->
                            "Ingresá un CPF de 11 dígitos"
                        state.patientDni.count(Char::isDigit) !in 5..10 -> "Ingresá un DNI válido"
                        state.patientPhone.length < 6 -> "Ingresá un teléfono de contacto válido"
                        state.effectiveReason.isBlank() -> "Indicá el motivo de consulta o medicamento solicitado"
                        else -> "Completá los datos obligatorios"
                    }
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null, statusNotice = null) }
            pharmacyDispatchRepository.createPatientDispatchRequest(
                patientDni = state.patientDni.trim(),
                patientPhone = state.patientPhone.trim(),
                patientName = state.patientName.trim(),
                tierRequested = "general",
                symptomSummary = state.effectiveReason.trim(),
                patientCpf = if (state.careCountry == "BR") state.patientDni.trim() else null,
                careCountry = state.careCountry,
                referralCode = state.referralCode.ifBlank { null },
            ).onSuccess { request ->
                val hasRoom = request.cloudflareRoomId.isNotBlank()
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        activeRequestId = request.id,
                        careCountry = request.careCountry ?: state.careCountry,
                        activeReferralPartnerId = request.referralPartnerId,
                        paymentStatus = "not_started",
                        paymentCheckoutUrl = null,
                        status = PharmacyConsultationStatus.PENDING,
                        // Queue position and wait time have not been confirmed by the backend.
                        queuePosition = 0,
                        estimatedMinutes = 0,
                        roomId = if (hasRoom) request.cloudflareRoomId else null,
                        readyToJoinCall = false,
                        error = null,
                    )
                }
                // La espera queda activa (radar) mientras el request está searching/matched.
                // readyToJoinCall solo se enciende cuando el médico atiende (in_call) y la sala existe.
                startStatusPolling(request.id)
                refreshCountryDoctorCount(request.careCountry ?: state.careCountry)
            }.onFailure { err ->
                SecureLog.error("[PharmacyIntakeVM] Failed creating request", err)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        error = classifyIntakeCreationFailure(err),
                    )
                }
            }
        }
    }

    fun beginBrazilianCheckout() {
        val state = _uiState.value
        val requestId = state.activeRequestId ?: return
        if (!state.requiresBrazilianPayment || state.isPaymentLoading ||
            state.status !in setOf(PharmacyConsultationStatus.PENDING, PharmacyConsultationStatus.ASSIGNED, PharmacyConsultationStatus.IN_CALL)) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPaymentLoading = true, paymentError = null) }
            pharmacyDispatchRepository.startDispatchCheckout(requestId)
                .onSuccess { payment ->
                    _uiState.update { current ->
                        current.copy(
                            isPaymentLoading = false,
                            paymentStatus = payment.status,
                            paymentCheckoutUrl = payment.checkoutUrl,
                            // Only server-verified approval may unlock a joined call.
                            readyToJoinCall = current.status == PharmacyConsultationStatus.IN_CALL &&
                                !current.roomId.isNullOrBlank() && payment.status == "approved",
                        )
                    }
                }.onFailure {
                    _uiState.update { it.copy(
                        isPaymentLoading = false,
                        paymentError = "Não foi possível iniciar ou confirmar o pagamento. Tente novamente.",
                    ) }
                }
        }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(paymentCheckoutUrl = null) }
    }

    /** Poll the PSP independently of dispatch events after process restoration. */
    private fun startPaymentStatusPolling(requestId: String) {
        paymentPollingJob?.cancel()
        paymentPollingJob = viewModelScope.launch {
            while (isActive) {
                val current = _uiState.value
                if (current.activeRequestId != requestId || !current.requiresBrazilianPayment) break

                val verifiedStatus = pharmacyDispatchRepository.getDispatchPaymentStatus(requestId).getOrNull()
                if (verifiedStatus != null) {
                    _uiState.update { state ->
                        if (state.activeRequestId != requestId) return@update state
                        state.copy(
                            paymentStatus = verifiedStatus,
                            readyToJoinCall = state.status == PharmacyConsultationStatus.IN_CALL &&
                                !state.roomId.isNullOrBlank() && verifiedStatus == "approved",
                        )
                    }
                    if (verifiedStatus in setOf("approved", "rejected", "refunded", "cancelled", "expired")) break
                }
                delay(5_000)
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
                val paymentRequired = (_uiState.value.referralCode == "JORDAN" ||
                    request.referralPartnerId != null) && request.careCountry == "BR"
                val verifiedPaymentStatus = if (paymentRequired &&
                    request.status in setOf("searching", "matched", "in_call", "completed")) {
                    // The PSP-backed endpoint is authoritative; never infer paid from
                    // a redirect, a local callback or a clinician's presence.
                    pharmacyDispatchRepository.getDispatchPaymentStatus(requestId).getOrNull()
                } else null
                if (request.status == "searching" || request.status == "matched") {
                    refreshCountryDoctorCount(_uiState.value.careCountry)
                }

                _uiState.update { state ->
                    val confirmedPayment = if (paymentRequired &&
                        request.status in setOf("searching", "matched", "in_call", "completed")) {
                        verifiedPaymentStatus ?: "unknown"
                    } else state.paymentStatus
                    state.copy(
                        status = mapDispatchStatus(request.status),
                        activeReferralPartnerId = request.referralPartnerId ?: state.activeReferralPartnerId,
                        paymentStatus = confirmedPayment,
                        // A dispatch status does not establish a verified rank or ETA.
                        queuePosition = 0,
                        estimatedMinutes = 0,
                        roomId = if (hasRoom) request.cloudflareRoomId else state.roomId,
                        readyToJoinCall = isJoinable && hasRoom &&
                            (!paymentRequired || confirmedPayment == "approved"),
                    )
                }

                if (isJoinable && hasRoom && (!paymentRequired || verifiedPaymentStatus == "approved")) {
                    statusPollingJob?.cancel()
                }
                if (isTerminalFailure) {
                    statusPollingJob?.cancel()
                    paymentPollingJob?.cancel()
                    _uiState.update {
                        it.copy(
                            // A completed/closed legacy request must not be mislabeled
                            // as a failure due to unavailable physicians.
                            error = null,
                            statusNotice = when (request.status) {
                                "expired" -> "Esta solicitud anterior finalizó. Podés iniciar una nueva consulta."
                                else -> "La solicitud fue cancelada."
                            },
                            activeRequestId = null,
                            roomId = null,
                            readyToJoinCall = false,
                        )
                    }
                }
            }
        }
    }

    fun onCallNavigated() {
        statusPollingJob?.cancel()
        paymentPollingJob?.cancel()
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
        if (_uiState.value.isSubmitting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            pharmacyDispatchRepository.cancelPatientDispatchRequest(reqId)
                .onSuccess { cancelled ->
                    if (cancelled) {
                        statusPollingJob?.cancel()
                        statusPollingJob = null
                        paymentPollingJob?.cancel()
                        paymentPollingJob = null
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
                                paymentStatus = "not_started",
                                paymentCheckoutUrl = null,
                                error = null,
                            )
                        }
                    } else {
                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                error = "No se confirmó la cancelación. Es posible que la solicitud ya haya sido asignada; verificá su estado.",
                            )
                        }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[PharmacyIntakeVM] Patient cancellation failed", error)
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            error = "No pudimos cancelar la solicitud. Verificá tu conexión e intentá nuevamente.",
                        )
                    }
                }
        }
    }

    override fun onCleared() {
        super.onCleared()
        statusPollingJob?.cancel()
        paymentPollingJob?.cancel()
        observeActiveDoctorsJob?.cancel()
    }
}

/**
 * Only public, allowlisted failure categories reach the UI. Never show
 * PostgREST exception details: they can include patient documents or symptoms.
 */
internal fun classifyIntakeCreationFailure(error: Throwable): String {
    val message = error.message.orEmpty().lowercase(java.util.Locale.ROOT)
    return when {
        "care_country_or_patient_profile_required" in message ->
            "Necesitás completar tu perfil de paciente para solicitar una consulta."
        "care_country_dispatch_mismatch" in message ||
            "care_country_required_or_mismatched" in message ->
            "El país de la consulta no coincide con tu perfil de paciente."
        "invalid_mobile_session" in message || "dispatch_request_identity_denied" in message ||
            "http 401" in message || "jwt expired" in message ->
            "No pudimos validar tu sesión. Iniciá sesión nuevamente."
        "permission denied" in message || "http 403" in message ||
            "42501" in message ->
            "No se pudo autorizar la solicitud. Revisá tus datos de paciente."
        "http 503" in message || "dispatch_service_unavailable" in message ->
            "El servicio de consultas no está disponible temporalmente. Intentá más tarde."
        "unable to resolve host" in message || "unknownhost" in message ||
            "socket" in message || "timeout" in message ||
            "connection" in message || "network" in message ->
            "No pudimos crear la solicitud. Verificá tu conexión e intentá nuevamente."
        else ->
            "No pudimos registrar tu consulta. Intentá nuevamente o contactá soporte."
    }
}
