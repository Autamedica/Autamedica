package com.autamedica.android.presentation.patients

import androidx.lifecycle.SavedStateHandle
import com.autamedica.android.R
import com.autamedica.android.domain.model.InvalidPatientReferenceException
import com.autamedica.android.domain.model.PatientNotAssignedException
import com.autamedica.android.domain.model.PatientNotFoundOrUnauthorizedException
import java.io.IOException
import java.net.UnknownHostException
import kotlinx.coroutines.Job
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
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
    val joinableAppointmentIds: Set<String> = emptySet(),
    val isLoading: Boolean = true,
    val errorMessageRes: Int? = null,
    val telemedicineError: String? = null,
    val userId: String = "",
    val userName: String = "",
)

@HiltViewModel
class PatientDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val doctorRepository: DoctorRepository,
    private val authRepository: AuthRepository,
    private val telemedicineRepository: TelemedicineRepository,
) : ViewModel() {

    private val patientId: String = savedStateHandle["patientId"] ?: ""

    private val _uiState = MutableStateFlow(PatientDetailUiState())
    val uiState: StateFlow<PatientDetailUiState> = _uiState.asStateFlow()

    init {
        loadPatientDetail()
    }

    private var loadJob: Job? = null

    fun refresh() {
        loadPatientDetail()
    }

    private fun loadPatientDetail() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    patient = null,
                    joinableAppointmentIds = emptySet(),
                    isLoading = true,
                    errorMessageRes = null,
                    telemedicineError = null,
                )
            }

            if (patientId.isBlank()) {
                _uiState.update {
                    it.copy(isLoading = false, errorMessageRes = R.string.patient_detail_error_invalid_reference)
                }
                return@launch
            }

            val user = authRepository.getCurrentUser()
            if (user == null) {
                _uiState.update {
                    it.copy(isLoading = false, errorMessageRes = R.string.patient_detail_error_auth)
                }
                return@launch
            }
            _uiState.update { it.copy(userId = user.id) }

            val doctorProfile = doctorRepository.getDoctorProfile(user.id).getOrElse {
                _uiState.update {
                    it.copy(isLoading = false, errorMessageRes = R.string.patient_detail_error_auth)
                }
                return@launch
            }

            val detail = doctorRepository.getPatientDetail(
                doctorId = doctorProfile.id,
                patientId = patientId,
            ).getOrElse { error ->
                SecureLog.warn("[PatientDetail] Patient detail request failed")
                _uiState.update {
                    it.copy(isLoading = false, errorMessageRes = errorMessageResource(error))
                }
                return@launch
            }

            val (joinableIds, telemedicineError) = resolveJoinableAppointmentIds(detail.appointmentHistory)
            _uiState.update {
                it.copy(
                    patient = detail,
                    joinableAppointmentIds = joinableIds,
                    isLoading = false,
                    errorMessageRes = null,
                    telemedicineError = telemedicineError,
                    userName = "${detail.firstName} ${detail.lastName}".trim(),
                )
            }
        }
    }

    private fun errorMessageResource(error: Throwable): Int = when (error) {
        is InvalidPatientReferenceException -> R.string.patient_detail_error_invalid_reference
        is PatientNotAssignedException, is PatientNotFoundOrUnauthorizedException ->
            R.string.patient_detail_error_not_assigned
        is UnknownHostException, is IOException -> R.string.patient_detail_error_network
        else -> {
            val message = error.message.orEmpty().lowercase()
            if ("timeout" in message || "network" in message || "connection" in message) {
                R.string.patient_detail_error_network
            } else {
                R.string.patient_detail_error_generic
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
            onFailure = { error ->
                SecureLog.error("[PatientDetail] Failed validating telemedicine sessions", error)
                emptySet<String>() to "No se pudo validar la sala para este paciente."
            },
        )
    }
}
