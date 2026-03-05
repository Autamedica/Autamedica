package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class DoctorDashboardUiState(
    val doctorProfile: DoctorProfile? = null,
    val stats: DoctorStats = DoctorStats(),
    val todayAppointments: List<Appointment> = emptyList(),
    val recentPatients: List<PatientSummary> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val userId: String = "",
    val userName: String = "",
    val doctorId: String = "",
)

@HiltViewModel
class DoctorDashboardViewModel @Inject constructor(
    private val doctorRepository: DoctorRepository,
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorDashboardUiState())
    val uiState: StateFlow<DoctorDashboardUiState> = _uiState.asStateFlow()

    init {
        loadAll()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAll()
    }

    private fun loadAll() {
        viewModelScope.launch {
            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: ""
            _uiState.update { it.copy(userId = userId) }

            // Load user name
            val user = authRepository.getCurrentUser()
            if (user != null) {
                _uiState.update { state ->
                    state.copy(
                        userName = listOfNotNull(user.firstName, user.lastName)
                            .joinToString(" ")
                            .ifBlank { user.email },
                    )
                }
            }

            // Load doctor profile to get doctor record ID
            val profileResult = doctorRepository.getDoctorProfile(userId)
            profileResult.onSuccess { profile ->
                _uiState.update { it.copy(doctorProfile = profile, doctorId = profile.id) }

                // Load stats, appointments, and patients in parallel
                val statsDeferred = async { doctorRepository.getDoctorStats(profile.id) }
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }
                val patientsDeferred = async { doctorRepository.getDoctorPatients(profile.id) }

                val stats = statsDeferred.await()
                val appointments = appointmentsDeferred.await()
                val patients = patientsDeferred.await()

                _uiState.update { state ->
                    state.copy(
                        stats = stats.getOrDefault(DoctorStats()),
                        todayAppointments = appointments.getOrDefault(emptyList()),
                        recentPatients = patients.getOrDefault(emptyList()).take(5),
                        isLoading = false,
                        isRefreshing = false,
                        error = null,
                    )
                }
            }.onFailure { error ->
                Timber.e(error, "[DoctorDashboard] Failed loading doctor profile")
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
}
