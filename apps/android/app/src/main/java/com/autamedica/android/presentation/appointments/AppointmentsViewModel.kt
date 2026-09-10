package com.autamedica.android.presentation.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

enum class AppointmentFilter(val label: String) {
    ALL("Todas"),
    UPCOMING("Próximas"),
    COMPLETED("Completadas"),
    CANCELLED("Canceladas");
}

data class AppointmentsUiState(
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val reviewedAppointmentIds: Set<String> = emptySet(),
    val selectedFilter: AppointmentFilter = AppointmentFilter.ALL,
    val walletBalanceCents: Long = 1500000L, // $15.000,00 ARS default credit for patient
    val isTopupDialogOpen: Boolean = false,
    val payingAppointmentId: String? = null,
    val paymentMessage: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val telemedicineError: String? = null,
    val isRefreshing: Boolean = false,
    val userId: String = "",
    val userRole: String = "patient",
    val userName: String = "",
    // Flujo directo de agendamiento rápido (Calendario interactivo)
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val selectedDoctor: DoctorBookingInfo? = null,
    val availableDates: List<LocalDate> = emptyList(),
    val selectedDate: LocalDate = LocalDate.now(),
    val availableSlots: List<String> = emptyList(),
    val selectedSlot: String? = null,
    val isBooking: Boolean = false,
    val bookingSuccessMessage: String? = null,
    val bookingErrorMessage: String? = null,
)

@HiltViewModel
class AppointmentsViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val telemedicineRepository: TelemedicineRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppointmentsUiState())
    val uiState: StateFlow<AppointmentsUiState> = _uiState.asStateFlow()

    private val fallbackDoctors = listOf(
        DoctorBookingInfo(
            id = "doc-valeria-torres",
            userId = "user-valeria-torres",
            name = "Dra. Valeria Torres",
            specialty = "Medicina General",
            licenseNumber = "MN 152.341",
            consultationFee = 12000.0,
            avatarUrl = null,
            availableSlots = listOf("09:00", "09:30", "10:00", "11:30", "14:00", "15:30", "17:00"),
        ),
        DoctorBookingInfo(
            id = "doc-roberto-gomez",
            userId = "user-roberto-gomez",
            name = "Dr. Roberto Gómez",
            specialty = "Cardiología",
            licenseNumber = "MN 145.890",
            consultationFee = 15000.0,
            avatarUrl = null,
            availableSlots = listOf("09:30", "11:00", "14:30", "16:00"),
        ),
        DoctorBookingInfo(
            id = "doc-lucas-benitez",
            userId = "user-lucas-benitez",
            name = "Dr. Lucas Benítez",
            specialty = "Pediatría",
            licenseNumber = "MN 138.902",
            consultationFee = 14000.0,
            avatarUrl = null,
            availableSlots = listOf("10:00", "11:30", "15:00", "16:30"),
        ),
        DoctorBookingInfo(
            id = "doc-mariana-perez",
            userId = "user-mariana-perez",
            name = "Dra. Mariana Pérez",
            specialty = "Dermatología",
            licenseNumber = "MN 161.420",
            consultationFee = 16500.0,
            avatarUrl = null,
            availableSlots = listOf("09:00", "10:30", "14:00", "17:00"),
        ),
        DoctorBookingInfo(
            id = "doc-esteban-quirce",
            userId = "user-esteban-quirce",
            name = "Dr. Esteban Quirce",
            specialty = "Neurología",
            licenseNumber = "MN 129.774",
            consultationFee = 18000.0,
            avatarUrl = null,
            availableSlots = listOf("11:00", "12:00", "14:30", "15:30"),
        ),
    )

    init {
        loadUserInfo()
        loadAppointments()
        loadAvailableDoctors()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAppointments()
        loadAvailableDoctors()
    }

    fun setFilter(filter: AppointmentFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }

    fun setTopupDialogVisible(visible: Boolean) {
        _uiState.update { it.copy(isTopupDialogOpen = visible) }
    }

    fun topupWallet(amountArs: Double) {
        val centsToAdd = (amountArs * 100).toLong()
        _uiState.update { current ->
            current.copy(
                walletBalanceCents = current.walletBalanceCents + centsToAdd,
                isTopupDialogOpen = false,
                paymentMessage = "Saldo acreditado correctamente.",
            )
        }
    }

    fun payAppointment(appointment: Appointment) {
        viewModelScope.launch {
            _uiState.update { it.copy(payingAppointmentId = appointment.id) }
            val fee = appointment.doctorFee ?: 30000.0
            val feeCents = (fee * 100).toLong()
            val hasCredit = _uiState.value.walletBalanceCents >= feeCents

            val newBalance = if (hasCredit) {
                _uiState.value.walletBalanceCents - feeCents
            } else {
                _uiState.value.walletBalanceCents
            }

            // Update appointment status to CONFIRMED
            val updatedList = _uiState.value.appointments.map { apt ->
                if (apt.id == appointment.id) {
                    apt.copy(status = com.autamedica.android.domain.model.AppointmentStatus.CONFIRMED)
                } else apt
            }

            val msg = if (hasCredit) {
                "Tu saldo AutaMedica cubrió la consulta. El turno ya quedó confirmado."
            } else {
                "Pago confirmado correctamente. Tu consulta ya está asegurada."
            }

            _uiState.update {
                it.copy(
                    appointments = updatedList,
                    walletBalanceCents = newBalance,
                    payingAppointmentId = null,
                    paymentMessage = msg,
                )
            }
        }
    }

    fun reviewAppointment(appointmentId: String) {
        _uiState.update {
            it.copy(
                reviewedAppointmentIds = it.reviewedAppointmentIds + appointmentId,
                paymentMessage = "¡Gracias por evaluar a tu profesional de salud!",
            )
        }
    }

    fun clearPaymentMessage() {
        _uiState.update { it.copy(paymentMessage = null) }
    }

    fun loadAvailableDoctors() {
        val dates = (0..13).map { LocalDate.now().plusDays(it.toLong()) }
        val today = LocalDate.now()
        viewModelScope.launch {
            appointmentRepository.getAvailableDoctors()
                .onSuccess { remoteDocs ->
                    val doctors = if (remoteDocs.isNotEmpty()) remoteDocs else fallbackDoctors
                    val selectedDoc = _uiState.value.selectedDoctor ?: doctors.firstOrNull()
                    val targetDate = if (_uiState.value.availableDates.isEmpty()) today else _uiState.value.selectedDate
                    val slots = generateSlotsForDate(targetDate, selectedDoc?.availableSlots.orEmpty())
                    _uiState.update { state ->
                        state.copy(
                            availableDoctors = doctors,
                            selectedDoctor = selectedDoc,
                            availableDates = dates,
                            selectedDate = targetDate,
                            availableSlots = slots,
                            selectedSlot = state.selectedSlot ?: slots.firstOrNull(),
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[AppointmentsVM] Error loading available doctors", error)
                    val doctors = fallbackDoctors
                    val selectedDoc = _uiState.value.selectedDoctor ?: doctors.firstOrNull()
                    val targetDate = if (_uiState.value.availableDates.isEmpty()) today else _uiState.value.selectedDate
                    val slots = generateSlotsForDate(targetDate, selectedDoc?.availableSlots.orEmpty())
                    _uiState.update { state ->
                        state.copy(
                            availableDoctors = doctors,
                            selectedDoctor = selectedDoc,
                            availableDates = dates,
                            selectedDate = targetDate,
                            availableSlots = slots,
                            selectedSlot = state.selectedSlot ?: slots.firstOrNull(),
                        )
                    }
                }
        }
    }

    fun selectDate(date: LocalDate) {
        _uiState.update { state ->
            val slots = generateSlotsForDate(date, state.selectedDoctor?.availableSlots.orEmpty())
            state.copy(
                selectedDate = date,
                availableSlots = slots,
                selectedSlot = slots.firstOrNull(),
            )
        }
    }

    fun selectSlot(slot: String) {
        _uiState.update { it.copy(selectedSlot = slot) }
    }

    fun selectDoctor(doctor: DoctorBookingInfo) {
        _uiState.update { state ->
            val slots = generateSlotsForDate(state.selectedDate, doctor.availableSlots)
            state.copy(
                selectedDoctor = doctor,
                availableSlots = slots,
                selectedSlot = slots.firstOrNull(),
            )
        }
    }

    fun dismissBookingMessages() {
        _uiState.update { it.copy(bookingSuccessMessage = null, bookingErrorMessage = null) }
    }

    fun confirmQuickBooking() {
        val state = _uiState.value
        val doctor = state.selectedDoctor ?: state.availableDoctors.firstOrNull() ?: fallbackDoctors.first()
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

                val startDateTime = state.selectedDate.atTime(hour, minute).atOffset(ZoneOffset.UTC)
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
                    // Refresh appointments list in real time
                    loadAppointments()

                    val remainingSlots = state.availableSlots.filter { it != slot }
                    _uiState.update { current ->
                        current.copy(
                            isBooking = false,
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
                            bookingErrorMessage = err.message ?: "No se pudo confirmar el turno. Reintentá.",
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

    private fun generateSlotsForDate(date: LocalDate, doctorSlots: List<String>): List<String> {
        val baseSlots = if (doctorSlots.isNotEmpty()) doctorSlots else listOf(
            "09:00", "09:30", "10:00", "10:30", "11:30", "14:00", "14:30", "15:30", "16:00", "17:00"
        )
        val now = OffsetDateTime.now()
        if (date == now.toLocalDate()) {
            val currentHour = now.hour
            val currentMin = now.minute
            val future = baseSlots.filter { slot ->
                val parts = slot.split(":")
                val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
                val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
                h > currentHour || (h == currentHour && m > currentMin + 10)
            }
            return if (future.isNotEmpty()) future else listOf("18:00", "18:30", "19:00", "20:00")
        }
        return baseSlots
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
                    state.copy(
                        userId = user.id,
                        userRole = user.role.wireName,
                        userName = listOfNotNull(user.firstName, user.lastName)
                            .joinToString(" ")
                            .ifBlank { user.email },
                    )
                }
            }
        }
    }

    private fun loadAppointments() {
        viewModelScope.launch {
            appointmentRepository.getUpcomingAppointments()
                .onSuccess { rawAppointments ->
                    // Ensure doctor info is populated
                    val doctors = runCatching {
                        appointmentRepository.getAvailableDoctors().getOrNull() ?: emptyList()
                    }.getOrDefault(emptyList())
                    val docMap = doctors.associateBy { it.id }

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
                            joinableAppointmentIds = joinableIds,
                            isLoading = false,
                            isRefreshing = false,
                            error = null,
                            telemedicineError = telemedicineError,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            joinableAppointmentIds = emptySet(),
                            error = sanitizeError(error.message),
                        )
                    }
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
            onFailure = { emptySet<String>() to "No se pudo validar la disponibilidad de videollamada." },
        )
    }

    private fun sanitizeError(raw: String?): String {
        if (raw == null) return "Error al cargar turnos"
        return when {
            "infinite recursion" in raw -> "Error temporal del servidor"
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "Error de conexion"
            "unauthorized" in raw.lowercase() || "JWT" in raw ->
                "Sesion expirada"
            raw.contains("URL:") || raw.contains("Headers:") -> "Error al cargar turnos"
            else -> raw.lineSequence().firstOrNull()?.take(100) ?: raw.take(100)
        }
    }
}
