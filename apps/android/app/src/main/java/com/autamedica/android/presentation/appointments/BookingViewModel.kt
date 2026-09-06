package com.autamedica.android.presentation.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.repository.AppointmentRepository
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
import javax.inject.Inject

data class BookingUiState(
    val specialties: List<String> = listOf(
        "Todas",
        "Medicina General",
        "Cardiología",
        "Pediatría",
        "Neurología",
        "Dermatología",
        "Traumatología",
        "Ginecología",
    ),
    val selectedSpecialty: String = "Todas",
    val doctorsList: List<DoctorBookingInfo> = emptyList(),
    val allDoctors: List<DoctorBookingInfo> = emptyList(),
    val selectedDoctor: DoctorBookingInfo? = null,
    val availableDates: List<LocalDate> = (0..6).map { LocalDate.now().plusDays(it.toLong()) },
    val selectedDate: LocalDate = LocalDate.now(),
    val availableSlots: List<String> = emptyList(),
    val selectedSlot: String? = null,
    val reasonText: String = "",
    val isLoadingDoctors: Boolean = false,
    val isBooking: Boolean = false,
    val bookingSuccess: Boolean = false,
    val bookedAppointment: Appointment? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BookingUiState())
    val uiState: StateFlow<BookingUiState> = _uiState.asStateFlow()

    private val fallbackDoctors = listOf(
        DoctorBookingInfo(
            id = "doc-valeria-torres",
            userId = "user-valeria-torres",
            name = "Dra. Valeria Torres",
            specialty = "Medicina General",
            licenseNumber = "MN 152.341",
            consultationFee = 12000.0,
            avatarUrl = null,
            availableSlots = listOf("09:00", "10:00", "11:30", "14:00", "15:30", "17:00"),
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
        loadDoctors()
    }

    fun loadDoctors() {
        _uiState.update { it.copy(isLoadingDoctors = true, errorMessage = null) }
        viewModelScope.launch {
            appointmentRepository.getAvailableDoctors()
                .onSuccess { remoteDoctors ->
                    val doctors = if (remoteDoctors.isNotEmpty()) remoteDoctors else fallbackDoctors
                    val initialDoctor = doctors.firstOrNull()
                    val slots = generateSlotsForDate(_uiState.value.selectedDate, initialDoctor?.availableSlots.orEmpty())

                    _uiState.update { state ->
                        state.copy(
                            allDoctors = doctors,
                            doctorsList = filterDoctors(doctors, state.selectedSpecialty),
                            selectedDoctor = initialDoctor,
                            availableSlots = slots,
                            selectedSlot = slots.firstOrNull(),
                            isLoadingDoctors = false,
                            errorMessage = null,
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[BookingVM] Error fetching doctors, using fallback", error)
                    val doctors = fallbackDoctors
                    val initialDoctor = doctors.firstOrNull()
                    val slots = generateSlotsForDate(_uiState.value.selectedDate, initialDoctor?.availableSlots.orEmpty())

                    _uiState.update { state ->
                        state.copy(
                            allDoctors = doctors,
                            doctorsList = filterDoctors(doctors, state.selectedSpecialty),
                            selectedDoctor = initialDoctor,
                            availableSlots = slots,
                            selectedSlot = slots.firstOrNull(),
                            isLoadingDoctors = false,
                        )
                    }
                }
        }
    }

    fun selectSpecialty(specialty: String) {
        _uiState.update { state ->
            val filtered = filterDoctors(state.allDoctors, specialty)
            val newSelectedDoctor = filtered.firstOrNull()
            val slots = generateSlotsForDate(state.selectedDate, newSelectedDoctor?.availableSlots.orEmpty())

            state.copy(
                selectedSpecialty = specialty,
                doctorsList = filtered,
                selectedDoctor = newSelectedDoctor,
                availableSlots = slots,
                selectedSlot = slots.firstOrNull(),
            )
        }
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

    fun onReasonChanged(reason: String) {
        _uiState.update { it.copy(reasonText = reason) }
    }

    fun confirmBooking() {
        val state = _uiState.value
        val doctor = state.selectedDoctor ?: run {
            _uiState.update { it.copy(errorMessage = "Selecciona un profesional para agendar.") }
            return
        }
        val slot = state.selectedSlot ?: run {
            _uiState.update { it.copy(errorMessage = "Selecciona un horario disponible.") }
            return
        }

        _uiState.update { it.copy(isBooking = true, errorMessage = null) }

        viewModelScope.launch {
            try {
                val timeParts = slot.split(":")
                val hour = timeParts.getOrNull(0)?.toIntOrNull() ?: 9
                val minute = timeParts.getOrNull(1)?.toIntOrNull() ?: 0

                val startDateTime = state.selectedDate.atTime(hour, minute).atOffset(ZoneOffset.UTC)
                val endDateTime = startDateTime.plusMinutes(45)

                val startTimeIso = startDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                val endTimeIso = endDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

                val reason = state.reasonText.trim().ifBlank {
                    "Videoconsulta de ${doctor.specialty} con ${doctor.name}"
                }

                appointmentRepository.bookAppointment(
                    doctorId = doctor.id,
                    startTime = startTimeIso,
                    endTime = endTimeIso,
                    type = "telemedicine",
                    reason = reason,
                ).onSuccess { appointment ->
                    _uiState.update {
                        it.copy(
                            isBooking = false,
                            bookingSuccess = true,
                            bookedAppointment = appointment,
                            errorMessage = null,
                        )
                    }
                }.onFailure { error ->
                    SecureLog.error("[BookingVM] Failed booking appointment", error)
                    _uiState.update {
                        it.copy(
                            isBooking = false,
                            errorMessage = error.message ?: "No se pudo agendar el turno. Intenta de nuevo.",
                        )
                    }
                }
            } catch (e: Exception) {
                SecureLog.error("[BookingVM] Unexpected booking error", e)
                _uiState.update {
                    it.copy(
                        isBooking = false,
                        errorMessage = "Ocurrió un error inesperado al procesar la reserva.",
                    )
                }
            }
        }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(bookingSuccess = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun filterDoctors(doctors: List<DoctorBookingInfo>, specialty: String): List<DoctorBookingInfo> {
        if (specialty.equals("Todas", ignoreCase = true)) return doctors
        return doctors.filter { it.specialty.contains(specialty, ignoreCase = true) }
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
                h > currentHour || (h == currentHour && m > currentMin + 15)
            }
            return if (future.isNotEmpty()) future else listOf("18:00", "18:30", "19:00")
        }
        return baseSlots
    }
}
