package com.autamedica.android.presentation.consultation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

enum class ConsultationReason(
    val title: String,
    val subtitle: String,
    val specialtyMatch: String,
) {
    GENERAL("Medicina General", "Clínica médica, dudas y chequeos", "Medicina General"),
    PEDIATRICS("Pediatría", "Fiebre, pautas de alarma y niños", "Pediatría"),
    MENTAL_HEALTH("Salud Mental", "Psicología, psiquiatría y contención", "Salud Mental"),
    EXPRESS_PRESCRIPTION("Receta express", "Renovación rápida de recetas", "Clínico General");
}

data class ConsultationHubUiState(
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val selectedReason: ConsultationReason? = null,
    val isEmergencyQueueLoading: Boolean = false,
    val emergencyWaitMinutes: Int = 3,
    val onDutyDoctorsCount: Int = 4,
    val walletBalanceCents: Long = 1500000L,
    val payingAppointmentId: String? = null,
    val paymentMessage: String? = null,
    val checkoutUrlToLaunch: String? = null,
    val activeTelemedicineAppointment: Appointment? = null,
    val pendingPaymentAppointment: Appointment? = null,
    val upcomingTelemedicineAppointments: List<Appointment> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val telemedicineError: String? = null,
    val userId: String = "",
    val userName: String = "",
)

@HiltViewModel
class ConsultationHubViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val telemedicineRepository: TelemedicineRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultationHubUiState())
    val uiState: StateFlow<ConsultationHubUiState> = _uiState.asStateFlow()

    private val fallbackDoctors = listOf(
        DoctorBookingInfo(
            id = "doc-alejandro-rossi",
            userId = "u-1",
            name = "Dr. Alejandro Rossi",
            specialty = "Medicina General",
            licenseNumber = "MN 145.890",
            consultationFee = 15000.0,
            avatarUrl = null,
            availableSlots = listOf("10:00", "11:30", "14:00"),
        ),
        DoctorBookingInfo(
            id = "doc-mariana-gomez",
            userId = "u-2",
            name = "Dra. Mariana Gómez",
            specialty = "Cardiología",
            licenseNumber = "MN 152.340",
            consultationFee = 18000.0,
            avatarUrl = null,
            availableSlots = listOf("11:00", "15:30", "17:00"),
        ),
        DoctorBookingInfo(
            id = "doc-carlos-menendez",
            userId = "u-3",
            name = "Dr. Carlos Menéndez",
            specialty = "Salud Mental",
            licenseNumber = "MN 138.992",
            consultationFee = 16500.0,
            avatarUrl = null,
            availableSlots = listOf("09:30", "12:00", "16:00"),
        ),
        DoctorBookingInfo(
            id = "doc-camila-silveira",
            userId = "u-4",
            name = "Dra. Camila Silveira",
            specialty = "Pediatría",
            licenseNumber = "MN 161.420",
            consultationFee = 16000.0,
            avatarUrl = null,
            availableSlots = listOf("08:30", "13:00", "16:30"),
        ),
        DoctorBookingInfo(
            id = "doc-lucas-ferreira",
            userId = "u-5",
            name = "Dr. Lucas Ferreira",
            specialty = "Dermatología",
            licenseNumber = "MN 159.881",
            consultationFee = 19000.0,
            avatarUrl = null,
            availableSlots = listOf("10:30", "14:30", "18:00"),
        ),
        DoctorBookingInfo(
            id = "doc-valentina-paz",
            userId = "u-6",
            name = "Dra. Valentina Paz",
            specialty = "Ginecología",
            licenseNumber = "MN 147.210",
            consultationFee = 17500.0,
            avatarUrl = null,
            availableSlots = listOf("09:00", "11:00", "15:00"),
        ),
    )

    init {
        loadUserInfo()
        loadData()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadData()
    }

    fun selectReason(reason: ConsultationReason?) {
        _uiState.update { current ->
            val nextReason = if (current.selectedReason == reason) null else reason
            current.copy(selectedReason = nextReason)
        }
    }

    private var paymentPollingJob: Job? = null

    fun clearPaymentMessage() {
        _uiState.update { it.copy(paymentMessage = null) }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(checkoutUrlToLaunch = null) }
    }

    fun payAppointment(appointment: Appointment) {
        viewModelScope.launch {
            _uiState.update { it.copy(payingAppointmentId = appointment.id) }
            val paymentResult = appointmentRepository.createAppointmentPayment(appointment.id)
            val execution = paymentResult.getOrNull()

            if (execution == null) {
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        paymentMessage = "No se pudo iniciar el proceso de pago. Verificá tu conexión.",
                    )
                }
                return@launch
            }

            if (execution.status == "approved") {
                val updatedList = _uiState.value.appointments.map { apt ->
                    if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                }
                _uiState.update {
                    it.copy(
                        appointments = updatedList,
                        payingAppointmentId = null,
                        paymentMessage = "Tu saldo AutaMedica cubrió la consulta. El turno ya quedó confirmado.",
                    )
                }
                recomputeTelemedicineLists()
                return@launch
            }

            if (!execution.checkoutUrl.isNullOrBlank()) {
                _uiState.update {
                    it.copy(
                        checkoutUrlToLaunch = execution.checkoutUrl,
                        paymentMessage = "Completá el pago en MercadoPago. Verificando confirmación...",
                    )
                }

                paymentPollingJob?.cancel()
                paymentPollingJob = viewModelScope.launch {
                    val startPollTime = System.currentTimeMillis()
                    while (System.currentTimeMillis() - startPollTime < 60_000L) {
                        delay(2500L)
                        val status = appointmentRepository.getAppointmentPaymentStatus(appointment.id).getOrNull()
                        if (status == "approved") {
                            val updatedList = _uiState.value.appointments.map { apt ->
                                if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                            }
                            _uiState.update {
                                it.copy(
                                    appointments = updatedList,
                                    payingAppointmentId = null,
                                    paymentMessage = "Pago confirmado correctamente. Tu consulta ya está asegurada.",
                                )
                            }
                            recomputeTelemedicineLists()
                            break
                        }
                    }
                    if (_uiState.value.payingAppointmentId == appointment.id) {
                        _uiState.update { it.copy(payingAppointmentId = null) }
                    }
                    loadData()
                }
            } else {
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        paymentMessage = "No se pudo obtener el enlace de pago. Por favor intentá nuevamente.",
                    )
                }
            }
        }
    }

    fun requestEmergencyConsultation(
        reason: String = "Guardia Médica 24/7",
        onReadyToEnter: (appointmentId: String) -> Unit,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isEmergencyQueueLoading = true) }
            val doctor = _uiState.value.availableDoctors.firstOrNull() ?: fallbackDoctors.first()
            val now = OffsetDateTime.now(ZoneOffset.UTC)
            val startTime = now.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            val endTime = now.plusMinutes(30).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

            val result = runCatching {
                appointmentRepository.bookAppointment(
                    doctorId = doctor.id,
                    startTime = startTime,
                    endTime = endTime,
                    type = "telemedicine",
                    reason = "Guardia Inmediata 24/7: $reason",
                )
            }.getOrNull()

            val booked = result?.getOrNull()
            if (booked == null) {
                _uiState.update {
                    it.copy(
                        isEmergencyQueueLoading = false,
                        paymentMessage = "No fue posible conectar con la guardia médica en este momento. Por favor intentá nuevamente.",
                    )
                }
                return@launch
            }

            val finalApt = booked.copy(
                doctorName = doctor.name,
                doctorSpecialty = doctor.specialty,
                doctorAvatarUrl = doctor.avatarUrl,
                doctorFee = doctor.consultationFee ?: 15000.0,
                status = AppointmentStatus.CONFIRMED,
            )

            _uiState.update { current ->
                val updatedAppointments = listOf(finalApt) + current.appointments.filter { it.id != finalApt.id }
                current.copy(
                    isEmergencyQueueLoading = false,
                    appointments = updatedAppointments,
                    paymentMessage = "Médico de guardia asignado (${doctor.name}). Podés ingresar de inmediato.",
                )
            }
            recomputeTelemedicineLists()
            onReadyToEnter(finalApt.id)
        }
    }

    private fun loadUserInfo() {
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

    private fun loadData() {
        viewModelScope.launch {
            val doctorsResult = runCatching {
                appointmentRepository.getAvailableDoctors().getOrNull() ?: emptyList()
            }.getOrDefault(emptyList())

            val rawDoctors = if (doctorsResult.isNotEmpty()) doctorsResult else fallbackDoctors
            val docMap = rawDoctors.associateBy { it.id }

            appointmentRepository.getUpcomingAppointments()
                .onSuccess { rawAppointments ->
                    val appointments = rawAppointments.map { apt ->
                        if (apt.doctorName == null && apt.doctorId != null) {
                            val doc = docMap[apt.doctorId]
                            if (doc != null) {
                                apt.copy(
                                    doctorName = doc.name,
                                    doctorSpecialty = doc.specialty,
                                    doctorAvatarUrl = doc.avatarUrl,
                                    doctorFee = doc.consultationFee,
                                )
                            } else apt
                        } else apt
                    }

                    val (joinableIds, telemedicineError) = resolveJoinableAppointmentIds(appointments)

                    _uiState.update {
                        it.copy(
                            appointments = appointments,
                            availableDoctors = rawDoctors,
                            joinableAppointmentIds = joinableIds,
                            isLoading = false,
                            isRefreshing = false,
                            error = null,
                            telemedicineError = telemedicineError,
                        )
                    }
                    recomputeTelemedicineLists()
                }
                .onFailure { err ->
                    _uiState.update {
                        it.copy(
                            availableDoctors = rawDoctors,
                            isLoading = false,
                            isRefreshing = false,
                            error = sanitizeError(err.message),
                        )
                    }
                    recomputeTelemedicineLists()
                }
        }
    }

    private fun recomputeTelemedicineLists() {
        _uiState.update { state ->
            val telemedicineApts = state.appointments.filter { apt ->
                apt.type == AppointmentType.TELEMEDICINE || apt.meetingUrl != null
            }

            // Active / Joinable appointment:
            // An appointment in progress or confirmed candidate within join window (45 min before / 24 h after)
            val liveApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.IN_PROGRESS }
            val joinableApt = liveApt ?: telemedicineApts.firstOrNull { apt ->
                (apt.status == AppointmentStatus.CONFIRMED || apt.id in state.joinableAppointmentIds) &&
                    apt.isTelemedicineJoinCandidate()
            }

            // Pending payment appointment:
            val pendingPaymentApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.PAYMENT_PENDING }

            // Upcoming list excluding active & pending payment
            val upcoming = telemedicineApts.filter { apt ->
                apt.id != joinableApt?.id &&
                    apt.id != pendingPaymentApt?.id &&
                    (apt.status == AppointmentStatus.SCHEDULED || apt.status == AppointmentStatus.CONFIRMED || apt.status == AppointmentStatus.IN_PROGRESS) &&
                    apt.isTelemedicineJoinCandidate()
            }

            state.copy(
                activeTelemedicineAppointment = joinableApt,
                pendingPaymentAppointment = pendingPaymentApt,
                upcomingTelemedicineAppointments = upcoming,
            )
        }
    }

    private suspend fun resolveJoinableAppointmentIds(
        appointments: List<Appointment>,
    ): Pair<Set<String>, String?> {
        val candidates = appointments.filter { it.isTelemedicineJoinCandidate() }
        if (candidates.isEmpty()) return emptySet<String>() to null

        return telemedicineRepository.getJoinableAppointmentIds(candidates).fold(
            onSuccess = { ids -> ids to null },
            onFailure = { emptySet<String>() to "No se pudo validar la disponibilidad de videollamada." },
        )
    }

    private fun sanitizeError(raw: String?): String {
        if (raw == null) return "Error al cargar datos de telemedicina"
        return when {
            "infinite recursion" in raw -> "Error temporal del servidor"
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "Error de conexión"
            "unauthorized" in raw.lowercase() || "jwt" in raw.lowercase() ->
                "Sesión expirada"
            else -> raw.lineSequence().firstOrNull()?.take(100) ?: raw.take(100)
        }
    }
}
