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
    val guardCareCountry: String? = null,
    // A failed RPC must never be presented as an actual rejected/pending approval.
    val approvalCheckFailed: Boolean = false,
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

    private var loadJob: Job? = null
    private var chatSummaryJob: Job? = null
    private var claimJob: Job? = null
    private var retryCallJob: Job? = null
    private var dutyToggleJob: Job? = null
    private var authorizationVersion = 0L

    init {
        loadAll()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAll()
    }

    private fun loadAll() {
        // Revoke cached clinical state before any refresh or account transition.
        // Never retain patient data or incoming offers while approval is unknown.
        authorizationVersion++
        loadJob?.cancel()
        claimJob?.cancel()
        claimJob = null
        retryCallJob?.cancel()
        retryCallJob = null
        dutyToggleJob?.cancel()
        dutyToggleJob = null
        stopHeartbeat()
        _dismissedRequestIds.value = emptySet()
        incomingOffersJob?.cancel()
        incomingOffersJob = null
        chatSummaryJob?.cancel()
        chatSummaryJob = null
        _isOnDuty.value = false
        _uiState.update { state ->
            state.copy(
                doctorProfile = null,
                doctorId = "",
                stats = DoctorStats(),
                statsAvailable = false,
                todayAppointments = emptyList(),
                joinableAppointmentIds = emptySet(),
                unreadMessagesCount = 0,
                urgentChats = emptyList(),
                recentPatients = emptyList(),
                patientNames = emptyMap(),
                patientsMap = emptyMap(),
                pharmacyOnDutyState = DoctorOnDutyPharmacyState(),
                guardApproved = null,
                guardVerificationStatus = null,
                guardCareCountry = null,
                approvalCheckFailed = false,
                claimingPharmacyRequestId = null,
                claimErrorMessage = null,
                acceptedDispatchRequestId = null,
                acceptedDispatchRoomId = null,
                dismissedRequestIds = emptySet(),
                simulatedDispatchAlert = null,
                activelyDispatchedPatientId = null,
                liveWaitingQueue = emptyList(),
                isLoading = true,
                userId = "",
                userName = "",
                error = null,
                telemedicineError = null,
            )
        }
        val loadVersion = authorizationVersion
        loadJob = viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (loadVersion != authorizationVersion) return@launch
            if (user == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        approvalCheckFailed = true,
                        error = "No se pudo verificar la sesión médica.",
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

            val profileResult = doctorRepository.getDoctorProfile(user.id)
            if (loadVersion != authorizationVersion) return@launch
            profileResult.onSuccess { profile ->
                _uiState.update { it.copy(doctorProfile = profile, doctorId = profile.id) }

                // Guard eligibility is server-authoritative, including country and licence.
                // Check BEFORE any stats, patient, appointment, chat or offer read.
                val approvalResult = pharmacyDispatchRepository.getMyGuardApproval()
                if (loadVersion != authorizationVersion) return@onSuccess
                val approval = approvalResult.getOrNull()
                if (approval == null) {
                    approvalResult.exceptionOrNull()?.let {
                        SecureLog.error("[DoctorDashboard] Approval verification failed", it)
                    }
                    _uiState.update {
                        it.copy(
                            guardApproved = null,
                            approvalCheckFailed = true,
                            isLoading = false,
                            isRefreshing = false,
                            error = "No se pudo comprobar la habilitación médica.",
                        )
                    }
                    return@onSuccess
                }
                _uiState.update {
                    it.copy(
                        guardApproved = approval.approved,
                        guardVerificationStatus = approval.verificationStatus,
                        guardCareCountry = approval.country,
                        approvalCheckFailed = false,
                    )
                }
                if (!approval.approved) {
                    _uiState.update {
                        it.copy(isLoading = false, isRefreshing = false, error = null)
                    }
                    return@onSuccess
                }

                // Load stats, appointments and patients in parallel
                val statsDeferred = async { doctorRepository.getDoctorStats(profile.id) }
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }
                val patientsDeferred = async { doctorRepository.getDoctorPatients(profile.id) }

                val stats = statsDeferred.await()
                val appointments = appointmentsDeferred.await()
                val patients = patientsDeferred.await()
                if (loadVersion != authorizationVersion) return@onSuccess
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
                if (loadVersion != authorizationVersion) return@onSuccess

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
                // Only an explicitly approved doctor can subscribe to clinical data.
                observeChatSummary()
                observeIncomingOffers()
                loadPharmacyDuty(profile.id)
            }.onFailure { error ->
                if (loadVersion != authorizationVersion) return@onFailure
                SecureLog.error("[DoctorDashboard] Failed loading doctor profile", error)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        approvalCheckFailed = true,
                        error = "No se pudo cargar el perfil del médico.",
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
                if (_uiState.value.guardApproved != true) return@collect
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

        val permissionVersion = authorizationVersion
        dutyToggleJob?.cancel()
        dutyToggleJob = viewModelScope.launch {
            _uiState.update { it.copy(pharmacyOnDutyState = it.pharmacyOnDutyState.copy(isLoading = true)) }
            if (onDuty) {
                val approvalResult = pharmacyDispatchRepository.getMyGuardApproval()
                if (permissionVersion != authorizationVersion || _uiState.value.doctorId != doctorId) return@launch
                val approval = approvalResult.getOrNull()
                if (approval?.approved != true) {
                    stopHeartbeat()
                    _isOnDuty.value = false
                    _uiState.update { state ->
                        state.copy(
                            guardApproved = if (approval == null) null else false,
                            guardVerificationStatus = approval?.verificationStatus,
                            guardCareCountry = approval?.country,
                            approvalCheckFailed = approval == null,
                            pharmacyOnDutyState = state.pharmacyOnDutyState.copy(isOnDuty = false, isLoading = false),
                            error = if (approval == null)
                                "No se pudo comprobar la habilitación médica."
                            else
                                "La guardia necesita aprobación administrativa de la matrícula.",
                        )
                    }
                    return@launch
                }
                _uiState.update { it.copy(guardApproved = true, guardVerificationStatus = approval.verificationStatus, guardCareCountry = approval.country, approvalCheckFailed = false) }
            }
            pharmacyDispatchRepository.setDoctorDutyStatus(
                doctorId = doctorId,
                isOnDuty = onDuty,
                activeTiers = listOf("general"),
            ).onSuccess {
                if (permissionVersion != authorizationVersion || _uiState.value.guardApproved != true ||
                    _uiState.value.doctorId != doctorId) return@onSuccess
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
                if (permissionVersion != authorizationVersion) return@onFailure
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
        if (_uiState.value.guardApproved != true || !_uiState.value.pharmacyOnDutyState.isOnDuty
            || incoming?.id != requestId || incoming.offerId.isNullOrBlank()) {
            _uiState.update { it.copy(claimErrorMessage = "La oferta no está vigente. Revisá el radar.") }
            return
        }

        val traceId = "trace-" + java.util.UUID.randomUUID().toString().substring(0, 8)
        com.autamedica.android.telemetry.CallTelemetry.recordMilestone(traceId, "T0_TAP_INGRESAR")
        _uiState.update { it.copy(claimingPharmacyRequestId = requestId, claimErrorMessage = null) }

        // Claim atomically first. Never open a call for unconfirmed/synthetic offers.
        val permissionVersion = authorizationVersion
        claimJob?.cancel()
        claimJob = viewModelScope.launch {
            pharmacyDispatchRepository.claimPharmacyRequest(requestId, doctorId)
                .onSuccess { claim ->
                    if (permissionVersion != authorizationVersion || _uiState.value.guardApproved != true ||
                        _uiState.value.doctorId != doctorId) return@onSuccess
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
                            .onSuccess confirmedCall@{
                                if (permissionVersion != authorizationVersion || _uiState.value.guardApproved != true ||
                                    _uiState.value.doctorId != doctorId) return@confirmedCall
                                com.autamedica.android.telemetry.CallTelemetry.recordMilestone(
                                    traceId, "T1_BACKEND_CLAIM", mapOf("success" to true)
                                )
                                _uiState.update { state -> state.copy(claimErrorMessage = null) }
                                onNavigateToVideoCall(roomId)
                            }
                            .onFailure { error ->
                                if (permissionVersion != authorizationVersion) return@onFailure
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
                    if (permissionVersion != authorizationVersion) return@onFailure
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
        if (_uiState.value.guardApproved != true) return
        val requestId = _uiState.value.acceptedDispatchRequestId ?: return
        val roomId = _uiState.value.acceptedDispatchRoomId ?: return
        val permissionVersion = authorizationVersion
        retryCallJob?.cancel()
        retryCallJob = viewModelScope.launch {
            pharmacyDispatchRepository.updateDispatchRequestStatus(requestId, "in_call")
                .onSuccess {
                    if (permissionVersion != authorizationVersion || _uiState.value.guardApproved != true ||
                        _uiState.value.acceptedDispatchRequestId != requestId) return@onSuccess
                    _uiState.update { it.copy(claimErrorMessage = null) }
                    onNavigateToVideoCall(roomId)
                }
                .onFailure {
                    if (permissionVersion != authorizationVersion) return@onFailure
                    _uiState.update { state ->
                        state.copy(claimErrorMessage = "No se confirmó el ingreso. Volvé a intentarlo.")
                    }
                }
        }
    }

    private fun loadPharmacyDuty(doctorIdParam: String? = null) {
        val doctorId = doctorIdParam?.takeIf { it.isNotBlank() } ?: _uiState.value.doctorId
        if (doctorId.isBlank() || _uiState.value.guardApproved != true) return

        viewModelScope.launch {
            pharmacyDispatchRepository.getDoctorDutyStatus(doctorId)
                .onSuccess { duty ->
                    // Refresh or account changes may have revoked access while awaiting I/O.
                    if (_uiState.value.guardApproved != true || _uiState.value.doctorId != doctorId) return@onSuccess
                    _isOnDuty.value = duty.isOnDuty
                    _uiState.update { state ->
                        state.copy(
                            pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                                isOnDuty = duty.isOnDuty,
                                isLoading = false,
                            ),
                        )
                    }
                    if (duty.isOnDuty) startHeartbeat(doctorId) else stopHeartbeat()
                }
                .onFailure { error ->
                    SecureLog.warn("[DoctorDashboard] Failed loading pharmacy duty status: ${error.message}")
                }
        }
    }

    private fun observeChatSummary() {
        chatSummaryJob?.cancel()
        chatSummaryJob = viewModelScope.launch {
            chatRepository.observeChats()
                .catch { error ->
                    SecureLog.error("[DoctorDashboard] Error observing chats", error)
                }
                .collect { chats ->
                    if (_uiState.value.guardApproved != true) return@collect
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
