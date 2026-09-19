package com.autamedica.android.presentation.doctors.agenda

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorAvailabilitySlot
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.PharmacyOnDemandRepository
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorAgendaViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val appointmentRepository = object : AppointmentRepository {
        var createDoctorAppointmentCalled = false
        var lastCreatedNotes: String? = null
        val appointments = mutableListOf<Appointment>()

        override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = Result.success(appointments)
        override suspend fun getAppointmentById(id: String): Result<Appointment> = Result.failure(NotImplementedError())
        override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
        override suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> {
            val idx = appointments.indexOfFirst { it.id == id }
            if (idx >= 0) {
                appointments[idx] = appointments[idx].copy(status = status)
            }
            return Result.success(Unit)
        }
        override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
        override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = Result.success(emptyList())
        override suspend fun bookAppointment(
            doctorId: String,
            startTime: String,
            endTime: String,
            type: String,
            reason: String?,
        ): Result<Appointment> = Result.failure(NotImplementedError())

        override suspend fun createDoctorAppointment(
            doctorId: String,
            patientId: String?,
            startTime: String,
            endTime: String,
            type: String,
            notes: String?,
            guestName: String?,
            guestPhone: String?,
        ): Result<Appointment> {
            createDoctorAppointmentCalled = true
            lastCreatedNotes = notes
            val created = Appointment(
                id = "created-appt-1",
                patientId = patientId,
                doctorId = doctorId,
                startTime = startTime,
                endTime = endTime,
                durationMinutes = 30,
                type = AppointmentType.TELEMEDICINE,
                status = AppointmentStatus.CONFIRMED,
                notes = notes,
                meetingUrl = "room-123",
            )
            appointments.add(created)
            return Result.success(created)
        }
    }

    private val doctorRepository = object : DoctorRepository {
        override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> = Result.success(
            DoctorProfile(
                id = "doc-profile-1",
                userId = userId,
                specialty = "Cardiología",
                licenseNumber = "MN 54321",
            )
        )
        override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = Result.success(
            DoctorStats(todayAppointments = 2, pendingAppointments = 1, completedToday = 1, totalPatients = 10, weeklyAppointments = 5, cancelledToday = 0)
        )
        override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> = Result.success(
            listOf(
                PatientSummary(id = "pat-1", userId = "u-1", firstName = "Carlos", lastName = "Pérez"),
                PatientSummary(id = "pat-2", userId = "u-2", firstName = "Ana", lastName = "Gómez"),
            )
        )
        override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> = Result.failure(NotImplementedError())
        override suspend fun getDoctorAvailability(doctorId: String): Result<List<DoctorAvailabilitySlot>> = Result.success(emptyList())
        override suspend fun saveDoctorAvailability(doctorId: String, slots: List<DoctorAvailabilitySlot>): Result<Unit> = Result.success(Unit)
        override suspend fun getPatientClinicalContext(patientId: String): Result<PatientClinicalContext> = Result.success(PatientClinicalContext())
        override suspend fun resolvePatientNames(patientIds: List<String>): Result<Map<String, String>> = Result.success(
            mapOf("pat-1" to "Carlos Pérez", "pat-2" to "Ana Gómez")
        )
    }

    private val authRepository: AuthRepository = mockk(relaxed = true) {
        coEvery { getCurrentUser() } returns User(id = "user-1", email = "doctor@autamedica.com", role = UserRole.DOCTOR)
    }

    private val securePreferences: SecurePreferences = mockk(relaxed = true) {
        every { getString("cached_record_id") } returns "doc-profile-1"
    }

    private val pharmacyOnDemandRepository: PharmacyOnDemandRepository = mockk(relaxed = true) {
        every { observeOnDutyState() } returns flowOf(DoctorOnDutyPharmacyState())
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state defaults to timeline view and today selected`() = runTest {
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = pharmacyOnDemandRepository,
        )
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isTimelineView).isTrue()
        assertThat(state.selectedDate).isEqualTo(LocalDate.now())
        assertThat(state.doctorId).isEqualTo("doc-profile-1")
    }

    @Test
    fun `toggleViewMode switches between timeline and list view`() = runTest {
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = pharmacyOnDemandRepository,
        )
        advanceUntilIdle()

        assertThat(viewModel.uiState.value.isTimelineView).isTrue()

        viewModel.toggleViewMode()
        assertThat(viewModel.uiState.value.isTimelineView).isFalse()

        viewModel.toggleViewMode()
        assertThat(viewModel.uiState.value.isTimelineView).isTrue()
    }

    @Test
    fun `selectDate updates selectedDate in uiState`() = runTest {
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = pharmacyOnDemandRepository,
        )
        advanceUntilIdle()

        val tomorrow = LocalDate.now().plusDays(1)
        viewModel.selectDate(tomorrow)
        assertThat(viewModel.uiState.value.selectedDate).isEqualTo(tomorrow)
    }

    @Test
    fun `openCreateAppointment and closeCreateAppointment manage sheet state`() = runTest {
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = pharmacyOnDemandRepository,
        )
        advanceUntilIdle()

        viewModel.openCreateAppointment("14:30")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isCreateSheetOpen).isTrue()
        assertThat(state.createSheetInitialTime).isEqualTo("14:30")
        assertThat(state.doctorPatients).hasSize(2)

        viewModel.closeCreateAppointment()
        assertThat(viewModel.uiState.value.isCreateSheetOpen).isFalse()
    }

    @Test
    fun `createDoctorAppointment calls repository and closes sheet on success`() = runTest {
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = pharmacyOnDemandRepository,
        )
        advanceUntilIdle()

        viewModel.openCreateAppointment("10:00")
        advanceUntilIdle()

        viewModel.createDoctorAppointment(
            patientId = "pat-1",
            guestName = null,
            guestPhone = null,
            startTime = "2026-09-12T10:00:00Z",
            endTime = "2026-09-12T10:30:00Z",
            type = "telemedicine",
            reason = "Chequeo de rutina",
        )
        advanceUntilIdle()

        assertThat(appointmentRepository.createDoctorAppointmentCalled).isTrue()
        assertThat(viewModel.uiState.value.isCreateSheetOpen).isFalse()
        assertThat(viewModel.uiState.value.appointments).hasSize(1)
        assertThat(viewModel.uiState.value.appointments.first().id).isEqualTo("created-appt-1")
    }

    @Test
    fun `observes pharmacy on duty state correctly`() = runTest {
        val onDutyRepo: PharmacyOnDemandRepository = mockk(relaxed = true) {
            every { observeOnDutyState() } returns flowOf(
                DoctorOnDutyPharmacyState(isOnDuty = true, waitingQueueCount = 3)
            )
        }
        val viewModel = DoctorAgendaViewModel(
            appointmentRepository = appointmentRepository,
            doctorRepository = doctorRepository,
            authRepository = authRepository,
            securePreferences = securePreferences,
            pharmacyOnDemandRepository = onDutyRepo,
        )
        advanceUntilIdle()

        assertThat(viewModel.uiState.value.pharmacyOnDutyState.isOnDuty).isTrue()
        assertThat(viewModel.uiState.value.pharmacyOnDutyState.waitingQueueCount).isEqualTo(3)
    }
}
