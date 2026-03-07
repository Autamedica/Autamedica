package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val telemedicineError: String? = null,
    val preventiveError: String? = null,
    val isRefreshing: Boolean = false,
    val userId: String = "",
    val userRole: String = "patient",
    val userName: String = "",
    val anamnesisSummary: AnamnesisSummary? = null,
    val preventiveProfile: PatientPreventiveProfile? = null,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val healthRepository: HealthRepository,
    private val telemedicineRepository: TelemedicineRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadUserInfo()
        refreshData(initialLoad = true)
    }

    fun refresh() {
        refreshData(initialLoad = false)
    }

    private fun loadUserInfo() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                _uiState.update { state ->
                    state.copy(
                        userId = user.id,
                        userRole = user.role.wireName,
                        userName = listOfNotNull(user.firstName, user.lastName)
                            .joinToString(" ")
                            .ifBlank { user.email },
                    )
                }
            }
        }
    }

    private fun refreshData(initialLoad: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = if (initialLoad) true else it.isLoading,
                    isRefreshing = !initialLoad,
                    error = null,
                    telemedicineError = null,
                    preventiveError = null,
                )
            }

            coroutineScope {
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }
                val anamnesisDeferred = async { healthRepository.getAnamnesisSummary() }
                val preventiveDeferred = async { healthRepository.getPreventiveProfile() }

                val appointmentsResult = appointmentsDeferred.await()
                val anamnesisResult = anamnesisDeferred.await()
                val preventiveResult = preventiveDeferred.await()

                val appointments = appointmentsResult.getOrNull()
                val resolvedAppointments = appointments ?: _uiState.value.appointments
                val joinableResult = if (appointments != null) {
                    resolveJoinableAppointmentIds(appointments)
                } else {
                    _uiState.value.joinableAppointmentIds to _uiState.value.telemedicineError
                }

                _uiState.update { current ->
                    current.copy(
                        appointments = resolvedAppointments,
                        joinableAppointmentIds = joinableResult.first,
                        isLoading = false,
                        isRefreshing = false,
                        error = appointmentsResult.exceptionOrNull()?.let { sanitizeErrorMessage(it.message) },
                        telemedicineError = joinableResult.second,
                        preventiveError = preventiveResult.exceptionOrNull()?.let { sanitizePreventiveError(it.message) },
                        anamnesisSummary = anamnesisResult.getOrNull() ?: current.anamnesisSummary,
                        preventiveProfile = preventiveResult.getOrNull() ?: current.preventiveProfile,
                    )
                }
            }
        }
    }

    private suspend fun resolveJoinableAppointmentIds(
        appointments: List<Appointment>,
    ): Pair<Set<String>, String?> {
        val candidates = appointments.filter { it.isTelemedicineJoinCandidate() }
        if (candidates.isEmpty()) return emptySet<String>() to null

        return telemedicineRepository.getJoinableAppointmentIds(candidates).fold(
            onSuccess = { ids -> ids to null },
            onFailure = { error -> emptySet<String>() to sanitizeTelemedicineError(error.message) },
        )
    }

    private fun sanitizeErrorMessage(raw: String?): String {
        if (raw == null) return "Error al cargar consultas"
        return when {
            "infinite recursion" in raw -> "Error temporal del servidor. Intenta de nuevo."
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "Error de conexion. Verifica tu internet."
            "unauthorized" in raw.lowercase() || "JWT" in raw ->
                "Sesion expirada. Inicia sesion nuevamente."
            raw.contains("URL:") || raw.contains("Headers:") -> "Error al cargar consultas"
            else -> raw.lineSequence().firstOrNull()?.take(120) ?: raw.take(120)
        }
    }

    private fun sanitizeTelemedicineError(raw: String?): String {
        if (raw == null) return "No se pudo validar la sala de telemedicina."
        return when {
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "No se pudo validar la sala por un problema de conexion."
            "forbidden" in raw.lowercase() || "unauthorized" in raw.lowercase() ->
                "La sesion de telemedicina requiere validar nuevamente tus permisos."
            else -> "No se pudo confirmar la sala de telemedicina."
        }
    }

    private fun sanitizePreventiveError(raw: String?): String {
        if (raw == null) return "No se pudo cargar tu perfil preventivo."
        return when {
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "No se pudo conectar el perfil preventivo por un problema de red."
            "unauthorized" in raw.lowercase() || "jwt" in raw.lowercase() ->
                "La sesion expiro antes de cargar tu perfil preventivo."
            else -> "No pudimos actualizar tu informacion preventiva por ahora."
        }
    }
}
