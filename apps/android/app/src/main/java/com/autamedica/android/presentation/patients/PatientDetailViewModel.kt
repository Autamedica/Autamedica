package com.autamedica.android.presentation.patients

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.repository.DoctorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
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
    private val securePreferences: SecurePreferences,
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

            val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: ""
            _uiState.update { it.copy(userId = userId) }

            doctorRepository.getDoctorProfile(userId).onSuccess { profile ->
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
                    Timber.e(error, "[PatientDetail] Failed fetching patient detail")
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "No se pudo cargar la informacion del paciente",
                        )
                    }
                }
            }.onFailure { error ->
                Timber.e(error, "[PatientDetail] Failed fetching doctor profile")
                _uiState.update {
                    it.copy(isLoading = false, error = "Error de autenticacion")
                }
            }
        }
    }
}
