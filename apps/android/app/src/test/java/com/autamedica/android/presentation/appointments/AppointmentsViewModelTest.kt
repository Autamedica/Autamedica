package com.autamedica.android.presentation.appointments

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
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

private class TestAppointmentRepository : AppointmentRepository {
    var upcomingAppointmentsResult: Result<List<Appointment>> = Result.success(emptyList())
    var availableDoctorsResult: Result<List<DoctorBookingInfo>> = Result.success(emptyList())
    var bookAppointmentResult: Result<Appointment>? = null
    var lastBookedDoctorId: String? = null
    var lastBookedStartTime: String? = null

    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = upcomingAppointmentsResult
    override suspend fun getAppointmentById(id: String): Result<Appointment> = Result.failure(NotImplementedError())
    override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
    override suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> = Result.success(Unit)
    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
    override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = availableDoctorsResult

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

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var appointmentRepository: TestAppointmentRepository
    private lateinit var authRepository: TestAuthRepository
    private lateinit var telemedicineRepository: TestTelemedicineRepository
    private lateinit var viewModel: AppointmentsViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        appointmentRepository = TestAppointmentRepository()
        authRepository = TestAuthRepository()
        telemedicineRepository = TestTelemedicineRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initializes with available dates, doctors, and slots ready for quick booking`() = runTest {
        viewModel = AppointmentsViewModel(appointmentRepository, authRepository, telemedicineRepository)

        val state = viewModel.uiState.value
        assertThat(state.availableDates).isNotEmpty()
        assertThat(state.availableDoctors).isNotEmpty()
        assertThat(state.selectedDoctor).isNotNull()
        assertThat(state.availableSlots).isNotEmpty()
        assertThat(state.selectedSlot).isNotNull()
    }

    @Test
    fun `selecting another date updates slots and auto-selects first slot`() = runTest {
        viewModel = AppointmentsViewModel(appointmentRepository, authRepository, telemedicineRepository)

        val tomorrow = LocalDate.now().plusDays(1)
        viewModel.selectDate(tomorrow)

        val state = viewModel.uiState.value
        assertThat(state.selectedDate).isEqualTo(tomorrow)
        assertThat(state.availableSlots).isNotEmpty()
        assertThat(state.selectedSlot).isEqualTo(state.availableSlots.first())
    }

    @Test
    fun `confirmQuickBooking creates appointment and sets success message`() = runTest {
        viewModel = AppointmentsViewModel(appointmentRepository, authRepository, telemedicineRepository)

        val selectedSlot = viewModel.uiState.value.selectedSlot
        assertThat(selectedSlot).isNotNull()

        viewModel.confirmQuickBooking()

        val state = viewModel.uiState.value
        assertThat(state.isBooking).isFalse()
        assertThat(state.bookingSuccessMessage).isNotNull()
        assertThat(state.bookingErrorMessage).isNull()
        assertThat(appointmentRepository.lastBookedDoctorId).isEqualTo(state.selectedDoctor?.id)
    }

    @Test
    fun `dismissBookingMessages clears message banners`() = runTest {
        viewModel = AppointmentsViewModel(appointmentRepository, authRepository, telemedicineRepository)
        viewModel.confirmQuickBooking()

        assertThat(viewModel.uiState.value.bookingSuccessMessage).isNotNull()
        viewModel.dismissBookingMessages()
        assertThat(viewModel.uiState.value.bookingSuccessMessage).isNull()
    }
}
