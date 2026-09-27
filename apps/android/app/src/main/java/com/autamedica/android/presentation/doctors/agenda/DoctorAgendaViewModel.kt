package com.autamedica.android.presentation.doctors.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentTransitionRules
import com.autamedica.android.domain.model.DoctorAvailabilitySlot
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.OffsetDateTime
import javax.inject.Inject

enum class AgendaFilter(val label: String) {
    ALL("Todo"),
    TODAY("Hoy"),
    UPCOMING("Próximos"),
}

enum class SaveStatus {
    IDLE,
    SAVING,
    SAVED,
    ERROR,
}

data class DoctorAgendaUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val doctorId: String = "",
    val appointments: List<Appointment> = emptyList(),
    val patientNames: Map<String, String> = emptyMap(),
    val patientContexts: Map<String, PatientClinicalContext> = emptyMap(),
    val isContextLoading: Boolean = false,
    val availabilitySlots: List<DoctorAvailabilitySlot> = emptyList(),
    val isAvailabilityOpen: Boolean = false,
    val availabilitySaveStatus: SaveStatus = SaveStatus.IDLE,
    val availabilityError: String? = null,
    val selectedAppointment: Appointment? = null,
    val isDetailsSheetOpen: Boolean = false,
    val selectedFilter: AgendaFilter = AgendaFilter.ALL,
    val selectedDate: LocalDate = LocalDate.now(),
    val showWaffleCalendar: Boolean = false,
    val isTimelineView: Boolean = true,
    val isCreateSheetOpen: Boolean = false,
    val createSheetInitialTime: String = "09:00",
    val isSubmittingAppointment: Boolean = false,
    val doctorPatients: List<PatientSummary> = emptyList(),
    val error: String? = null,
) {
    val currentTurno: Appointment?
        get() {
            val today = LocalDate.now()
            val todayAppointments = appointments.filter { appt ->
                runCatching {
                    OffsetDateTime.parse(appt.startTime).toLocalDate() == today
                }.getOrDefault(false) &&
                    appt.status != AppointmentStatus.CANCELLED &&
                    appt.status != AppointmentStatus.COMPLETED &&
                    appt.status != AppointmentStatus.NO_SHOW
            }.sortedBy { it.startTime }

            val inProgress = todayAppointments.find { it.status == AppointmentStatus.IN_PROGRESS }
            if (inProgress != null) return inProgress

            val nowDt = OffsetDateTime.now()
            val upcoming = todayAppointments.find {
                runCatching {
                    OffsetDateTime.parse(it.startTime).isAfter(nowDt.minusMinutes(30))
                }.getOrDefault(false)
            }
            return upcoming ?: todayAppointments.firstOrNull()
        }

    val filteredAppointments: List<Appointment>
        get() {
            val nowDt = OffsetDateTime.now()
            val list = appointments.filter { appt ->
                runCatching {
                    OffsetDateTime.parse(appt.startTime).toLocalDate() == selectedDate
                }.getOrDefault(false)
            }

            return list.sortedWith { a, b ->
                val aSort = getAppointmentSortBucket(a, nowDt)
                val bSort = getAppointmentSortBucket(b, nowDt)
                if (aSort != bSort) aSort - bSort
                else a.startTime.compareTo(b.startTime)
            }
        }

    private fun getAppointmentSortBucket(appt: Appointment, nowDt: OffsetDateTime): Int {
        val startDt = runCatching { OffsetDateTime.parse(appt.startTime) }.getOrNull()
        val isFutureOrRecent = startDt?.isAfter(nowDt.minusMinutes(30)) ?: false

        return when {
            appt.status == AppointmentStatus.IN_PROGRESS -> 0
            (appt.status == AppointmentStatus.SCHEDULED || appt.status == AppointmentStatus.CONFIRMED) && isFutureOrRecent -> 1
            appt.status == AppointmentStatus.SCHEDULED || appt.status == AppointmentStatus.CONFIRMED -> 2
            appt.status == AppointmentStatus.CANCELLED || appt.status == AppointmentStatus.COMPLETED || appt.status == AppointmentStatus.NO_SHOW -> 4
            else -> 3
        }
    }
}

@HiltViewModel
class DoctorAgendaViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val doctorRepository: DoctorRepository,
    private val authRepository: AuthRepository,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorAgendaUiState())
    val uiState: StateFlow<DoctorAgendaUiState> = _uiState.asStateFlow()

    init {
        loadInitialData()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadAppointments()
        loadAvailability()
    }

    fun toggleAvailabilityOpen() {
        _uiState.update { it.copy(isAvailabilityOpen = !it.isAvailabilityOpen) }
    }

    fun addSlot(dayOfWeek: Int) {
        val newSlot = DoctorAvailabilitySlot(
            dayOfWeek = dayOfWeek,
            startTime = "09:00",
            endTime = "17:00",
            slotDuration = 30,
        )
        _uiState.update {
            it.copy(
                availabilitySlots = it.availabilitySlots + newSlot,
                availabilitySaveStatus = SaveStatus.IDLE,
                availabilityError = null,
            )
        }
    }

    fun removeSlot(index: Int) {
        _uiState.update {
            val updated = it.availabilitySlots.filterIndexed { i, _ -> i != index }
            it.copy(
                availabilitySlots = updated,
                availabilitySaveStatus = SaveStatus.IDLE,
            )
        }
    }

    fun updateSlot(index: Int, startTime: String, endTime: String) {
        _uiState.update { state ->
            val updated = state.availabilitySlots.mapIndexed { i, slot ->
                if (i == index) slot.copy(startTime = startTime, endTime = endTime)
                else slot
            }
            state.copy(
                availabilitySlots = updated,
                availabilitySaveStatus = SaveStatus.IDLE,
                availabilityError = null,
            )
        }
    }

    fun applyTemplate(template: String) {
        val days = listOf(1, 2, 3, 4, 5) // Lun-Vie
        val (start, end) = if (template == "weekdays_half") "08:00" to "13:00" else "09:00" to "18:00"
        val newSlots = days.map { d ->
            DoctorAvailabilitySlot(
                dayOfWeek = d,
                startTime = start,
                endTime = end,
                slotDuration = 30,
            )
        }
        _uiState.update {
            it.copy(
                availabilitySlots = newSlots,
                availabilitySaveStatus = SaveStatus.IDLE,
                availabilityError = null,
            )
        }
    }

    fun saveAvailability() {
        val slots = _uiState.value.availabilitySlots
        if (slots.isEmpty()) {
            _uiState.update { it.copy(availabilityError = "Agregá al menos un bloque horario") }
            return
        }

        // Validate start < end
        for (slot in slots) {
            if (slot.startTime >= slot.endTime) {
                _uiState.update {
                    it.copy(availabilityError = "La hora de inicio debe ser anterior a la de fin")
                }
                return
            }
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    availabilitySaveStatus = SaveStatus.SAVING,
                    availabilityError = null,
                )
            }

            val doctorId = _uiState.value.doctorId
            doctorRepository.saveDoctorAvailability(doctorId, slots)
                .onSuccess {
                    _uiState.update { it.copy(availabilitySaveStatus = SaveStatus.SAVED) }
                    delay(3000)
                    _uiState.update { it.copy(availabilitySaveStatus = SaveStatus.IDLE) }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            availabilitySaveStatus = SaveStatus.ERROR,
                            availabilityError = UiErrorMapper.map(error, "No se pudo guardar la disponibilidad"),
                        )
                    }
                }
        }
    }

    fun setFilter(filter: AgendaFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }

    fun selectDate(date: LocalDate?) {
        _uiState.update { it.copy(selectedDate = date ?: LocalDate.now()) }
    }

    fun toggleViewMode() {
        _uiState.update { it.copy(isTimelineView = !it.isTimelineView) }
    }

    fun openCreateAppointment(initialTime: String? = null) {
        _uiState.update {
            it.copy(
                isCreateSheetOpen = true,
                createSheetInitialTime = initialTime ?: "09:00",
            )
        }
        loadPatients()
    }

    fun closeCreateAppointment() {
        _uiState.update { it.copy(isCreateSheetOpen = false) }
    }

    fun createDoctorAppointment(
        patientId: String?,
        guestName: String?,
        guestPhone: String?,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?,
    ) {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank()) {
            SecureLog.error("[DoctorAgenda] doctorId is blank, cannot create appointment")
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingAppointment = true) }
            appointmentRepository.createDoctorAppointment(
                doctorId = doctorId,
                patientId = patientId,
                startTime = startTime,
                endTime = endTime,
                type = type,
                notes = reason,
                guestName = guestName,
                guestPhone = guestPhone,
            ).onSuccess {
                _uiState.update {
                    it.copy(
                        isSubmittingAppointment = false,
                        isCreateSheetOpen = false,
                    )
                }
                loadAppointments()
            }.onFailure { err ->
                SecureLog.error("[DoctorAgenda] Failed creating appointment", err)
                _uiState.update { it.copy(isSubmittingAppointment = false) }
            }
        }
    }

    fun loadPatients() {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || _uiState.value.doctorPatients.isNotEmpty()) return

        viewModelScope.launch {
            doctorRepository.getDoctorPatients(doctorId).onSuccess { patients ->
                _uiState.update { it.copy(doctorPatients = patients) }
            }
        }
    }

    fun toggleWaffleCalendar() {
        _uiState.update { it.copy(showWaffleCalendar = !it.showWaffleCalendar) }
    }

    fun selectAppointment(appointment: Appointment?) {
        _uiState.update {
            it.copy(
                selectedAppointment = appointment,
                isDetailsSheetOpen = appointment != null,
            )
        }
        if (appointment?.patientId != null) {
            loadPatientContext(appointment.patientId)
        }
    }

    fun closeDetailsSheet() {
        _uiState.update {
            it.copy(
                selectedAppointment = null,
                isDetailsSheetOpen = false,
            )
        }
    }

    fun updateAppointmentStatus(appointmentId: String, newStatus: AppointmentStatus) {
        viewModelScope.launch {
            val currentAppointment = _uiState.value.appointments.find { it.id == appointmentId }
            if (currentAppointment == null) {
                SecureLog.warn("[DoctorAgenda] Appointment $appointmentId not found in local list")
                return@launch
            }
            if (!AppointmentTransitionRules.isTransitionAllowed(currentAppointment.status, newStatus)) {
                SecureLog.warn("[DoctorAgenda] Invalid transition ${currentAppointment.status} -> $newStatus for $appointmentId")
                return@launch
            }
            appointmentRepository.updateAppointmentStatus(appointmentId, newStatus)
                .onSuccess {
                    _uiState.update { state ->
                        val updatedList = state.appointments.map { apt ->
                            if (apt.id == appointmentId) apt.copy(status = newStatus)
                            else apt
                        }
                        val updatedSelected = if (state.selectedAppointment?.id == appointmentId) {
                            state.selectedAppointment.copy(status = newStatus)
                        } else {
                            state.selectedAppointment
                        }
                        state.copy(
                            appointments = updatedList,
                            selectedAppointment = updatedSelected,
                        )
                    }
                }
                .onFailure { err ->
                    SecureLog.error("[DoctorAgenda] Failed updating appointment status", err)
                }
        }
    }

    fun getPatientName(appointment: Appointment): String {
        val notes = appointment.notes.orEmpty()
        if (appointment.patientId == null && notes.contains("[INVITADO:")) {
            val match = Regex("\\[INVITADO:\\s*([^\\]]+)\\]").find(notes)
            if (match != null) return match.groupValues[1].trim()
        }
        return _uiState.value.patientNames[appointment.id]
            ?: if (appointment.patientId != null) "Paciente Registrado" else "Invitado Externo"
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            // Resolve doctorId from user
            val user = authRepository.getCurrentUser()
            var doctorId = ""
            if (user != null) {
                doctorRepository.getDoctorProfile(user.id).onSuccess { profile ->
                    doctorId = profile.id
                }
            }

            if (doctorId.isBlank()) {
                doctorId = securePreferences.getString("cached_record_id").orEmpty()
            }

            _uiState.update { it.copy(doctorId = doctorId) }

            loadAppointments()
            if (doctorId.isNotBlank()) {
                loadAvailability()
            }
        }
    }

    private fun loadAppointments() {
        viewModelScope.launch {
            appointmentRepository.getUpcomingAppointments()
                .onSuccess { appts ->
                    // Resolve patient names
                    val patientIds = appts.mapNotNull { it.patientId }.distinct()
                    val resolvedNames = if (patientIds.isNotEmpty()) {
                        doctorRepository.resolvePatientNames(patientIds).getOrDefault(emptyMap())
                    } else emptyMap()

                    val nameMap = mutableMapOf<String, String>()
                    for (appt in appts) {
                        if (appt.patientId != null && resolvedNames.containsKey(appt.patientId)) {
                            nameMap[appt.id] = resolvedNames[appt.patientId].orEmpty()
                        } else if (appt.notes?.contains("[INVITADO:") == true) {
                            val match = Regex("\\[INVITADO:\\s*([^\\]]+)\\]").find(appt.notes)
                            if (match != null) {
                                nameMap[appt.id] = match.groupValues[1].trim()
                            }
                        }
                    }

                    _uiState.update {
                        it.copy(
                            appointments = appts,
                            patientNames = nameMap,
                            isLoading = false,
                            isRefreshing = false,
                            error = null,
                        )
                    }

                    // Pre-load context for hero current turno
                    _uiState.value.currentTurno?.patientId?.let { pid ->
                        loadPatientContext(pid)
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = UiErrorMapper.map(error, "No se pudo cargar la agenda médica"),
                        )
                    }
                }
        }
    }

    private fun loadAvailability() {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank()) return

        viewModelScope.launch {
            doctorRepository.getDoctorAvailability(doctorId)
                .onSuccess { slots ->
                    _uiState.update {
                        it.copy(
                            availabilitySlots = slots,
                            // Auto open if no real availability configured
                            isAvailabilityOpen = slots.isEmpty(),
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorAgenda] Failed loading availability", error)
                }
        }
    }

    private fun loadPatientContext(patientId: String) {
        if (_uiState.value.patientContexts.containsKey(patientId)) return

        viewModelScope.launch {
            _uiState.update { it.copy(isContextLoading = true) }
            doctorRepository.getPatientClinicalContext(patientId)
                .onSuccess { ctx ->
                    _uiState.update { state ->
                        state.copy(
                            patientContexts = state.patientContexts + (patientId to ctx),
                            isContextLoading = false,
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isContextLoading = false) }
                }
        }
    }
}
