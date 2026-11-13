package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.ChatStatus
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

data class DoctorDashboardUiState(
    val doctorProfile: DoctorProfile? = null,
    val stats: DoctorStats = DoctorStats(),
    val statsAvailable: Boolean = false,
    val todayAppointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val unreadMessagesCount: Int = 0,
    val urgentChats: List<MedicalChat> = emptyList(),
    val recentPatients: List<PatientSummary> = emptyList(),
    val patientNames: Map<String, String> = emptyMap(),
    val patientsMap: Map<String, PatientSummary> = emptyMap(),
    val pharmacyOnDutyState: DoctorOnDutyPharmacyState = DoctorOnDutyPharmacyState(),
    val guardApproved: Boolean? = null,
    val guardVerificationStatus: String? = null,
    val claimingPharmacyRequestId: String? = null,
    val claimErrorMessage: String? = null,
    val acceptedDispatchRequestId: String? = null,
    val acceptedDispatchRoomId: String? = null,
    val simulatedDispatchAlert: PharmacyDispatchRequest? = null,
    val activelyDispatchedPatientId: String? = null,
    val liveWaitingQueue: List<QueuedPatient> = emptyList(),
    val dismissedRequestIds: Set<String> = emptySet(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val telemedicineError: String? = null,
    val userId: String = "",
    val userName: String = "",
    val doctorId: String = "",
)

@HiltViewModel
class DoctorDashboardViewModel @Inject constructor(
    private val doctorRepository: DoctorRepository,
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val telemedicineRepository: TelemedicineRepository,
    private val chatRepository: ChatRepository,
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
    private val connectivityObserver: com.autamedica.android.util.ConnectivityObserver,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorDashboardUiState())
    val uiState: StateFlow<DoctorDashboardUiState> = _uiState.asStateFlow()

    private val _dismissedRequestIds = MutableStateFlow<Set<String>>(emptySet())
    private val _isOnDuty = MutableStateFlow(false)
    private var incomingOffersJob: Job? = null

    init {
        loadAll()
        observeChatSummary()
        observeIncomingOffers()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAll()
    }

    private fun loadAll() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (user == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = "Error de autenticacion",
                    )
                }
                return@launch
            }
            _uiState.update { state ->
                state.copy(
                    userId = user.id,
                    userName = listOfNotNull(user.firstName, user.lastName)
                        .joinToString(" ")
                        .ifBlank { user.email },
                )
            }

            // Load doctor profile to get doctor record ID
            val profileResult = doctorRepository.getDoctorProfile(user.id)
            profileResult.onSuccess { profile ->
                _uiState.update { it.copy(doctorProfile = profile, doctorId = profile.id) }

                // Load stats, appointments and patients in parallel
                val statsDeferred = async { doctorRepository.getDoctorStats(profile.id) }
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }
                val patientsDeferred = async { doctorRepository.getDoctorPatients(profile.id) }

                val stats = statsDeferred.await()
                val appointments = appointmentsDeferred.await()
                val patients = patientsDeferred.await()
                val allAppointments = appointments.getOrDefault(emptyList())
                val patientsList = patients.getOrDefault(emptyList())

                val missingPatientIds = allAppointments.mapNotNull { it.patientId }.distinct().filter { id ->
                    patientsList.none { it.id == id || it.userId == id }
                }
                val extraPatientsMap = if (missingPatientIds.isNotEmpty()) {
                    doctorRepository.resolvePatientSummaries(missingPatientIds).getOrDefault(emptyMap())
                } else emptyMap()

                val allPatientsMap = buildMap<String, PatientSummary> {
                    patientsList.forEach { p ->
                        put(p.id, p)
                        if (p.userId.isNotBlank()) put(p.userId, p)
                    }
                    extraPatientsMap.forEach { (k, v) ->
                        put(k, v)
                    }
                }
                val patientNamesMap = allPatientsMap.mapValues { (_, p) ->
                    "${p.firstName} ${p.lastName}".trim()
                }
                val joinableResult = resolveJoinableAppointmentIds(allAppointments)

                _uiState.update { state ->
                    state.copy(
                        stats = stats.getOrDefault(DoctorStats()),
                        statsAvailable = stats.isSuccess,
                        todayAppointments = prioritizeToday(allAppointments),
                        joinableAppointmentIds = joinableResult.first,
                        recentPatients = patientsList.take(5),
                        patientNames = patientNamesMap,
                        patientsMap = allPatientsMap,
                        isLoading = false,
                        isRefreshing = false,
                        error = null,
                        telemedicineError = joinableResult.second,
                    )
                }
                // Load pharmacy on duty status
                loadPharmacyDuty(profile.id)
            }.onFailure { error ->
                SecureLog.error("[DoctorDashboard] Failed loading doctor profile", error)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = "No se pudo cargar el perfil del doctor",
                    )
                }
            }
        }
    }

    companion object {
        private const val HEARTBEAT_NORMAL_INTERVAL_MS = 30_000L
        private const val HEARTBEAT_INITIAL_RETRY_MS = 3_000L
        private const val HEARTBEAT_MAX_RETRY_MS = 15_000L
    }

    private var dispatchEngineJob: Job? = null
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
                        SecureLog.info("[DoctorDashboard] Red reconectada (Available); disparando heartbeat inmediato para doctorId=$doctorId")
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
                    SecureLog.warn("[DoctorDashboard] Heartbeat falló (intento #$failureCount). Reintentando en ${backoffWithJitter}ms (base=${baseBackoff}ms)")
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

    private fun observeIncomingOffers() {
        incomingOffersJob?.cancel()
        incomingOffersJob = viewModelScope.launch {
            combine(
                pharmacyDispatchRepository.observeIncomingOffers(),
                _dismissedRequestIds,
                _isOnDuty,
            ) { requests, dismissed, onDuty ->
                Triple(requests.filter { "${it.id}:${it.offerExpiresAt}" !in dismissed }, dismissed, onDuty)
            }.collect { (activeOffers, _, onDuty) ->
                val nextAlert = if (onDuty) activeOffers.firstOrNull() else null
                val mappedQueue = activeOffers.map { it.toQueuedPatient() }
                val mappedConsultations = activeOffers.map { it.toConsultationRequest() }

                _uiState.update { state ->
                    state.copy(
                        simulatedDispatchAlert = nextAlert,
                        activelyDispatchedPatientId = nextAlert?.id,
                        liveWaitingQueue = mappedQueue,
                        pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                            waitingQueueCount = activeOffers.size,
                            pendingRequests = mappedConsultations,
                        ),
                    )
                }
            }
        }
    }

    fun dismissDispatchAlert(requestId: String? = null) {
        val offer = _uiState.value.simulatedDispatchAlert
            ?.takeIf { requestId == null || it.id == requestId }
        if (offer == null || offer.offerId.isNullOrBlank()) {
            _uiState.update { it.copy(claimErrorMessage = "Esta oferta ya no está disponible.") }
            return
        }
        viewModelScope.launch {
            pharmacyDispatchRepository.declinePharmacyOffer(requireNotNull(offer.offerId))
                .onSuccess { declined ->
                    if (declined) {
                        _dismissedRequestIds.update { it + "${offer.id}:${offer.offerExpiresAt}" }
                        _uiState.update {
                            it.copy(simulatedDispatchAlert = null, activelyDispatchedPatientId = null,
                                dismissedRequestIds = it.dismissedRequestIds + "${offer.id}:${offer.offerExpiresAt}")
                        }
                    } else {
                        _uiState.update { it.copy(claimErrorMessage = "La oferta ya venció o fue asignada.") }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorDashboard] Offer refusal failed", error)
                    _uiState.update { it.copy(claimErrorMessage = "No se pudo rechazar la oferta.") }
                }
        }
    }

    fun togglePharmacyOnDuty(onDuty: Boolean) {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(pharmacyOnDutyState = it.pharmacyOnDutyState.copy(isLoading = true)) }
            if (onDuty) {
                val approval = pharmacyDispatchRepository.getMyGuardApproval().getOrNull()
                if (approval?.approved != true) {
                    stopHeartbeat()
                    _isOnDuty.value = false
                    _uiState.update { state ->
                        state.copy(
                            guardApproved = false,
                            guardVerificationStatus = approval?.verificationStatus ?: "pending",
                            pharmacyOnDutyState = state.pharmacyOnDutyState.copy(isOnDuty = false, isLoading = false),
                            error = "La guardia necesita aprobación administrativa de la matrícula.",
                        )
                    }
                    return@launch
                }
                _uiState.update { it.copy(guardApproved=true,guardVerificationStatus=approval.verificationStatus) }
            }
            pharmacyDispatchRepository.setDoctorDutyStatus(
                doctorId = doctorId,
                isOnDuty = onDuty,
                activeTiers = listOf("general"),
            ).onSuccess {
                _isOnDuty.value = onDuty
                _uiState.update { state ->
                    state.copy(
                        pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                            isOnDuty = onDuty,
                            isLoading = false,
                        ),
                    )
                }
                if (onDuty) {
                    startHeartbeat(doctorId)
                } else {
                    stopHeartbeat()
                }
            }.onFailure { error ->
                SecureLog.error("[DoctorDashboard] Error toggling pharmacy duty", error)
                // Keep the previously confirmed server state. Never start a false heartbeat.
                _uiState.update { state ->
                    state.copy(
                        pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                            isLoading = false,
                        ),
                        error = "No se pudo actualizar el estado de guardia.",
                    )
                }
                loadPharmacyDuty(doctorId)
            }
        }
    }

    fun claimPharmacyRequest(requestId: String, onNavigateToVideoCall: (String) -> Unit) {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || requestId.isBlank()) {
            _uiState.update { it.copy(claimErrorMessage = "No hay un médico o solicitud válida.") }
            return
        }
        if (_uiState.value.claimingPharmacyRequestId != null) return
        val incoming = _uiState.value.simulatedDispatchAlert
        if (!_uiState.value.pharmacyOnDutyState.isOnDuty
            || incoming?.id != requestId || incoming.offerId.isNullOrBlank()) {
            _uiState.update { it.copy(claimErrorMessage = "La oferta no está vigente. Revisá el radar.") }
            return
        }

        val traceId = "trace-" + java.util.UUID.randomUUID().toString().substring(0, 8)
        com.autamedica.android.telemetry.CallTelemetry.recordMilestone(traceId, "T0_TAP_INGRESAR")
        _uiState.update { it.copy(claimingPharmacyRequestId = requestId, claimErrorMessage = null) }

        // Claim atomically first. Never open a call for unconfirmed/synthetic offers.
        viewModelScope.launch {
            pharmacyDispatchRepository.claimPharmacyRequest(requestId, doctorId)
                .onSuccess { claim ->
                    val roomId = claim.cloudflareRoomId?.takeIf { it.isNotBlank() }
                    if (claim.success && roomId != null) {
                        _dismissedRequestIds.update { it + "${incoming.id}:${incoming.offerExpiresAt}" }
                        _uiState.update { state ->
                            state.copy(
                                claimingPharmacyRequestId = null,
                                simulatedDispatchAlert = null,
                                activelyDispatchedPatientId = null,
                                liveWaitingQueue = state.liveWaitingQueue.filter { it.id != requestId },
                                dismissedRequestIds = state.dismissedRequestIds + requestId,
                            )
                        }
                        _uiState.update {
                            it.copy(acceptedDispatchRequestId = requestId, acceptedDispatchRoomId = roomId)
                        }
                        // Both phones must observe the same authoritative status
                        // before opening the call. A failed update is not success.
                        pharmacyDispatchRepository.updateDispatchRequestStatus(requestId, "in_call")
                            .onSuccess {
                                com.autamedica.android.telemetry.CallTelemetry.recordMilestone(
                                    traceId, "T1_BACKEND_CLAIM", mapOf("success" to true)
                                )
                                _uiState.update { state -> state.copy(claimErrorMessage = null) }
                                onNavigateToVideoCall(roomId)
                            }
                            .onFailure { error ->
                                SecureLog.error("[DoctorDashboard] Cannot confirm in_call", error)
                                _uiState.update {
                                    it.copy(claimErrorMessage = "Consulta aceptada. Reintentá el ingreso a la videollamada.")
                                }
                            }
                    } else {
                        val reason = claim.message?.takeIf { it.isNotBlank() }
                            ?: "La consulta no está disponible o no tiene sala asignada."
                        _uiState.update {
                            it.copy(claimingPharmacyRequestId = null, claimErrorMessage = reason)
                        }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorDashboard] Error claiming pharmacy request", error)
                    _uiState.update {
                        it.copy(
                            claimingPharmacyRequestId = null,
                            claimErrorMessage = UiErrorMapper.map(error, "No se pudo aceptar la solicitud"),
                        )
                    }
                }
        }
    }

    fun retryAcceptedVideo(onNavigateToVideoCall: (String) -> Unit) {
        val requestId = _uiState.value.acceptedDispatchRequestId ?: return
        val roomId = _uiState.value.acceptedDispatchRoomId ?: return
        viewModelScope.launch {
            pharmacyDispatchRepository.updateDispatchRequestStatus(requestId, "in_call")
                .onSuccess {
                    _uiState.update { it.copy(claimErrorMessage = null) }
                    onNavigateToVideoCall(roomId)
                }
                .onFailure {
                    _uiState.update { state ->
                        state.copy(claimErrorMessage = "No se confirmó el ingreso. Volvé a intentarlo.")
                    }
                }
        }
    }

    private fun loadPharmacyDuty(doctorIdParam: String? = null) {
        val doctorId = doctorIdParam?.takeIf { it.isNotBlank() } ?: _uiState.value.doctorId
        if (doctorId.isBlank()) return

        viewModelScope.launch {
            val approval = pharmacyDispatchRepository.getMyGuardApproval().getOrNull()
            val authorized = approval?.approved == true
            _uiState.update { state ->
                state.copy(
                    guardApproved = authorized,
                    guardVerificationStatus = approval?.verificationStatus ?: "pending",
                )
            }
            pharmacyDispatchRepository.getDoctorDutyStatus(doctorId)
                .onSuccess { duty ->
                    _isOnDuty.value = duty.isOnDuty && authorized
                    _uiState.update { state ->
                        state.copy(
                            pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                                isOnDuty = duty.isOnDuty && authorized,
                                isLoading = false,
                            ),
                        )
                    }
                    if (duty.isOnDuty && authorized) {
                        startHeartbeat(doctorId)
                    } else {
                        stopHeartbeat()
                    }
                }
                .onFailure { error ->
                    SecureLog.warn("[DoctorDashboard] Failed loading pharmacy duty status: ${error.message}")
                }
        }
    }

    private fun observeChatSummary() {
        viewModelScope.launch {
            chatRepository.observeChats()
                .catch { error ->
                    SecureLog.error("[DoctorDashboard] Error observing chats", error)
                }
                .collect { chats ->
                    _uiState.update { state ->
                        state.copy(
                            unreadMessagesCount = chats.sumOf { it.unreadCount },
                            urgentChats = chats
                                .filter { it.isUrgent && it.status == ChatStatus.ACTIVE }
                                .sortedByDescending { it.lastMessageAt }
                                .take(3),
                        )
                    }
                }
        }
    }

    /**
     * Orders today's appointments by clinical priority ahead of future ones,
     * matching the agenda's scan path: in progress → upcoming (<=30 min) →
     * scheduled → everything else.
     */
    private fun prioritizeToday(appointments: List<Appointment>): List<Appointment> {
        val now = OffsetDateTime.now()
        return appointments.sortedWith { a, b ->
            val aBucket = appointmentUrgencyBucket(a, now)
            val bBucket = appointmentUrgencyBucket(b, now)
            if (aBucket != bBucket) aBucket - bBucket
            else a.startTime.compareTo(b.startTime)
        }
    }

    private fun appointmentUrgencyBucket(appointment: Appointment, now: OffsetDateTime): Int {
        val start = runCatching { OffsetDateTime.parse(appointment.startTime) }.getOrNull()
        val isToday = start?.toLocalDate() == now.toLocalDate()
        if (!isToday) return 9

        val isScheduled = appointment.status == AppointmentStatus.SCHEDULED ||
            appointment.status == AppointmentStatus.CONFIRMED
        return when {
            appointment.status == AppointmentStatus.IN_PROGRESS -> 0
            isScheduled && start?.isAfter(now.minusMinutes(30)) == true -> 1
            isScheduled -> 2
            appointment.status == AppointmentStatus.PAYMENT_PENDING -> 3
            isToday -> 4
            else -> 9
        }
    }

    private suspend fun resolveJoinableAppointmentIds(
        appointments: List<Appointment>,
    ): Pair<Set<String>, String?> {
        val candidates = appointments.filter { it.isTelemedicineJoinCandidate() }
        if (candidates.isEmpty()) return emptySet<String>() to null

        return telemedicineRepository.getJoinableAppointmentIds(candidates).fold(
            onSuccess = { ids -> ids to null },
            onFailure = { error ->
                SecureLog.error("[DoctorDashboard] Failed validating telemedicine sessions", error)
                emptySet<String>() to "No se pudo validar la sala de telemedicina."
            },
        )
    }

    override fun onCleared() {
        super.onCleared()
        stopHeartbeat()
        incomingOffersJob?.cancel()
        incomingOffersJob = null
    }
}
