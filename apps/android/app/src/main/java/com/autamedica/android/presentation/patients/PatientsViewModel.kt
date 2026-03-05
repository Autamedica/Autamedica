package com.autamedica.android.presentation.patients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PatientsUiState(
    val patients: List<PatientSummary> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isRefreshing: Boolean = false,
)

@HiltViewModel
class PatientsViewModel @Inject constructor(
    private val doctorRepository: DoctorRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientsUiState())
    val uiState: StateFlow<PatientsUiState> = _uiState.asStateFlow()

    init {
        loadPatients()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadPatients()
    }

    private fun loadPatients() {
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

            doctorRepository.getDoctorProfile(user.id).onSuccess { profile ->
                doctorRepository.getDoctorPatients(profile.id).onSuccess { patients ->
                    _uiState.update {
                        it.copy(
                            patients = patients,
                            isLoading = false,
                            isRefreshing = false,
                            error = null,
                        )
                    }
                }.onFailure { error ->
                    SecureLog.error("[Patients] Failed fetching patients", error)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = "Error al cargar pacientes",
                        )
                    }
                }
            }.onFailure { error ->
                SecureLog.error("[Patients] Failed fetching doctor profile", error)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = "No se pudo identificar al doctor",
                    )
                }
            }
        }
    }
}
