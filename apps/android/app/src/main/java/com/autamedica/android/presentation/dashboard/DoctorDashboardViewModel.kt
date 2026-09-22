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
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.repository.PharmacyOnDemandRepository
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

data class DoctorDashboardUiState(
    val doctorProfile: DoctorProfile? = null,
    val stats: DoctorStats = DoctorStats(),
    val todayAppointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val unreadMessagesCount: Int = 0,
    val urgentChats: List<MedicalChat> = emptyList(),
    val recentPatients: List<PatientSummary> = emptyList(),
    val patientNames: Map<String, String> = emptyMap(),
    val patientsMap: Map<String, PatientSummary> = emptyMap(),
    val pharmacyOnDutyState: DoctorOnDutyPharmacyState = DoctorOnDutyPharmacyState(),
    val claimingPharmacyRequestId: String? = null,
    val claimErrorMessage: String? = null,
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
    private val pharmacyOnDemandRepository: PharmacyOnDemandRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorDashboardUiState())
    val uiState: StateFlow<DoctorDashboardUiState> = _uiState.asStateFlow()

    init {
        loadAll()
        observeChatSummary()
        observePharmacyDuty()
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
                loadPharmacyDuty()
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

    private var dispatchEngineJob: Job? = null

    private fun observePharmacyDuty() {
        viewModelScope.launch {
            pharmacyOnDemandRepository.observeOnDutyState().collect { state ->
                val mappedQueue = state.pendingRequests.map { it.toQueuedPatient() }
                _uiState.update {
                    it.copy(
                        pharmacyOnDutyState = state,
                        liveWaitingQueue = mappedQueue,
                    )
                }
                if (state.isOnDuty) {
                    startDispatchEngine()
                } else {
                    stopDispatchEngine()
                }
            }
        }
    }

    private fun startDispatchEngine() {
        if (dispatchEngineJob?.isActive == true) return
        dispatchEngineJob = viewModelScope.launch {
            // Initial breathing pause (2.5s) so the doctor sees the live dashboard status
            delay(2500L)

            while (isActive) {
                val currentState = _uiState.value
                if (!currentState.pharmacyOnDutyState.isOnDuty) break

                // Poll real pending queue from repository to keep in sync with database
                val pendingResult = pharmacyOnDemandRepository.getPendingQueue()
                val realPendingRequests = pendingResult.getOrNull()
                if (realPendingRequests != null) {
                    val mappedQueue = realPendingRequests.map { it.toQueuedPatient() }
                    _uiState.update { state ->
                        state.copy(
                            liveWaitingQueue = mappedQueue,
                            pharmacyOnDutyState = state.pharmacyOnDutyState.copy(
                                waitingQueueCount = realPendingRequests.size,
                                pendingRequests = realPendingRequests,
                            ),
                        )
                    }
                }

                // If no alert is currently shown to the doctor, offer the next eligible real patient
                val updatedState = _uiState.value
                if (updatedState.simulatedDispatchAlert == null) {
                    val realPending = updatedState.pharmacyOnDutyState.pendingRequests
                        .firstOrNull { it.id !in updatedState.dismissedRequestIds }

                    if (realPending != null) {
                        val dispatch = PharmacyDispatchRequest(
                            id = realPending.id,
                            patientDni = realPending.patientDni,
                            patientPhone = realPending.patientPhone,
                            patientName = realPending.patientName,
                            tierRequested = realPending.pharmacyName,
                            symptomSummary = realPending.reason,
                            status = realPending.status.name.lowercase(),
                            assignedDoctorId = realPending.doctorId,
                            cloudflareRoomId = realPending.roomId ?: realPending.id,
                            createdAt = realPending.createdAt?.toString() ?: "",
                        )
                        _uiState.update {
                            it.copy(
                                simulatedDispatchAlert = dispatch,
                                activelyDispatchedPatientId = realPending.id,
                            )
                        }
                    }
                }

                delay(5000L)
            }
        }
    }

    private fun stopDispatchEngine() {
        dispatchEngineJob?.cancel()
        dispatchEngineJob = null
        _uiState.update {
            it.copy(
                simulatedDispatchAlert = null,
                activelyDispatchedPatientId = null,
            )
        }
    }

    fun dismissDispatchAlert(requestId: String? = null) {
        val targetId = requestId ?: _uiState.value.simulatedDispatchAlert?.id
        _uiState.update { state ->
            state.copy(
                simulatedDispatchAlert = null,
                activelyDispatchedPatientId = null,
                dismissedRequestIds = if (targetId != null) state.dismissedRequestIds + targetId else state.dismissedRequestIds,
            )
        }
    }

    fun togglePharmacyOnDuty(onDuty: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(pharmacyOnDutyState = it.pharmacyOnDutyState.copy(isLoading = true)) }
            pharmacyOnDemandRepository.toggleOnDuty(onDuty)
                .onSuccess { state ->
                    _uiState.update { it.copy(pharmacyOnDutyState = state) }
                    if (state.isOnDuty) {
                        startDispatchEngine()
                    } else {
                        stopDispatchEngine()
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorDashboard] Error toggling pharmacy duty", error)
                    val fallback = _uiState.value.pharmacyOnDutyState.copy(
                        isOnDuty = onDuty,
                        isLoading = false,
                    )
                    _uiState.update { it.copy(pharmacyOnDutyState = fallback) }
                    if (onDuty) {
                        startDispatchEngine()
                    } else {
                        stopDispatchEngine()
                    }
                }
        }
    }

    fun claimPharmacyRequest(requestId: String, onNavigateToVideoCall: (String) -> Unit) {
        val traceId = "trace-" + java.util.UUID.randomUUID().toString().substring(0, 8)
        val alertRoomId = _uiState.value.simulatedDispatchAlert?.takeIf { it.id == requestId }?.cloudflareRoomId
            ?: _uiState.value.pharmacyOnDutyState.pendingRequests.firstOrNull { it.id == requestId }?.roomId
            ?: "room-$requestId"

        com.autamedica.android.telemetry.CallTelemetry.startTrace(traceId = traceId, roomId = alertRoomId)
        com.autamedica.android.telemetry.CallTelemetry.recordMilestone(traceId, "T0_TAP_INGRESAR")

        // 1. Optimistic UI transition: dismiss alert immediately and navigate on tick 0 (<5ms)
        _uiState.update { state ->
            state.copy(
                claimingPharmacyRequestId = null,
                simulatedDispatchAlert = null,
                activelyDispatchedPatientId = null,
                liveWaitingQueue = state.liveWaitingQueue.filter { it.id != requestId },
                claimErrorMessage = null,
            )
        }

        onNavigateToVideoCall(alertRoomId)

        val isSimulated = requestId.startsWith("sim-") || requestId.startsWith("q")
        if (isSimulated) {
            com.autamedica.android.telemetry.CallTelemetry.recordMilestone(traceId, "T1_BACKEND_CLAIM", mapOf("simulated" to true))
            return
        }

        // 2. Concurrently execute atomic DB claim in background without blocking video navigation
        viewModelScope.launch {
            pharmacyOnDemandRepository.claimRequest(requestId)
                .onSuccess { claim ->
                    com.autamedica.android.telemetry.CallTelemetry.recordMilestone(
                        traceId,
                        "T1_BACKEND_CLAIM",
                        mapOf("success" to true, "claimed_room" to claim.roomId)
                    )
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorDashboard] Error claiming pharmacy request in background", error)
                    com.autamedica.android.telemetry.CallTelemetry.recordMilestone(
                        traceId,
                        "T1_BACKEND_CLAIM",
                        mapOf("success" to false, "error" to (UiErrorMapper.map(error, "unknown")))
                    )
                    _uiState.update { it.copy(claimErrorMessage = UiErrorMapper.map(error, "No se pudo aceptar la solicitud")) }
                }
        }
    }

    private fun loadPharmacyDuty() {
        viewModelScope.launch {
            pharmacyOnDemandRepository.getOnDutyStatus()
                .onSuccess { state ->
                    val mappedQueue = state.pendingRequests.map { it.toQueuedPatient() }
                    _uiState.update {
                        it.copy(
                            pharmacyOnDutyState = state,
                            liveWaitingQueue = mappedQueue,
                        )
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
}
