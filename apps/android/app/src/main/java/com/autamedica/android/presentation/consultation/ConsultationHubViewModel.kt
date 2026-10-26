package com.autamedica.android.presentation.consultation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.repository.PatientClinicData
import com.autamedica.android.data.repository.PatientClinicStore
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
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

data class ConsultationHubUiState(
    // Datos compartidos con Agenda (fuente única: PatientClinicStore)
    val joinableAppointmentIds: Set<String> = emptySet(),
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val telemedicineError: String? = null,
    // Estado transitorio de acción (pago y guardia)
    val isEmergencyQueueLoading: Boolean = false,
    val payingAppointmentId: String? = null,
    val paymentMessage: String? = null,
    val checkoutUrlToLaunch: String? = null,
    val activeTelemedicineAppointment: Appointment? = null,
    val pendingPaymentAppointment: Appointment? = null,
)

@HiltViewModel
class ConsultationHubViewModel @Inject constructor(
    private val clinicStore: PatientClinicStore,
    private val appointmentRepository: AppointmentRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultationHubUiState())
    val uiState: StateFlow<ConsultationHubUiState> = _uiState.asStateFlow()

    init {
        // Consultar observa la misma fuente única que Agenda: un solo fetch
        // alimenta ambos tabs y las mutaciones de pago/guardia se reflejan al instante.
        viewModelScope.launch {
            clinicStore.data.collect { data ->
                _uiState.value = buildUiState(data)
            }
        }
    }

    private fun buildUiState(data: PatientClinicData): ConsultationHubUiState {
        val telemedicineApts = data.appointments.filter { apt ->
            apt.type == AppointmentType.TELEMEDICINE || apt.meetingUrl != null
        }

        // Turno activo / joinable: en progreso o confirmado dentro de la ventana de ingreso
        val liveApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.IN_PROGRESS }
        val activeApt = liveApt ?: telemedicineApts.firstOrNull { apt ->
            (apt.status == AppointmentStatus.CONFIRMED || apt.id in data.joinableAppointmentIds) &&
                apt.isTelemedicineJoinCandidate()
        }
        val pendingPaymentApt = telemedicineApts.firstOrNull { it.status == AppointmentStatus.PAYMENT_PENDING }

        return ConsultationHubUiState(
            joinableAppointmentIds = data.joinableAppointmentIds,
            availableDoctors = data.availableDoctors,
            isLoading = data.isLoading,
            isRefreshing = data.isRefreshing,
            error = data.error,
            telemedicineError = data.telemedicineError,
            isEmergencyQueueLoading = _uiState.value.isEmergencyQueueLoading,
            payingAppointmentId = _uiState.value.payingAppointmentId,
            paymentMessage = _uiState.value.paymentMessage,
            checkoutUrlToLaunch = _uiState.value.checkoutUrlToLaunch,
            activeTelemedicineAppointment = activeApt,
            pendingPaymentAppointment = pendingPaymentApt,
        )
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        clinicStore.refresh()
    }

    fun clearPaymentMessage() {
        _uiState.update { it.copy(paymentMessage = null) }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(checkoutUrlToLaunch = null) }
    }

    private var paymentPollingJob: Job? = null

    fun payAppointment(appointment: Appointment) {
        viewModelScope.launch {
            _uiState.update { it.copy(payingAppointmentId = appointment.id) }
            val execution = appointmentRepository.createAppointmentPayment(appointment.id).getOrNull()

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
                clinicStore.applyMutation { data ->
                    data.copy(appointments = data.appointments.map { apt ->
                        if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                    })
                }
                _uiState.update {
                    it.copy(
                        payingAppointmentId = null,
                        paymentMessage = "Pago confirmado. Tu consulta ya está asegurada.",
                    )
                }
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
                            clinicStore.applyMutation { data ->
                                data.copy(appointments = data.appointments.map { apt ->
                                    if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CONFIRMED) else apt
                                })
                            }
                            _uiState.update {
                                it.copy(
                                    payingAppointmentId = null,
                                    paymentMessage = "Pago confirmado correctamente. Tu consulta ya está asegurada.",
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

            val doctor = clinicStore.data.value.availableDoctors.firstOrNull()
            if (doctor == null) {
                _uiState.update {
                    it.copy(
                        isEmergencyQueueLoading = false,
                        paymentMessage = "Ahora mismo no hay médicos de guardia disponibles. Probá nuevamente o agendá tu consulta desde Agenda.",
                    )
                }
                return@launch
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
                doctorFee = doctor.consultationFee,
            )

            clinicStore.applyMutation { data ->
                data.copy(appointments = listOf(finalApt) + data.appointments.filter { it.id != finalApt.id })
            }

            _uiState.update {
                it.copy(
                    isEmergencyQueueLoading = false,
                    paymentMessage = "Turno registrado con ${doctor.name}. Estado: ${booked.status}. La confirmación y el acceso dependen del pago y de la sala disponible.",
                )
            }
            // A booked appointment is not proof of an approved payment or joinable room.
            // The patient may enter only through the verified telemedicine flow.
            clinicStore.refresh()
        }
    }
}