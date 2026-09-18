package com.autamedica.android.presentation.consultation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.repository.PatientClinicData
import com.autamedica.android.data.repository.PatientClinicStore
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.FollowupCheckInEvolution
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.FollowupRepository
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.domain.repository.MedicalOrderRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.domain.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class ConsultationHubViewModel @Inject constructor(
    private val clinicStore: PatientClinicStore,
    private val appointmentRepository: AppointmentRepository,
    private val healthRepository: HealthRepository,
    private val prescriptionRepository: PrescriptionRepository,
    private val medicalOrderRepository: MedicalOrderRepository,
    private val followupRepository: FollowupRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultationHubUiState())
    val uiState: StateFlow<ConsultationHubUiState> = _uiState.asStateFlow()

    private var paymentPollingJob: Job? = null

    init {
        // 1. Observar en tiempo real la fuente de citas y médicos de guardia
        viewModelScope.launch {
            clinicStore.data.collect { data ->
                _uiState.update { current ->
                    current.copy(
                        joinableAppointmentIds = data.joinableAppointmentIds,
                        availableDoctors = data.availableDoctors,
                        globalError = data.error,
                        isRefreshing = data.isRefreshing,
                        consoleState = resolveConsoleState(data, current.consoleState),
                    )
                }
            }
        }

        // 2. Cargar en paralelo el contexto clínico del paciente (Nubank density)
        loadClinicalContext()
    }

    /**
     * Resuelve la máquina de estados de atención en tiempo real (Uber style)
     */
    private fun resolveConsoleState(
        data: PatientClinicData,
        currentConsole: ConsultationConsoleState,
    ): ConsultationConsoleState {
        val telemedicineApts = data.appointments.filter { apt ->
            apt.type == AppointmentType.TELEMEDICINE || apt.meetingUrl != null
        }

        // 1. Turno en vivo / joinable
        val liveApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.IN_PROGRESS }
        val activeApt = liveApt ?: telemedicineApts.firstOrNull { apt ->
            (apt.status == AppointmentStatus.CONFIRMED || apt.id in data.joinableAppointmentIds) &&
                apt.isTelemedicineJoinCandidate()
        }

        if (activeApt != null) {
            return ConsultationConsoleState.ActiveVideoconsultation(
                appointment = activeApt,
                doctorName = activeApt.doctorName ?: "Profesional médico asignado",
                doctorSpecialty = activeApt.doctorSpecialty ?: "Medicina General",
                licenseNumber = activeApt.doctorLicenseNumber,
                isSisaValidated = true,
                chiefComplaint = activeApt.notes,
            )
        }

        // 2. Turno pendiente de pago
        val pendingPaymentApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.PAYMENT_PENDING }
        if (pendingPaymentApt != null) {
            return ConsultationConsoleState.PendingPayment(
                appointment = pendingPaymentApt,
                feeAmountArs = pendingPaymentApt.doctorFee ?: 15000.0,
                isProcessingPayment = _uiState.value.payingAppointmentId == pendingPaymentApt.id,
            )
        }

        // 3. Guardia médica 24/7 disponible
        if (data.availableDoctors.isNotEmpty()) {
            val previousTriage = currentConsole as? ConsultationConsoleState.OnCallTriage
            return ConsultationConsoleState.OnCallTriage(
                availableDoctorsCount = data.availableDoctors.size,
                enteredChiefComplaint = previousTriage?.enteredChiefComplaint.orEmpty(),
                selectedSymptomChips = previousTriage?.selectedSymptomChips.orEmpty(),
                detectedRedFlags = previousTriage?.detectedRedFlags.orEmpty(),
                isBypassingRedFlagWarning = previousTriage?.isBypassingRedFlagWarning ?: false,
                isDispatchingGuard = previousTriage?.isDispatchingGuard ?: false,
            )
        }

        // 4. Reposo clínico
        return ConsultationConsoleState.Idle
    }

    /**
     * Carga paralela de datos clínicos (Alergias, Medicamentos, Recetas, Órdenes, Seguimiento)
     */
    fun loadClinicalContext() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = it.isLoading && it.activePrescriptions.isEmpty()) }

            val deferredConstants = async { fetchClinicalConstants() }
            val deferredPrescriptions = async {
                prescriptionRepository.getPatientPrescriptions()
                    .getOrNull()
                    .orEmpty()
                    .filter { it.isActive }
            }
            val deferredOrders = async {
                medicalOrderRepository.getPatientMedicalOrders()
                    .getOrNull()
                    .orEmpty()
                    .filter { !it.status.equals("cancelled", ignoreCase = true) }
            }
            val deferredFollowup = async {
                val user = profileRepository.getProfile().getOrNull()
                if (user != null) {
                    followupRepository.getPendingCheckIn(user.id).getOrNull()
                } else null
            }

            val constants = deferredConstants.await()
            val prescriptions = deferredPrescriptions.await()
            val orders = deferredOrders.await()
            val followup = deferredFollowup.await()

            _uiState.update { current ->
                current.copy(
                    clinicalConstants = constants,
                    activePrescriptions = prescriptions,
                    pendingMedicalOrders = orders,
                    pendingFollowupCheckIn = followup,
                    isLoading = false,
                )
            }
        }
    }

    private suspend fun fetchClinicalConstants(): ClinicalConstantsUiModel {
        val summaryResult = healthRepository.getAnamnesisSummary().getOrNull()
        if (summaryResult == null) {
            return ClinicalConstantsUiModel(
                allergies = emptyList(),
                hasNoKnownAllergies = false,
                allergiesDeclared = false,
                habitualMedications = emptyList(),
                anamnesisCompletionPercentage = 0,
                isAnamnesisComplete = false,
            )
        }

        val sections = healthRepository.getAnamnesisSections(summaryResult.id).getOrNull().orEmpty()
        val allergies = mutableListOf<String>()
        var hasNoKnownAllergies = false
        var allergiesDeclared = false
        val medications = mutableListOf<String>()

        for (sec in sections) {
            val sectionName = sec.section.lowercase()

            if (sectionName.contains("alergia")) {
                allergiesDeclared = true
                val hasAllergiesBool = sec.data["tiene_alergias"]?.toBooleanStrictOrNull()
                if (hasAllergiesBool == false) {
                    hasNoKnownAllergies = true
                }
                for ((k, v) in sec.data) {
                    if (k == "tiene_alergias" || v.isBlank()) continue
                    val lower = v.lowercase().trim()
                    if (lower == "false" || lower == "ninguna" || lower.contains("niega") || lower.contains("no refiere") || lower.contains("no posee")) {
                        hasNoKnownAllergies = true
                    } else if (lower != "true" && !lower.contains("no documentado")) {
                        v.split(',', '\n').map { it.trim().trimStart('-', '•', '*') }.filter {
                            it.isNotBlank() && it.lowercase() != "true" && it.lowercase() != "false" && !it.lowercase().contains("no documentado")
                        }.forEach { allergies.add(it) }
                    }
                }
            }

            if (sectionName.contains("medicamento") || sectionName.contains("medication")) {
                val tomaMedicamentos = sec.data["toma_medicamentos"]?.trim()?.lowercase()
                if (tomaMedicamentos != "false") {
                    for ((k, v) in sec.data) {
                        if (k == "toma_medicamentos" || v.isBlank()) continue
                        val lower = v.lowercase().trim()
                        if (lower != "false" && lower != "true" && !lower.contains("no documentado") && !lower.contains("niega") && !lower.contains("ninguno")) {
                            v.split(',', '\n').map { it.trim().trimStart('-', '•', '*') }.filter {
                                it.isNotBlank() && it.lowercase() != "true" && it.lowercase() != "false" && !it.lowercase().contains("no documentado")
                            }.forEach { medications.add(it) }
                        }
                    }
                }
            }
        }

        val cleanAllergies = allergies.distinct()
        return ClinicalConstantsUiModel(
            allergies = cleanAllergies,
            hasNoKnownAllergies = (hasNoKnownAllergies || cleanAllergies.isEmpty()) && allergiesDeclared && cleanAllergies.isEmpty(),
            allergiesDeclared = allergiesDeclared,
            habitualMedications = medications.distinct(),
            anamnesisCompletionPercentage = summaryResult.completionPercentage,
            isAnamnesisComplete = summaryResult.completionPercentage >= 100 || summaryResult.status in listOf("completed", "under_review"),
        )
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        clinicStore.refresh()
        loadClinicalContext()
    }

    fun clearToast() {
        _uiState.update { it.copy(toastMessage = null) }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(checkoutUrlToLaunch = null) }
    }

    fun selectPrescriptionForQr(prescription: Prescription?) {
        _uiState.update { it.copy(selectedPrescriptionForQr = prescription) }
    }

    // ── GESTIÓN DE TRIAGE EN TIEMPO REAL & BANDERAS ROJAS ──

    fun onChiefComplaintChanged(text: String) {
        val currentTriage = _uiState.value.consoleState as? ConsultationConsoleState.OnCallTriage ?: return
        val flags = RedFlagDetector.evaluate(text, currentTriage.selectedSymptomChips)

        _uiState.update { current ->
            current.copy(
                consoleState = currentTriage.copy(
                    enteredChiefComplaint = text,
                    detectedRedFlags = flags,
                    isBypassingRedFlagWarning = false,
                ),
            )
        }
    }

    fun onSymptomChipToggled(symptom: String) {
        val currentTriage = _uiState.value.consoleState as? ConsultationConsoleState.OnCallTriage ?: return
        val updatedChips = if (symptom in currentTriage.selectedSymptomChips) {
            currentTriage.selectedSymptomChips - symptom
        } else {
            currentTriage.selectedSymptomChips + symptom
        }
        val flags = RedFlagDetector.evaluate(currentTriage.enteredChiefComplaint, updatedChips)

        _uiState.update { current ->
            current.copy(
                consoleState = currentTriage.copy(
                    selectedSymptomChips = updatedChips,
                    detectedRedFlags = flags,
                    isBypassingRedFlagWarning = false,
                ),
            )
        }
    }

    fun bypassRedFlags() {
        val currentTriage = _uiState.value.consoleState as? ConsultationConsoleState.OnCallTriage ?: return
        _uiState.update { current ->
            current.copy(
                consoleState = currentTriage.copy(isBypassingRedFlagWarning = true),
            )
        }
    }

    // ── DESPACHO DE GUARDIA MÉDICA 24/7 CON TRIAGE ──

    fun requestEmergencyDispatch(onReady: (appointmentId: String) -> Unit) {
        val currentTriage = _uiState.value.consoleState as? ConsultationConsoleState.OnCallTriage ?: return
        val doctor = clinicStore.data.value.availableDoctors.firstOrNull()

        if (doctor == null) {
            _uiState.update {
                it.copy(toastMessage = "No hay médicos de guardia disponibles en este momento.")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { current ->
                current.copy(consoleState = currentTriage.copy(isDispatchingGuard = true))
            }

            val structuredReason = buildString {
                append("Guardia 24/7: ")
                if (currentTriage.enteredChiefComplaint.isNotBlank()) {
                    append(currentTriage.enteredChiefComplaint.trim())
                } else if (currentTriage.selectedSymptomChips.isNotEmpty()) {
                    append(currentTriage.selectedSymptomChips.joinToString(", "))
                } else {
                    append("Consulta clínica general")
                }
            }

            val now = OffsetDateTime.now(ZoneOffset.UTC)
            val startTime = now.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            val endTime = now.plusMinutes(30).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

            val result = runCatching {
                appointmentRepository.bookAppointment(
                    doctorId = doctor.id,
                    startTime = startTime,
                    endTime = endTime,
                    type = "telemedicine",
                    reason = structuredReason,
                )
            }.getOrNull()?.getOrNull()

            if (result == null) {
                _uiState.update { current ->
                    current.copy(
                        consoleState = currentTriage.copy(isDispatchingGuard = false),
                        toastMessage = "No fue posible conectar con la guardia médica. Por favor intentá nuevamente.",
                    )
                }
                return@launch
            }

            val finalApt = result.copy(
                doctorName = doctor.name,
                doctorSpecialty = doctor.specialty,
                doctorAvatarUrl = doctor.avatarUrl,
                doctorFee = doctor.consultationFee ?: 15000.0,
                doctorLicenseNumber = doctor.licenseNumber,
                status = AppointmentStatus.CONFIRMED,
                notes = structuredReason,
            )

            clinicStore.applyMutation { data ->
                data.copy(appointments = listOf(finalApt) + data.appointments.filter { it.id != finalApt.id })
            }

            _uiState.update { current ->
                current.copy(
                    consoleState = ConsultationConsoleState.ActiveVideoconsultation(
                        appointment = finalApt,
                        doctorName = doctor.name,
                        doctorSpecialty = doctor.specialty,
                        licenseNumber = doctor.licenseNumber,
                        isSisaValidated = true,
                        chiefComplaint = structuredReason,
                    ),
                    toastMessage = "Médico de guardia asignado: ${doctor.name}",
                )
            }
            onReady(finalApt.id)
        }
    }

    // ── PROTOCOLO DE CONTINUIDAD ASISTENCIAL 48H ──

    fun submitFollowupEvolution(followupId: String, evolution: FollowupCheckInEvolution) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingCheckIn = true) }
            val result = followupRepository.submitCheckIn(followupId, evolution.toKey())

            if (result.isSuccess) {
                _uiState.update {
                    it.copy(
                        pendingFollowupCheckIn = null,
                        isSubmittingCheckIn = false,
                        toastMessage = "Evolución registrada correctamente en tu historial clínico.",
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        isSubmittingCheckIn = false,
                        toastMessage = "No se pudo registrar la evolución. Verificá tu conexión.",
                    )
                }
            }
        }
    }

    // ── GESTIÓN DE PAGOS DE TURNOS (MERCADOPAGO) ──

    fun payAppointment(appointment: Appointment) {
        viewModelScope.launch {
            _uiState.update { it.copy(payingAppointmentId = appointment.id) }
            val execution = appointmentRepository.createAppointmentPayment(appointment.id).getOrNull()

            if (execution == null) {
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        toastMessage = "No se pudo iniciar el proceso de pago. Verificá tu conexión.",
                    )
                }
                return@launch
            }

            if (execution.status == "approved") {
                clinicStore.applyMutation { data ->
                    data.copy(appointments = data.appointments.map { apt ->
                        if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                    })
                }
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        toastMessage = "Pago confirmado. Tu consulta ya está asegurada.",
                    )
                }
                return@launch
            }

            if (!execution.checkoutUrl.isNullOrBlank()) {
                _uiState.update {
                    it.copy(
                        checkoutUrlToLaunch = execution.checkoutUrl,
                        toastMessage = "Completá el pago en MercadoPago. Verificando confirmación...",
                    )
                }

                paymentPollingJob?.cancel()
                paymentPollingJob = viewModelScope.launch {
                    val startPollTime = System.currentTimeMillis()
                    while (System.currentTimeMillis() - startPollTime < 60_000L) {
                        delay(2500L)
                        val status = appointmentRepository.getAppointmentPaymentStatus(appointment.id).getOrNull()
                        if (status == "approved") {
                            clinicStore.applyMutation { data ->
                                data.copy(appointments = data.appointments.map { apt ->
                                    if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                                })
                            }
                            _uiState.update {
                                it.copy(
                                    payingAppointmentId = null,
                                    toastMessage = "Pago confirmado. Tu consulta ya está asegurada.",
                                )
                            }
                            break
                        }
                    }
                    if (_uiState.value.payingAppointmentId == appointment.id) {
                        _uiState.update { it.copy(payingAppointmentId = null) }
                    }
                    clinicStore.refresh()
                }
            } else {
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        toastMessage = "No se pudo obtener el enlace de pago. Reintentá en unos momentos.",
                    )
                }
            }
        }
    }
}