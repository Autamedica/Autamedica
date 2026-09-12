package com.autamedica.android.data.repository

import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

data class PatientClinicData(
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val telemedicineError: String? = null,
)

/**
 * Fuente única de datos de clínica del paciente, compartida entre los tabs
 * Agenda (AppointmentsScreen) y Consultar (ConsultationHubScreen).
 *
 * Deduplica el fetch: ambos tabs consumen el mismo StateFlow y un solo
 * refresh refresca los dos, sin peticiones duplicadas a la red.
 */
@Singleton
class PatientClinicStore @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val telemedicineRepository: TelemedicineRepository,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    private val _data = MutableStateFlow(PatientClinicData())
    val data: StateFlow<PatientClinicData> = _data.asStateFlow()

    private val storeScope = CoroutineScope(SupervisorJob() + ioDispatcher)
    private val refreshMutex = Mutex()
    private var refreshJob: Job? = null

    init {
        refresh()
    }

    /**
     * Refresca los datos compartidos. Asegura que solo una operación de refresh
     * esté activa a la vez (un pull-to-refresh en cualquier tab actualiza ambos).
     */
    fun refresh() {
        if (refreshJob?.isActive == true) return
        refreshJob = storeScope.launch {
            refreshMutex.withLock {
                _data.update {
                    it.copy(
                        isRefreshing = true,
                        isLoading = it.appointments.isEmpty() && it.availableDoctors.isEmpty(),
                    )
                }

                val rawDoctors = appointmentRepository.getAvailableDoctors().getOrNull() ?: emptyList()
                val docMap = rawDoctors.associateBy { it.id }

                appointmentRepository.getUpcomingAppointments()
                    .onSuccess { rawAppointments ->
                        val appointments = rawAppointments.map { apt ->
                            if (apt.doctorName == null && apt.doctorId != null) {
                                docMap[apt.doctorId]?.let { doc ->
                                    apt.copy(
                                        doctorName = doc.name,
                                        doctorSpecialty = doc.specialty,
                                        doctorAvatarUrl = doc.avatarUrl,
                                        doctorFee = doc.consultationFee,
                                    )
                                } ?: apt
                            } else apt
                        }

                        val (joinableIds, telemedicineError) = resolveJoinableAppointmentIds(appointments)

                        _data.update {
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
                    }
                    .onFailure { err ->
                        _data.update {
                            it.copy(
                                availableDoctors = rawDoctors,
                                isLoading = false,
                                isRefreshing = false,
                                error = sanitizeError(err.message),
                                telemedicineError = "No se pudieron cargar tus turnos. Reintentá.",
                            )
                        }
                    }
            }
        }
    }

    /**
     * Aplica una mutación local al estado compartido sin disparar un fetch completo.
     */
    fun applyMutation(transform: (PatientClinicData) -> PatientClinicData) {
        _data.update(transform)
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
        if (raw == null) return "Error desconocido"
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