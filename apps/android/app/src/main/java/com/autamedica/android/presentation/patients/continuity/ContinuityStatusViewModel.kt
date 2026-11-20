package com.autamedica.android.presentation.patients.continuity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupCheckInEvolution
import com.autamedica.android.domain.model.FollowupStatus
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.FollowupRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.util.WhatsAppBridge
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class Medication(
    val name: String,
    val dose: String,
    val frequency: String = "Cada 24 horas (Mañana)",
    val daysRemaining: Int?,
    val isTakenToday: Boolean = false,
)

data class AssignedDoctorInfo(
    val name: String,
    val specialty: String,
    val licenseNumber: String,
)

data class ContinuityRequest(
    val id: String,
    val intent: String = "Continuidad de tratamiento farmacológico",
    val triageStatus: String, // "pending", "acknowledged", "in_progress", "resolved", "escalated"
    val riskOfInterruption: String = "moderate", // "low", "moderate", "critical"
    val medication: Medication?,
    val assignedDoctor: AssignedDoctorInfo? = null,
    val createdAt: String,
    val acknowledgedAt: String?,
    val inProgressAt: String? = null,
    val resolvedAt: String?,
    val resolutionDeadline: String?,
    val adherenceScore: Int = 86, // Score 0-100% a 30 días
    val dosesTakenInCycle: Int = 26,
    val totalDosesInCycle: Int = 30,
    val postConsultationCheckInState: String? = null, // "better", "stable", "worse"
    val isEscalatedAlertActive: Boolean = false,
)

data class ContinuityStatusUiState(
    val isLoading: Boolean = true,
    val request: ContinuityRequest? = null,
    val status: String = "none", // "active", "none", "resolved"
    val error: String? = null,
    val feedbackMessage: String? = null,
    val isSubmittingCheckIn: Boolean = false,
    val isRecordingDose: Boolean = false,
)

@HiltViewModel
class ContinuityStatusViewModel @Inject constructor(
    private val followupRepository: FollowupRepository,
    private val authRepository: AuthRepository,
    private val whatsAppBridge: WhatsAppBridge,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ContinuityStatusUiState())
    val uiState = _uiState.asStateFlow()

    init {
        fetchStatus()
    }

    fun fetchStatus() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val user = authRepository.observeSession().firstOrNull()
                if (user == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            status = "none",
                            request = null,
                            error = null,
                        )
                    }
                    return@launch
                }

                // 1. Check for pending 48h check-in first
                val pendingResult = followupRepository.getPendingCheckIn(user.id)
                val pendingFollowup = pendingResult.getOrNull()

                // 2. Fetch active followups history
                val activeResult = followupRepository.getActiveFollowupsForPatient(user.id)
                val activeFollowups = activeResult.getOrNull().orEmpty()

                val targetFollowup = pendingFollowup ?: activeFollowups.firstOrNull()

                if (targetFollowup != null) {
                    val isWorse = targetFollowup.response?.equals("worse", ignoreCase = true) == true
                    val triage = when {
                        isWorse -> "escalated"
                        targetFollowup.status == FollowupStatus.RESPONDED || targetFollowup.response != null -> "resolved"
                        targetFollowup.status == FollowupStatus.SENT -> "in_progress"
                        else -> "acknowledged"
                    }

                    val doctorName = targetFollowup.doctorName?.trim()?.ifBlank { null } ?: "Médico Tratante"
                    val request = ContinuityRequest(
                        id = targetFollowup.id,
                        intent = if (targetFollowup.eventType == "appointment.followup_48h") {
                            "Seguimiento clínico post-consulta 48h (Línea 4)"
                        } else {
                            targetFollowup.message
                        },
                        triageStatus = triage,
                        riskOfInterruption = "moderate",
                        medication = Medication(
                            name = targetFollowup.metadata?.get("medication_name").orEmpty(),
                            dose = targetFollowup.metadata?.get("medication_dose").orEmpty(),
                            frequency = targetFollowup.metadata?.get("medication_freq") ?: "Cada 24 horas (Mañana)",
                            daysRemaining = targetFollowup.metadata?.get("medication_days_remaining")?.toIntOrNull(),
                            isTakenToday = false,
                        ),
                        assignedDoctor = AssignedDoctorInfo(
                            name = doctorName,
                            specialty = "Telemedicina & Continuidad",
                            licenseNumber = "Matrícula SISA Verificada",
                        ),
                        createdAt = targetFollowup.scheduledFor,
                        acknowledgedAt = targetFollowup.sentAt,
                        inProgressAt = null,
                        resolvedAt = if (targetFollowup.response != null) targetFollowup.metadata?.get("responded_at") ?: targetFollowup.sentAt else null,
                        resolutionDeadline = targetFollowup.metadata?.get("resolution_deadline"),
                        adherenceScore = 0,
                        dosesTakenInCycle = 0,
                        totalDosesInCycle = 30,
                        postConsultationCheckInState = targetFollowup.response,
                        isEscalatedAlertActive = isWorse,
                    )

                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            status = if (targetFollowup.response != null || targetFollowup.status == FollowupStatus.RESPONDED) "resolved" else "active",
                            request = request,
                            error = null,
                        )
                    }
                    request.medication?.name?.takeIf(String::isNotBlank)?.let { fetchAdherence(user.id, it) }
                } else {
                    followupRepository.getContinuityCase(user.id)
                        .onSuccess { case ->
                            if (case == null) {
                                _uiState.update { it.copy(isLoading = false, status = "none", request = null, error = null) }
                            } else {
                                val medication = case.medicationName?.takeIf(String::isNotBlank)?.let { name ->
                                    Medication(name = name, dose = case.medicationDose.orEmpty(), daysRemaining = case.medicationDaysRemaining)
                                }
                                val request = ContinuityRequest(
                                    id = case.id,
                                    intent = case.caseIntent,
                                    triageStatus = case.triageStatus,
                                    riskOfInterruption = case.riskOfInterruption ?: "moderate",
                                    medication = medication,
                                    createdAt = case.createdAt,
                                    acknowledgedAt = case.acknowledgedAt,
                                    resolvedAt = case.resolvedAt,
                                    resolutionDeadline = case.resolutionDeadlineAt,
                                    adherenceScore = 0,
                                    dosesTakenInCycle = 0,
                                    totalDosesInCycle = 30,
                                )
                                _uiState.update {
                                    it.copy(
                                        isLoading = false,
                                        status = if (case.triageStatus == "resolved") "resolved" else "active",
                                        request = request,
                                        error = null,
                                    )
                                }
                                medication?.let { fetchAdherence(user.id, it.name) }
                            }
                        }
                        .onFailure { error ->
                            SecureLog.warn("[ContinuityStatusViewModel] continuity read stage=repository")
                            _uiState.update {
                                it.copy(isLoading = false, error = UiErrorMapper.map(error, "No se pudo cargar el estado de continuidad"))
                            }
                        }
                }
            } catch (e: Exception) {
                SecureLog.error("[ContinuityStatusViewModel] Failed to load status", e)
                _uiState.update { it.copy(isLoading = false, error = UiErrorMapper.map(e, "No se pudo cargar el estado de continuidad")) }
            }
        }
    }

    /**
     * Registra la toma diaria de medicación.
     * Actualiza el score de adherencia a 30 días con feedback inmediato.
     */
    private fun fetchAdherence(patientId: String, medicationName: String) {
        viewModelScope.launch {
            followupRepository.getMedicationAdherence(patientId, medicationName)
                .onSuccess { adherence ->
                    _uiState.update { state ->
                        val request = state.request ?: return@update state
                        val medication = request.medication ?: return@update state
                        if (medication.name != medicationName) return@update state
                        state.copy(
                            request = request.copy(
                                medication = medication.copy(isTakenToday = adherence.isTakenToday),
                                dosesTakenInCycle = adherence.dosesTakenInCycle,
                                totalDosesInCycle = adherence.totalDosesInCycle,
                                adherenceScore = adherence.score,
                            )
                        )
                    }
                }.onFailure {
                    SecureLog.warn("[ContinuityStatusViewModel] adherence read stage=medication_logs")
                }
        }
    }

    fun recordDoseToday() {
        val currentRequest = _uiState.value.request ?: return
        val currentMed = currentRequest.medication ?: return
        if (currentMed.isTakenToday || _uiState.value.isRecordingDose) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRecordingDose = true, error = null) }
            val user = authRepository.getCurrentUser()
            val result = if (user == null) Result.failure(IllegalStateException("authentication_required"))
                else followupRepository.recordMedicationDose(user.id, currentMed.name, currentMed.dose)
            result.onSuccess {
                _uiState.update { state ->
                    val request = state.request ?: return@update state.copy(isRecordingDose = false)
                    val next = (request.dosesTakenInCycle + 1).coerceAtMost(request.totalDosesInCycle)
                    val score = ((next.toDouble() / request.totalDosesInCycle.coerceAtLeast(1)) * 100).toInt()
                    state.copy(
                        isRecordingDose = false,
                        request = request.copy(
                            medication = request.medication?.copy(isTakenToday = true),
                            dosesTakenInCycle = next,
                            adherenceScore = score,
                        ),
                        feedbackMessage = "Toma registrada. Adherencia actualizada a $score%.",
                        error = null,
                    )
                }
            }.onFailure { error ->
                SecureLog.warn("[ContinuityStatusViewModel] dose write stage=medication_logs_insert")
                _uiState.update {
                    it.copy(isRecordingDose = false, error = UiErrorMapper.map(error, "No se pudo registrar la toma. Reintentá."))
                }
            }
        }
    }

    /**
     * Check-in de evolución post-consulta a 48 horas (Línea 4 AutaMedica).
     * Si el paciente indica "worse", se activa el protocolo de alerta clínica inmediata.
     * Persiste en Supabase a través de [FollowupRepository].
     */
    fun submitPostConsultationCheckIn(state: String) {
        val currentRequest = _uiState.value.request ?: return
        if (_uiState.value.isSubmittingCheckIn) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingCheckIn = true, error = null) }
            val normalizedKey = FollowupCheckInEvolution.fromValue(state)?.toKey()
                ?: state.trim().lowercase()
            if (normalizedKey !in setOf("better", "stable", "worse")) {
                _uiState.update { it.copy(isSubmittingCheckIn = false, error = "Seleccioná una evolución válida.") }
                return@launch
            }
            val isWorse = normalizedKey == "worse"
            followupRepository.submitCheckIn(
                followupId = currentRequest.id,
                evolution = normalizedKey,
                notes = if (isWorse) "Paciente reporta empeoramiento a las 48h" else null,
            ).onSuccess {
                val updated = currentRequest.copy(
                    postConsultationCheckInState = normalizedKey,
                    triageStatus = if (isWorse) "escalated" else "resolved",
                    isEscalatedAlertActive = isWorse,
                    resolvedAt = if (isWorse) null else java.time.Instant.now().toString(),
                )
                val feedback = when (normalizedKey) {
                    "better" -> "Tu reporte de mejoría quedó guardado en tu historia clínica."
                    "stable" -> "Evolución estable registrada."
                    else -> "Alerta clínica prioritaria registrada."
                }
                _uiState.update {
                    it.copy(
                        isSubmittingCheckIn = false,
                        request = updated,
                        status = if (isWorse) "active" else "resolved",
                        feedbackMessage = feedback,
                        error = null,
                    )
                }
            }.onFailure { error ->
                SecureLog.warn("[ContinuityStatusViewModel] check-in write stage=rpc")
                _uiState.update {
                    it.copy(isSubmittingCheckIn = false, error = UiErrorMapper.map(error, "No se pudo guardar tu evolución. Reintentá."))
                }
            }
        }
    }

    fun clearFeedbackMessage() {
        _uiState.update { it.copy(feedbackMessage = null) }
    }

    fun requestNewContinuity() {
        if (_uiState.value.isLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, feedbackMessage = null) }
            val user = authRepository.getCurrentUser()
            val result = if (user == null) Result.failure(IllegalStateException("authentication_required"))
                else followupRepository.requestContinuity(user.id)
            result.onSuccess { case ->
                val medication = case.medicationName?.takeIf(String::isNotBlank)?.let { name ->
                    Medication(name = name, dose = case.medicationDose.orEmpty(), daysRemaining = case.medicationDaysRemaining)
                }
                val request = ContinuityRequest(
                    id = case.id,
                    intent = case.caseIntent,
                    triageStatus = case.triageStatus,
                    riskOfInterruption = case.riskOfInterruption ?: "moderate",
                    medication = medication,
                    createdAt = case.createdAt,
                    acknowledgedAt = case.acknowledgedAt,
                    resolvedAt = case.resolvedAt,
                    resolutionDeadline = case.resolutionDeadlineAt,
                    adherenceScore = 0,
                    dosesTakenInCycle = 0,
                    totalDosesInCycle = 30,
                )
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        status = "active",
                        request = request,
                        feedbackMessage = "Tu solicitud de continuidad quedó registrada.",
                        error = null,
                    )
                }
                if (medication != null) fetchAdherence(user!!.id, medication.name)
            }.onFailure { error ->
                SecureLog.warn("[ContinuityStatusViewModel] continuity request stage=backend_update")
                _uiState.update {
                    it.copy(isLoading = false, error = UiErrorMapper.map(error, "No se pudo solicitar la continuidad. Reintentá."))
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    // ── WhatsApp & OpenClaw Bridge Helpers ──

    fun openWhatsAppTriage(phone: String? = null): Boolean {
        return whatsAppBridge.launchTriageChat(phone)
    }

    fun openWhatsAppSupport(phone: String? = null): Boolean {
        return whatsAppBridge.launchDoctorSupport(phone)
    }

    fun openWhatsAppFollowup(reply: String, phone: String? = null): Boolean {
        return whatsAppBridge.launchFollowupReply(reply, phone)
    }

    fun openWhatsAppAudioAnamnesis(phone: String? = null): Boolean {
        return whatsAppBridge.launchAudioAnamnesis(phone)
    }
}
