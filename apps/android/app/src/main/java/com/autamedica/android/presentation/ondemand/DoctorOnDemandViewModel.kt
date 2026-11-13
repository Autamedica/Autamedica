package com.autamedica.android.presentation.ondemand

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DoctorOnDemandUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val doctorId: String = "",
    val isOnDuty: Boolean = false,
    val guardApproved: Boolean? = null,
    val guardVerificationStatus: String? = null,
    val dutyActiveTiers: List<String> = listOf("general"),
    val isDutyLoading: Boolean = false,
    val searchingRequests: List<PharmacyDispatchRequest> = emptyList(),
    val claimingId: String? = null,
    val activeRequestId: String? = null,
    val activeRoomId: String? = null,
)

@HiltViewModel
class DoctorOnDemandViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val doctorRepository: DoctorRepository,
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
    private val connectivityObserver: com.autamedica.android.util.ConnectivityObserver,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : ViewModel() {

    companion object {
        private const val HEARTBEAT_NORMAL_INTERVAL_MS = 30_000L
        private const val HEARTBEAT_INITIAL_RETRY_MS = 3_000L
        private const val HEARTBEAT_MAX_RETRY_MS = 15_000L
    }

    private val _uiState = MutableStateFlow(DoctorOnDemandUiState())
    val uiState: StateFlow<DoctorOnDemandUiState> = _uiState.asStateFlow()

    private val _navigateToCall = MutableStateFlow<DispatchClaimResult?>(null)
    val navigateToCall: StateFlow<DispatchClaimResult?> = _navigateToCall.asStateFlow()

    private val _dismissedRequestIds = MutableStateFlow<Set<String>>(emptySet())

    private var heartbeatJob: Job? = null
    private var networkObservationJob: Job? = null
    private val heartbeatTrigger = kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED)

    private fun startHeartbeat(doctorIdParam: String? = null) {
        val doctorId = doctorIdParam?.takeIf { it.isNotBlank() } ?: _uiState.value.doctorId
        if (doctorId.isBlank()) return

        stopHeartbeat()

        // 1. Escuchar reconexión de red para emitir heartbeat de inmediato sin esperar los 30s
        networkObservationJob = viewModelScope.launch(ioDispatcher) {
            var wasDisconnected = false
            connectivityObserver.status.collect { status ->
                if (status == com.autamedica.android.util.ConnectivityObserver.Status.Available) {
                    if (wasDisconnected) {
                        SecureLog.info("[DoctorOnDemand] Red reconectada (Available); disparando heartbeat inmediato para doctorId=$doctorId")
                        heartbeatTrigger.trySend(Unit)
                    }
                    wasDisconnected = false
                } else {
                    wasDisconnected = true
                }
            }
        }

        // 2. Loop de heartbeat con backoff adaptativo + jitter ante fallos transitorios
        heartbeatJob = viewModelScope.launch(ioDispatcher) {
            var failureCount = 0
            while (isActive) {
                val result = pharmacyDispatchRepository.sendDoctorHeartbeat(doctorId)
                val isSuccess = result.isSuccess

                val nextDelayMs = if (isSuccess) {
                    failureCount = 0
                    HEARTBEAT_NORMAL_INTERVAL_MS
                } else {
                    failureCount++
                    // Backoff exponencial corto (3s, 6s, 12s...) con jitter aleatorio (±20%), tope en 15s
                    val baseBackoff = (HEARTBEAT_INITIAL_RETRY_MS * (1L shl (failureCount - 1).coerceAtMost(3)))
                        .coerceAtMost(HEARTBEAT_MAX_RETRY_MS)
                    val jitterFactor = 0.8 + (Math.random() * 0.4) // 80%..120%
                    val backoffWithJitter = (baseBackoff * jitterFactor).toLong()
                    SecureLog.warn("[DoctorOnDemand] Heartbeat falló (intento #$failureCount). Reintentando en ${backoffWithJitter}ms (base=${baseBackoff}ms)")
                    backoffWithJitter
                }

                // Espera el delay completo O se despierta de inmediato si hay reconexión de red
                kotlinx.coroutines.withTimeoutOrNull(nextDelayMs) {
                    heartbeatTrigger.receive()
                }
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        networkObservationJob?.cancel()
        networkObservationJob = null
    }

    init {
        viewModelScope.launch {
            loadIdentityAndDuty()
            observeSearchingQueue()
        }
    }

    fun consumeNavigateToCall() {
        _navigateToCall.value = null
    }

    fun refresh() {
        viewModelScope.launch {
            loadIdentityAndDuty()
        }
    }

    fun toggleDuty() {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || _uiState.value.isDutyLoading) return

        val target = !_uiState.value.isOnDuty
        _uiState.update { it.copy(isDutyLoading = true) }

        viewModelScope.launch {
            if (target) {
                // Refresh at each activation: Admin may have revoked approval
                // since this screen was opened.
                val approval = pharmacyDispatchRepository.getMyGuardApproval().getOrNull()
                if (approval?.approved != true) {
                    stopHeartbeat()
                    _uiState.update {
                        it.copy(
                            isOnDuty = false,
                            guardApproved = false,
                            guardVerificationStatus = approval?.verificationStatus ?: "pending",
                            isDutyLoading = false,
                            error = "La guardia no está habilitada. Tu matrícula requiere validación del administrador."
                        )
                    }
                    return@launch
                }
                _uiState.update {
                    it.copy(guardApproved = true, guardVerificationStatus = approval.verificationStatus)
                }
            }
            pharmacyDispatchRepository.setDoctorDutyStatus(
                doctorId = doctorId,
                isOnDuty = target,
                activeTiers = _uiState.value.dutyActiveTiers,
            ).onSuccess {
                _uiState.update { it.copy(isOnDuty = target, isDutyLoading = false) }
                if (target) {
                    startHeartbeat(doctorId)
                } else {
                    stopHeartbeat()
                }
            }.onFailure { error ->
                SecureLog.error("[DoctorOnDemand] Failed toggling duty", error)
                _uiState.update {
                    it.copy(isDutyLoading = false, error = "No se pudo actualizar el estado de guardia")
                }
            }
        }
    }

    fun accept(request: PharmacyDispatchRequest) {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || !_uiState.value.isOnDuty || request.offerId.isNullOrBlank()
            || _uiState.value.claimingId != null) return

        _uiState.update { it.copy(claimingId = request.id) }

        viewModelScope.launch {
            pharmacyDispatchRepository.claimPharmacyRequest(request.id, doctorId)
                .onSuccess { claim ->
                    if (claim.success && !claim.cloudflareRoomId.isNullOrBlank()) {
                        _uiState.update { state ->
                            state.copy(
                                claimingId = null,
                                activeRequestId = claim.requestId ?: request.id,
                                activeRoomId = claim.cloudflareRoomId,
                            )
                        }
                        // The patient only joins once the in_call state is
                        // confirmed by the server. Preserve assigned room for
                        // retry if a network failure occurs after claim.
                        pharmacyDispatchRepository.updateDispatchRequestStatus(request.id, "in_call")
                            .onSuccess {
                                _navigateToCall.value = claim
                            }
                            .onFailure { error ->
                                SecureLog.error("[DoctorOnDemand] Could not confirm video entry", error)
                                _uiState.update {
                                    it.copy(error = "Consulta aceptada. No pudimos confirmar la videollamada. Tocá Reintentar ingreso.")
                                }
                            }
                    } else {
                        _uiState.update {
                            it.copy(
                                claimingId = null,
                                error = claim.code.takeIf { it.isNotBlank() } ?: "La consulta ya no está disponible",
                            )
                        }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorOnDemand] Failed claiming request", error)
                    _uiState.update {
                        it.copy(claimingId = null, error = "No se pudo aceptar la consulta")
                    }
                }
        }
    }

    fun finishCurrent() {
        val doctorId = _uiState.value.doctorId
        val requestId = _uiState.value.activeRequestId ?: return
        if (doctorId.isBlank()) return

        viewModelScope.launch {
            pharmacyDispatchRepository.finishPharmacyRequest(doctorId, requestId)
                .onSuccess {
                    _uiState.update { it.copy(activeRequestId = null, activeRoomId = null) }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorOnDemand] Failed finishing request", error)
                }
        }
    }

    private suspend fun loadIdentityAndDuty() {
        val user = authRepository.getCurrentUser()
        if (user == null) {
            _uiState.update { it.copy(isLoading = false, error = "Error de autenticación") }
            return
        }

        doctorRepository.getDoctorProfile(user.id)
            .onSuccess { profile ->
                _uiState.update {
                    it.copy(doctorId = profile.id, isLoading = false, error = null)
                }
                val approval = pharmacyDispatchRepository.getMyGuardApproval().getOrNull()
                val isAuthorized = approval?.approved == true
                _uiState.update {
                    it.copy(
                        guardApproved = isAuthorized,
                        guardVerificationStatus = approval?.verificationStatus ?: "pending",
                        error = if (!isAuthorized) {
                            "La matrícula todavía no está validada para atender consultas. Contactá al administrador."
                        } else null,
                    )
                }
                pharmacyDispatchRepository.getDoctorDutyStatus(profile.id)
                    .onSuccess { duty ->
                        _uiState.update {
                            it.copy(
                                isOnDuty = duty.isOnDuty && isAuthorized,
                                dutyActiveTiers = duty.activeTiers,
                                activeRequestId = duty.currentActiveRequestId,
                                isLoading = false,
                            )
                        }
                        if (duty.isOnDuty && isAuthorized) {
                            startHeartbeat(profile.id)
                        } else {
                            stopHeartbeat()
                        }
                    }
                    .onFailure { error ->
                        SecureLog.error("[DoctorOnDemand] Failed loading duty status", error)
                        _uiState.update { it.copy(isLoading = false, error = null) }
                    }
            }
            .onFailure { error ->
                SecureLog.error("[DoctorOnDemand] Failed loading doctor profile", error)
                _uiState.update {
                    it.copy(isLoading = false, error = "No se pudo cargar el perfil del doctor")
                }
            }
    }

    /** The clinician's rejection must be recorded on the one-time offer. */
    fun dismiss(request: PharmacyDispatchRequest) {
        val offerId = request.offerId
        if (offerId.isNullOrBlank()) {
            _uiState.update { it.copy(error = "Oferta sin identificador válido. Actualizá la lista.") }
            return
        }
        viewModelScope.launch {
            pharmacyDispatchRepository.declinePharmacyOffer(offerId)
                .onSuccess { declined ->
                    if (declined) {
                        _dismissedRequestIds.update { it + "${request.id}:${request.offerExpiresAt}" }
                    } else {
                        _uiState.update { it.copy(error = "Esta oferta ya no está disponible.") }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorOnDemand] Failed declining offer", error)
                    _uiState.update { it.copy(error = "No se pudo rechazar la oferta. Intentá nuevamente.") }
                }
        }
    }

    fun retryAcceptedCall() {
        val requestId = _uiState.value.activeRequestId ?: return
        val roomId = _uiState.value.activeRoomId ?: return
        if (_uiState.value.claimingId != null) return
        viewModelScope.launch {
            pharmacyDispatchRepository.updateDispatchRequestStatus(requestId, "in_call")
                .onSuccess {
                    _uiState.update { it.copy(error = null) }
                    _navigateToCall.value = DispatchClaimResult(
                        success = true,
                        code = "CALL_RESUMED",
                        requestId = requestId,
                        cloudflareRoomId = roomId,
                    )
                }
                .onFailure {
                    _uiState.update { state ->
                        state.copy(error = "La conexión aún no está confirmada. Podés volver a intentarlo.")
                    }
                }
        }
    }

    private suspend fun observeSearchingQueue() {
        try {
            kotlinx.coroutines.flow.combine(
                pharmacyDispatchRepository.observeSearchingRequests(),
                _dismissedRequestIds,
            ) { requests, dismissed ->
                requests.filter { "${it.id}:${it.offerExpiresAt}" !in dismissed }
            }.collect { filteredRequests ->
                _uiState.update { it.copy(searchingRequests = filteredRequests) }
            }
        } catch (error: Throwable) {
            SecureLog.error("[DoctorOnDemand] Error observing searching queue", error)
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopHeartbeat()
    }
}