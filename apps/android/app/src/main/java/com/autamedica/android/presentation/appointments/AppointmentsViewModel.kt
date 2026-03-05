package com.autamedica.android.presentation.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AppointmentsUiState(
    val appointments: List<Appointment> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isRefreshing: Boolean = false,
    val userId: String = "",
    val userRole: String = "patient",
    val userName: String = "",
)

@HiltViewModel
class AppointmentsViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppointmentsUiState())
    val uiState: StateFlow<AppointmentsUiState> = _uiState.asStateFlow()

    init {
        loadUserInfo()
        loadAppointments()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAppointments()
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

    private fun loadAppointments() {
        viewModelScope.launch {
            appointmentRepository.getUpcomingAppointments()
                .onSuccess { appointments ->
                    _uiState.update {
                        it.copy(
                            appointments = appointments,
                            isLoading = false,
                            isRefreshing = false,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = sanitizeError(error.message),
                        )
                    }
                }
        }
    }

    private fun sanitizeError(raw: String?): String {
        if (raw == null) return "Error al cargar turnos"
        return when {
            "infinite recursion" in raw -> "Error temporal del servidor"
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "Error de conexion"
            "unauthorized" in raw.lowercase() || "JWT" in raw ->
                "Sesion expirada"
            raw.contains("URL:") || raw.contains("Headers:") -> "Error al cargar turnos"
            else -> raw.lineSequence().firstOrNull()?.take(100) ?: raw.take(100)
        }
    }
}
