package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.ChatStatus
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import javax.inject.Inject

data class DoctorDashboardUiState(
    val doctorProfile: DoctorProfile? = null,
    val stats: DoctorStats = DoctorStats(),
    val todayAppointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val unreadMessagesCount: Int = 0,
    val urgentChats: List<MedicalChat> = emptyList(),
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
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorDashboardUiState())
    val uiState: StateFlow<DoctorDashboardUiState> = _uiState.asStateFlow()

    init {
        loadAll()
        observeChatSummary()
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

                // Load stats and appointments in parallel
                val statsDeferred = async { doctorRepository.getDoctorStats(profile.id) }
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }

                val stats = statsDeferred.await()
                val appointments = appointmentsDeferred.await()
                val allAppointments = appointments.getOrDefault(emptyList())
                val joinableResult = resolveJoinableAppointmentIds(allAppointments)

                _uiState.update { state ->
                    state.copy(
                        stats = stats.getOrDefault(DoctorStats()),
                        todayAppointments = prioritizeToday(allAppointments),
                        joinableAppointmentIds = joinableResult.first,
                        isLoading = false,
                        isRefreshing = false,
                        error = null,
                        telemedicineError = joinableResult.second,
                    )
                }
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
