package com.autamedica.android.presentation.patients

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.ClinicalNoteEntry
import com.autamedica.android.domain.model.ClinicalWorkspaceLogic
import com.autamedica.android.domain.model.CreateClinicalNoteRequest
import com.autamedica.android.domain.model.CreateFollowupRequest
import com.autamedica.android.domain.model.CreateVitalSignRequest
import com.autamedica.android.domain.model.InvalidPatientReferenceException
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientFollowupEntry
import com.autamedica.android.domain.model.PatientNotAssignedException
import com.autamedica.android.domain.model.PatientNotFoundOrUnauthorizedException
import com.autamedica.android.domain.model.PatientPrescriptionRenewalItem
import com.autamedica.android.domain.model.VitalSignAlert
import com.autamedica.android.domain.model.VitalSignEntry
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorPatientWorkspaceRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.health.isPortugueseRuntime
import com.autamedica.android.presentation.health.localizedCopy
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.UnknownHostException
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class PatientDetailUiState(
    val patient: PatientDetail? = null,
    val joinableAppointmentIds: Set<String> = emptySet(),
    val clinicalNotes: List<ClinicalNoteEntry> = emptyList(),
    val vitals: List<VitalSignEntry> = emptyList(),
    val vitalAlerts: List<VitalSignAlert> = emptyList(),
    val followups: List<PatientFollowupEntry> = emptyList(),
    val prescriptions: List<PatientPrescriptionRenewalItem> = emptyList(),
    val isWorkspaceLoading: Boolean = false,
    val isSubmittingAction: Boolean = false,
    val workspaceActionMessage: String? = null,
    val workspaceActionError: String? = null,
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
    private val workspaceRepository: DoctorPatientWorkspaceRepository,
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

    fun clearFeedback() {
        _uiState.update { it.copy(workspaceActionMessage = null, workspaceActionError = null) }
    }

    fun saveClinicalNote(
        title: String,
        kind: String,
        summary: String,
        diagnosis: String?,
        onSaved: () -> Unit = {},
    ) {
        if (patientId.isBlank()) return
        viewModelScope.launch {
            val isPt = isPortugueseRuntime()
            _uiState.update { it.copy(isSubmittingAction = true, workspaceActionError = null) }
            workspaceRepository.createClinicalNote(
                CreateClinicalNoteRequest(
                    patientId = patientId,
                    title = title,
                    kind = kind,
                    summary = summary,
                    diagnosis = diagnosis,
                ),
            ).onSuccess { created ->
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        clinicalNotes = listOf(created) + it.clinicalNotes,
                        workspaceActionMessage = localizedCopy("Evolución guardada", "Evolução salva", isPt),
                    )
                }
                onSaved()
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        workspaceActionError = err.message ?: localizedCopy("No se pudo guardar la evolución", "Não foi possível salvar a evolução", isPt),
                    )
                }
            }
        }
    }

    fun recordVitals(
        systolic: Int?,
        diastolic: Int?,
        heartRate: Int?,
        oxygenSaturation: Int?,
        temperature: Double?,
        weight: Double?,
        height: Int?,
        painScale: Int?,
        notes: String?,
        onSaved: () -> Unit = {},
    ) {
        if (patientId.isBlank()) return
        viewModelScope.launch {
            val isPt = isPortugueseRuntime()
            _uiState.update { it.copy(isSubmittingAction = true, workspaceActionError = null) }
            workspaceRepository.recordVitals(
                CreateVitalSignRequest(
                    patientId = patientId,
                    bloodPressureSystolic = systolic,
                    bloodPressureDiastolic = diastolic,
                    heartRate = heartRate,
                    temperature = temperature,
                    oxygenSaturation = oxygenSaturation,
                    weight = weight,
                    height = height,
                    painScale = painScale,
                    notes = notes,
                ),
            ).onSuccess { payload ->
                val merged = payload.vitals + _uiState.value.vitals
                val latestAlerts = payload.alerts.ifEmpty {
                    merged.firstOrNull()?.let(ClinicalWorkspaceLogic::computeVitalAlerts).orEmpty()
                }
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        vitals = merged,
                        vitalAlerts = latestAlerts,
                        workspaceActionMessage = localizedCopy("Signos vitales registrados", "Sinais vitais registrados", isPt),
                    )
                }
                onSaved()
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        workspaceActionError = err.message ?: localizedCopy("No se pudieron guardar los signos", "Não foi possível salvar os sinais", isPt),
                    )
                }
            }
        }
    }

    fun createFollowup(
        daysAhead: Long,
        objective: String,
        channel: String,
        onSaved: () -> Unit = {},
    ) {
        if (patientId.isBlank()) return
        viewModelScope.launch {
            val isPt = isPortugueseRuntime()
            _uiState.update { it.copy(isSubmittingAction = true, workspaceActionError = null) }
            val scheduledFor = OffsetDateTime.now(ZoneOffset.UTC)
                .plusDays(daysAhead)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            workspaceRepository.createFollowup(
                CreateFollowupRequest(
                    patientId = patientId,
                    scheduledFor = scheduledFor,
                    objective = objective,
                    channel = channel,
                ),
            ).onSuccess { created ->
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        followups = listOf(created) + it.followups,
                        workspaceActionMessage = localizedCopy("Seguimiento programado", "Acompanhamento agendado", isPt),
                    )
                }
                onSaved()
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        isSubmittingAction = false,
                        workspaceActionError = err.message ?: localizedCopy("No se pudo programar el seguimiento", "Não foi possível agendar o acompanhamento", isPt),
                    )
                }
            }
        }
    }

    fun updateFollowup(followupId: String, action: String) {
        if (patientId.isBlank()) return
        viewModelScope.launch {
            workspaceRepository.updateFollowup(patientId, followupId, action).onSuccess { updated ->
                _uiState.update { state ->
                    state.copy(
                        followups = state.followups.map { if (it.id == updated.id) updated else it },
                    )
                }
            }
        }
    }

    private fun loadPatientDetail() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    patient = null,
                    joinableAppointmentIds = emptySet(),
                    isLoading = true,
                    isWorkspaceLoading = true,
                    errorMessageRes = null,
                    telemedicineError = null,
                )
            }

            if (patientId.isBlank()) {
                _uiState.update {
                    it.copy(isLoading = false, isWorkspaceLoading = false, errorMessageRes = R.string.patient_detail_error_invalid_reference)
                }
                return@launch
            }

            val user = authRepository.getCurrentUser()
            if (user == null) {
                _uiState.update {
                    it.copy(isLoading = false, isWorkspaceLoading = false, errorMessageRes = R.string.patient_detail_error_auth)
                }
                return@launch
            }
            _uiState.update { it.copy(userId = user.id) }

            val doctorProfile = doctorRepository.getDoctorProfile(user.id).getOrElse {
                _uiState.update {
                    it.copy(isLoading = false, isWorkspaceLoading = false, errorMessageRes = R.string.patient_detail_error_auth)
                }
                return@launch
            }

            val detailResult = doctorRepository.getPatientDetail(
                doctorId = doctorProfile.id,
                patientId = patientId,
            )

            val detail = detailResult.getOrElse { error ->
                if (error is PatientNotAssignedException || error is PatientNotFoundOrUnauthorizedException) {
                    val external = workspaceRepository.getExternalPatients()
                        .getOrDefault(emptyList())
                        .firstOrNull { it.patientId == patientId }
                    if (external != null) {
                        val parts = external.fullName.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
                        PatientDetail(
                            id = external.patientId,
                            userId = "",
                            firstName = parts.firstOrNull().orEmpty(),
                            lastName = if (parts.size > 1) parts.drop(1).joinToString(" ") else "",
                            email = external.contact?.takeIf { "@" in it },
                            phone = external.contact?.takeIf { "@" !in it },
                            birthDate = external.birthDate,
                            gender = external.gender,
                        )
                    } else {
                        SecureLog.warn("[PatientDetail] Patient detail request failed")
                        _uiState.update {
                            it.copy(isLoading = false, isWorkspaceLoading = false, errorMessageRes = errorMessageResource(error))
                        }
                        return@launch
                    }
                } else {
                    SecureLog.warn("[PatientDetail] Patient detail request failed")
                    _uiState.update {
                        it.copy(isLoading = false, isWorkspaceLoading = false, errorMessageRes = errorMessageResource(error))
                    }
                    return@launch
                }
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

            // Load longitudinal clinical workspace (notes, vitals, follow-ups, prescriptions) in parallel
            val notesDeferred = async { workspaceRepository.getClinicalNotes(patientId) }
            val vitalsDeferred = async { workspaceRepository.getVitals(patientId) }
            val followupsDeferred = async { workspaceRepository.getFollowups(patientId) }
            val rxDeferred = async { workspaceRepository.getPatientPrescriptions(patientId) }

            val notes = notesDeferred.await().getOrDefault(emptyList())
            val vitalsPayload = vitalsDeferred.await().getOrNull()
            val vitalsList = vitalsPayload?.vitals.orEmpty()
            val alertsList = vitalsPayload?.alerts.orEmpty().ifEmpty {
                vitalsList.firstOrNull()?.let(ClinicalWorkspaceLogic::computeVitalAlerts).orEmpty()
            }
            val followups = followupsDeferred.await().getOrDefault(emptyList())
            val prescriptions = rxDeferred.await().getOrDefault(emptyList())

            _uiState.update {
                it.copy(
                    clinicalNotes = notes,
                    vitals = vitalsList,
                    vitalAlerts = alertsList,
                    followups = followups,
                    prescriptions = prescriptions,
                    isWorkspaceLoading = false,
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
