package com.autamedica.android.presentation.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.repository.PatientClinicStore
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class AppointmentsUiState(
    // Datos compartidos con Consultar (fuente única: PatientClinicStore)
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val telemedicineError: String? = null,
    val isRefreshing: Boolean = false,
    val userRole: String = "patient",
    // Flujo directo de agendamiento rápido (Colapsable y con disponibilidad real)
    val careCountry: String? = null,
    val needsCareCountry: Boolean = false,
    val isSavingCareCountry: Boolean = false,
    val isBookingExpanded: Boolean = false,
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val selectedDoctor: DoctorBookingInfo? = null,
    val availableDates: List<LocalDate> = emptyList(),
    val selectedDate: LocalDate = LocalDate.now(),
    val availableSlots: List<String> = emptyList(),
    val selectedSlot: String? = null,
    val isLoadingSlots: Boolean = false,
    val isBooking: Boolean = false,
    val bookingSuccessMessage: String? = null,
    val bookingErrorMessage: String? = null,
    val rescheduleSlots: List<String> = emptyList(),
    val rescheduleSelectedDate: LocalDate = LocalDate.now(),
    val rescheduleSelectedSlot: String? = null,
    val rescheduleLoading: Boolean = false,
)

@HiltViewModel
class AppointmentsViewModel @Inject constructor(
    private val clinicStore: PatientClinicStore,
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppointmentsUiState())
    val uiState: StateFlow<AppointmentsUiState> = _uiState.asStateFlow()

    init {
        loadUserInfo()
        // Agenda observa la misma fuente única que Consultar: un solo fetch
        // actualiza ambos tabs sin peticiones duplicadas.
        viewModelScope.launch {
            clinicStore.data.collect { data ->
                _uiState.update { state ->
                    state.copy(
                        appointments = data.appointments,
                        joinableAppointmentIds = data.joinableAppointmentIds,
                        availableDoctors = data.availableDoctors,
                        isLoading = data.isLoading,
                        isRefreshing = data.isRefreshing,
                        error = data.error,
                        telemedicineError = data.telemedicineError,
                        availableDates = if (state.availableDates.isEmpty()) {
                            (0..13).map { LocalDate.now().plusDays(it.toLong()) }
                        } else {
                            state.availableDates
                        },
                    )
                }
            }
        }
    }

    fun selectCareCountry(country: String) {
        if (_uiState.value.isSavingCareCountry) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingCareCountry = true, bookingErrorMessage = null) }
            appointmentRepository.selectCareCountry(country)
                .onSuccess {
                    _uiState.update { it.copy(careCountry = country, needsCareCountry = false, isSavingCareCountry = false) }
                    clinicStore.refresh()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isSavingCareCountry = false,
                        bookingErrorMessage = UiErrorMapper.map(error, "No se pudo guardar el país / Não foi possível salvar o país")) }
                }
        }
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        clinicStore.refresh()
    }

    fun cancelAppointment(appointment: Appointment) {
        viewModelScope.launch {
            appointmentRepository.cancelAppointment(appointment.id)
                .onSuccess {
                    clinicStore.applyMutation { data ->
                        data.copy(
                            appointments = data.appointments.map { apt ->
                                if (apt.id == appointment.id) apt.copy(status = AppointmentStatus.CANCELLED) else apt
                            },
                            joinableAppointmentIds = data.joinableAppointmentIds - appointment.id,
                        )
                    }
                    _uiState.update {
                        it.copy(bookingSuccessMessage = "Turno cancelado correctamente.")
                    }
                }
                .onFailure { err ->
                    SecureLog.error("[AppointmentsVM] Failed canceling appointment", err)
                    _uiState.update {
                        it.copy(bookingErrorMessage = UiErrorMapper.map(err, "No se pudo cancelar el turno. Reintentá."))
                    }
                }
        }
    }

    fun rescheduleAppointment(
        appointment: Appointment,
        newDate: LocalDate,
        newSlot: String,
    ) {
        if (newSlot.isBlank()) {
            _uiState.update { it.copy(bookingErrorMessage = "Seleccioná un horario disponible.") }
            return
        }
        viewModelScope.launch {
            val timeParts = newSlot.split(":")
            val hour = timeParts.getOrNull(0)?.toIntOrNull() ?: 9
            val minute = timeParts.getOrNull(1)?.toIntOrNull() ?: 0

            val argZone = ZoneId.of("America/Argentina/Buenos_Aires")
            val startDateTime = newDate.atTime(hour, minute).atZone(argZone).toOffsetDateTime()
            val durationMinutes = appointment.durationMinutes ?: 45
            val endDateTime = startDateTime.plusMinutes(durationMinutes.toLong())

            val startTimeIso = startDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            val endTimeIso = endDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

            appointmentRepository.rescheduleAppointment(appointment.id, startTimeIso, endTimeIso)
                .onSuccess {
                    clinicStore.refresh()
                    _uiState.update {
                        it.copy(bookingSuccessMessage = "Turno reprogramado correctamente para el ${formatConfirmationDate(newDate)} a las $newSlot hs.")
                    }
                }
                .onFailure { err ->
                    SecureLog.error("[AppointmentsVM] Failed rescheduling appointment", err)
                    _uiState.update {
                        it.copy(bookingErrorMessage = UiErrorMapper.map(err, "No se pudo reprogramar el turno. Reintentá."))
                    }
                }
        }
    }

    fun toggleBookingSection() {
        _uiState.update { current ->
            val nextExpanded = !current.isBookingExpanded
            if (nextExpanded && current.selectedDoctor != null) {
                loadSlotsForDoctorAndDate(current.selectedDoctor.id, current.selectedDate)
            }
            current.copy(isBookingExpanded = nextExpanded)
        }
    }

    fun selectDate(date: LocalDate) {
        _uiState.update { it.copy(selectedDate = date) }
        val doctor = _uiState.value.selectedDoctor
        if (doctor != null) {
            loadSlotsForDoctorAndDate(doctor.id, date)
        }
    }

    fun selectSlot(slot: String) {
        _uiState.update { it.copy(selectedSlot = slot) }
    }

    fun selectDoctor(doctor: DoctorBookingInfo) {
        val targetDate = resolveBestDateForDoctor(doctor, _uiState.value.selectedDate, _uiState.value.availableDates)
        _uiState.update { it.copy(selectedDoctor = doctor, selectedDate = targetDate) }
        loadSlotsForDoctorAndDate(doctor.id, targetDate)
    }

    private fun resolveBestDateForDoctor(
        doctor: DoctorBookingInfo,
        currentDate: LocalDate,
        availableDates: List<LocalDate>,
    ): LocalDate {
        if (doctor.availableDays.isEmpty()) return currentDate
        val currentDayOfWeek = dayIndex(currentDate)
        if (currentDayOfWeek in doctor.availableDays) return currentDate
        return availableDates.firstOrNull { date ->
            dayIndex(date) in doctor.availableDays
        } ?: currentDate
    }

    private fun dayIndex(date: LocalDate): Int = when (date.dayOfWeek) {
        DayOfWeek.SUNDAY -> 0
        DayOfWeek.MONDAY -> 1
        DayOfWeek.TUESDAY -> 2
        DayOfWeek.WEDNESDAY -> 3
        DayOfWeek.THURSDAY -> 4
        DayOfWeek.FRIDAY -> 5
        DayOfWeek.SATURDAY -> 6
    }

    fun loadSlotsForDoctorAndDate(doctorId: String, date: LocalDate) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSlots = true, selectedSlot = null) }
            appointmentRepository.getAvailableSlots(doctorId, date.toString())
                .onSuccess { slots ->
                    _uiState.update { state ->
                        state.copy(
                            availableSlots = slots,
                            selectedSlot = slots.firstOrNull(),
                            isLoadingSlots = false,
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.warn("[AppointmentsVM] Error loading real slots: ${error.message}")
                    _uiState.update {
                        it.copy(
                            availableSlots = emptyList(),
                            selectedSlot = null,
                            isLoadingSlots = false,
                        )
                    }
                }
        }
    }

    fun dismissBookingMessages() {
        _uiState.update { it.copy(bookingSuccessMessage = null, bookingErrorMessage = null) }
    }

    fun loadRescheduleSlots(doctorId: String?, date: LocalDate) {
        if (doctorId == null) return
        viewModelScope.launch {
            _uiState.update { it.copy(rescheduleLoading = true, rescheduleSelectedSlot = null, rescheduleSelectedDate = date) }
            appointmentRepository.getAvailableSlots(doctorId, date.toString())
                .onSuccess { slots ->
                    _uiState.update { state ->
                        state.copy(
                            rescheduleSlots = slots,
                            rescheduleSelectedSlot = slots.firstOrNull(),
                            rescheduleLoading = false,
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.warn("[AppointmentsVM] Error loading reschedule slots: ${error.message}")
                    _uiState.update {
                        it.copy(
                            rescheduleSlots = emptyList(),
                            rescheduleSelectedSlot = null,
                            rescheduleLoading = false,
                        )
                    }
                }
        }
    }

    fun selectRescheduleDate(date: LocalDate) {
        _uiState.update { it.copy(rescheduleSelectedDate = date, rescheduleSelectedSlot = null) }
    }

    fun selectRescheduleSlot(slot: String) {
        _uiState.update { it.copy(rescheduleSelectedSlot = slot) }
    }

    fun confirmQuickBooking() {
        val state = _uiState.value
        val doctor = state.selectedDoctor ?: run {
            _uiState.update { it.copy(bookingErrorMessage = "Seleccioná un profesional médico para tu consulta.") }
            return
        }
        val slot = state.selectedSlot ?: run {
            _uiState.update { it.copy(bookingErrorMessage = "Seleccioná un horario disponible.") }
            return
        }

        _uiState.update { it.copy(isBooking = true, bookingErrorMessage = null, bookingSuccessMessage = null) }

        viewModelScope.launch {
            try {
                val timeParts = slot.split(":")
                val hour = timeParts.getOrNull(0)?.toIntOrNull() ?: 9
                val minute = timeParts.getOrNull(1)?.toIntOrNull() ?: 0

                val argZone = ZoneId.of("America/Argentina/Buenos_Aires")
                val startDateTime = state.selectedDate.atTime(hour, minute).atZone(argZone).toOffsetDateTime()
                val endDateTime = startDateTime.plusMinutes(45)

                val startTimeIso = startDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                val endTimeIso = endDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

                val reason = "Videoconsulta de ${doctor.specialty} con ${doctor.name}"

                appointmentRepository.bookAppointment(
                    doctorId = doctor.id,
                    startTime = startTimeIso,
                    endTime = endTimeIso,
                    type = "telemedicine",
                    reason = reason,
                ).onSuccess {
                    // Actualiza la fuente única compartida con Consultar.
                    clinicStore.refresh()

                    val remainingSlots = state.availableSlots.filter { it != slot }
                    _uiState.update { current ->
                        current.copy(
                            isBooking = false,
                            isBookingExpanded = false,
                            bookingSuccessMessage = "¡Turno confirmado para el ${formatConfirmationDate(state.selectedDate)} a las $slot hs con ${doctor.name}!",
                            bookingErrorMessage = null,
                            availableSlots = remainingSlots,
                            selectedSlot = remainingSlots.firstOrNull(),
                        )
                    }
                }.onFailure { err ->
                    SecureLog.error("[AppointmentsVM] Failed booking appointment", err)
                    _uiState.update {
                        it.copy(
                            isBooking = false,
                            bookingErrorMessage = UiErrorMapper.map(err, "No se pudo confirmar el turno. Reintentá."),
                        )
                    }
                }
            } catch (e: Exception) {
                SecureLog.error("[AppointmentsVM] Unexpected booking exception", e)
                _uiState.update {
                    it.copy(
                        isBooking = false,
                        bookingErrorMessage = "Ocurrió un error inesperado al agendar.",
                    )
                }
            }
        }
    }

    private fun formatConfirmationDate(date: LocalDate): String {
        val today = LocalDate.now()
        return when (date) {
            today -> "hoy"
            today.plusDays(1) -> "mañana"
            else -> date.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale("es", "AR")))
        }
    }

    private fun loadUserInfo() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                _uiState.update { state ->
                    state.copy(userRole = user.role.wireName)
                }
                if (user.role.wireName == "patient") {
                    appointmentRepository.getCareCountry()
                        .onSuccess { country ->
                            _uiState.update { it.copy(careCountry = country, needsCareCountry = country != "AR" && country != "BR") }
                        }
                        .onFailure { error ->
                            _uiState.update { it.copy(bookingErrorMessage = UiErrorMapper.map(error, "No se pudo consultar el país de atención")) }
                        }
                }
            }
        }
    }
}
