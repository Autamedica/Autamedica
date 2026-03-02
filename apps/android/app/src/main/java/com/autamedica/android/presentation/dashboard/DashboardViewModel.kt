package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
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

data class DashboardUiState(
    val appointments: List<Appointment> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isRefreshing: Boolean = false,
    val userId: String = "",
    val userRole: String = "",
    val userName: String = "",
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadUserInfo()
        loadAppointments()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAppointments()
    }

    private fun loadUserInfo() {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: ""
        val userRole = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: ""
        _uiState.update { it.copy(userId = userId, userRole = userRole) }

        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                _uiState.update { state ->
                    state.copy(
                        userId = user.id,
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
                            error = sanitizeErrorMessage(error.message),
                        )
                    }
                }
        }
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
}
