package com.autamedica.android.presentation.appointments

import com.autamedica.android.data.repository.PatientClinicStore
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
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

private class TestAppointmentRepository : AppointmentRepository {
    var upcomingAppointmentsResult: Result<List<Appointment>> = Result.success(emptyList())
    var availableDoctorsResult: Result<List<DoctorBookingInfo>> = Result.success(
        listOf(
            DoctorBookingInfo(
                id = "doc-1",
                userId = "user-doc-1",
                name = "Dra. Sofía Martínez",
                specialty = "Medicina General",
                licenseNumber = "MN 12345",
                subspecialty = "Atención Primaria",
                avatarUrl = null,
                consultationFee = 15000.0,
            )
        )
    )
    var availableSlotsResult: Result<List<String>> = Result.success(listOf("09:00", "10:00", "11:00"))
    var bookAppointmentResult: Result<Appointment>? = null
    var lastBookedDoctorId: String? = null
    var lastBookedStartTime: String? = null

    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = upcomingAppointmentsResult
    override suspend fun getAppointmentById(id: String): Result<Appointment> = Result.failure(NotImplementedError())
    override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
    override suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> = Result.success(Unit)
    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
    override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = availableDoctorsResult
    override suspend fun getAvailableSlots(doctorId: String, date: String): Result<List<String>> = availableSlotsResult

    override suspend fun bookAppointment(
        doctorId: String,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?
    ): Result<Appointment> {
        lastBookedDoctorId = doctorId
        lastBookedStartTime = startTime
        return bookAppointmentResult ?: Result.success(
            Appointment(
                id = "apt-new-123",
                patientId = "patient-1",
                doctorId = doctorId,
                startTime = startTime,
                endTime = endTime,
                durationMinutes = 45,
                type = AppointmentType.TELEMEDICINE,
                status = AppointmentStatus.SCHEDULED,
                notes = reason,
                meetingUrl = "room-test",
            )
        )
    }
}

private class TestAuthRepository : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(null)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> = Result.failure(NotImplementedError())
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> = Result.failure(NotImplementedError())
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> = Result.failure(NotImplementedError())
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = User(
        id = "user-123",
        email = "paciente@autamedica.com",
        role = UserRole.PATIENT,
        firstName = "Juan",
        lastName = "Pérez",
    )
}

private class TestTelemedicineRepository : TelemedicineRepository {
    override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> = Result.failure(NotImplementedError())
    override suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>> = Result.success(emptySet())
    override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = Result.success(Unit)
}

@OptIn(ExperimentalCoroutinesApi::class)
class AppointmentsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var appointmentRepository: TestAppointmentRepository
    private lateinit var authRepository: TestAuthRepository
    private lateinit var telemedicineRepository: TestTelemedicineRepository
    private lateinit var clinicStore: PatientClinicStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        appointmentRepository = TestAppointmentRepository()
        authRepository = TestAuthRepository()
        telemedicineRepository = TestTelemedicineRepository()
        clinicStore = PatientClinicStore(appointmentRepository, telemedicineRepository, testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): AppointmentsViewModel =
        AppointmentsViewModel(clinicStore, appointmentRepository, authRepository)

    @Test
    fun `initializes with available dates and doctors, selectedDoctor is null by default`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.availableDates).isNotEmpty()
        assertThat(state.availableDoctors).isNotEmpty()
        assertThat(state.selectedDoctor).isNull()
        assertThat(state.isBookingExpanded).isFalse()
    }

    @Test
    fun `selecting a doctor loads available slots from repository`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val doctor = viewModel.uiState.value.availableDoctors.first()
        viewModel.selectDoctor(doctor)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.selectedDoctor).isEqualTo(doctor)
        assertThat(state.availableSlots).containsExactly("09:00", "10:00", "11:00")
        assertThat(state.selectedSlot).isEqualTo("09:00")
    }

    @Test
    fun `selecting another date updates slots from backend`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()
        val doctor = viewModel.uiState.value.availableDoctors.first()
        viewModel.selectDoctor(doctor)
        advanceUntilIdle()

        val tomorrow = LocalDate.now().plusDays(1)
        viewModel.selectDate(tomorrow)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.selectedDate).isEqualTo(tomorrow)
        assertThat(state.availableSlots).isNotEmpty()
        assertThat(state.selectedSlot).isEqualTo(state.availableSlots.first())
    }

    @Test
    fun `toggleBookingSection expands and collapses booking section`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()
        assertThat(viewModel.uiState.value.isBookingExpanded).isFalse()

        viewModel.toggleBookingSection()
        assertThat(viewModel.uiState.value.isBookingExpanded).isTrue()

        viewModel.toggleBookingSection()
        assertThat(viewModel.uiState.value.isBookingExpanded).isFalse()
    }

    @Test
    fun `confirmQuickBooking creates appointment and collapses booking section`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()
        viewModel.toggleBookingSection()
        val doctor = viewModel.uiState.value.availableDoctors.first()
        viewModel.selectDoctor(doctor)
        advanceUntilIdle()

        val selectedSlot = viewModel.uiState.value.selectedSlot
        assertThat(selectedSlot).isNotNull()

        viewModel.confirmQuickBooking()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isBooking).isFalse()
        assertThat(state.bookingSuccessMessage).isNotNull()
        assertThat(state.bookingErrorMessage).isNull()
        assertThat(state.isBookingExpanded).isFalse()
        assertThat(appointmentRepository.lastBookedDoctorId).isEqualTo(doctor.id)
    }

    @Test
    fun `confirmQuickBooking fails if no doctor is selected`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()
        assertThat(viewModel.uiState.value.selectedDoctor).isNull()

        viewModel.confirmQuickBooking()

        val state = viewModel.uiState.value
        assertThat(state.bookingErrorMessage).isNotNull()
        assertThat(state.bookingSuccessMessage).isNull()
    }

    @Test
    fun `dismissBookingMessages clears message banners`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()
        val doctor = viewModel.uiState.value.availableDoctors.first()
        viewModel.selectDoctor(doctor)
        advanceUntilIdle()
        viewModel.confirmQuickBooking()
        advanceUntilIdle()

        assertThat(viewModel.uiState.value.bookingSuccessMessage).isNotNull()
        viewModel.dismissBookingMessages()
        assertThat(viewModel.uiState.value.bookingSuccessMessage).isNull()
    }
}