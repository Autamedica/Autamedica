package com.autamedica.android.presentation.patients

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.PatientDetail
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

data class PatientDetailUiState(
    val patient: PatientDetail? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val userId: String = "",
    val userName: String = "",
)

@HiltViewModel
class PatientDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val doctorRepository: DoctorRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val patientId: String = savedStateHandle["patientId"] ?: ""

    private val _uiState = MutableStateFlow(PatientDetailUiState())
    val uiState: StateFlow<PatientDetailUiState> = _uiState.asStateFlow()

    init {
        loadPatientDetail()
    }

    fun refresh() {
        loadPatientDetail()
    }

    private fun loadPatientDetail() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val user = authRepository.getCurrentUser()
            if (user == null) {
                _uiState.update { it.copy(isLoading = false, error = "Error de autenticacion") }
                return@launch
            }
            _uiState.update { it.copy(userId = user.id) }

            doctorRepository.getDoctorProfile(user.id).onSuccess { profile ->
                doctorRepository.getPatientDetail(
                    doctorId = profile.id,
                    patientId = patientId,
                ).onSuccess { detail ->
                    _uiState.update {
                        it.copy(
                            patient = detail,
                            isLoading = false,
                            userName = "${detail.firstName} ${detail.lastName}".trim(),
                        )
                    }
                }.onFailure { error ->
                    SecureLog.error("[PatientDetail] Failed fetching patient detail", error)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "No se pudo cargar la informacion del paciente",
                        )
                    }
                }
            }.onFailure { error ->
                SecureLog.error("[PatientDetail] Failed fetching doctor profile", error)
                _uiState.update {
                    it.copy(isLoading = false, error = "Error de autenticacion")
                }
            }
        }
    }
}
