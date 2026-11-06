package com.autamedica.android.presentation.consultation

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

@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationHubViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val fakeUser = User(
        id = "patient-1",
        email = "patient@test.com",
        role = UserRole.PATIENT,
        firstName = "Juan",
        lastName = "Pérez",
    )

    private val sampleDoctor = DoctorBookingInfo(
        id = "doc-1",
        userId = "u-doc-1",
        name = "Dr. Alejandro Rossi",
        specialty = "Medicina General",
        licenseNumber = "MN 145.890",
        consultationFee = 15000.0,
        availableSlots = listOf("10:00", "11:30"),
    )

    private val sampleAppointment = Appointment(
        id = "apt-1",
        patientId = "patient-1",
        doctorId = "doc-1",
        startTime = java.time.OffsetDateTime.now().plusMinutes(20).toString(),
        endTime = java.time.OffsetDateTime.now().plusMinutes(50).toString(),
        durationMinutes = 30,
        type = AppointmentType.TELEMEDICINE,
        status = AppointmentStatus.CONFIRMED,
        notes = "Consulta de control",
        meetingUrl = "https://meet.autamedica.com/apt-1",
        doctorName = "Dr. Alejandro Rossi",
        doctorSpecialty = "Medicina General",
        doctorFee = 15000.0,
    )

    private val samplePendingPayment = Appointment(
        id = "apt-pending",
        patientId = "patient-1",
        doctorId = "doc-1",
        startTime = java.time.OffsetDateTime.now().plusHours(2).toString(),
        endTime = java.time.OffsetDateTime.now().plusHours(2).plusMinutes(30).toString(),
        durationMinutes = 30,
        type = AppointmentType.TELEMEDICINE,
        status = AppointmentStatus.PAYMENT_PENDING,
        notes = "Turno pendiente de pago",
        meetingUrl = null,
        doctorName = "Dr. Alejandro Rossi",
        doctorSpecialty = "Medicina General",
        doctorFee = 15000.0,
    )

    private lateinit var fakeAuthRepo: FakeAuthRepo
    private lateinit var fakeAppointmentRepo: FakeAppointmentRepo
    private lateinit var fakeTelemedicineRepo: FakeTelemedicineRepo
    private lateinit var clinicStore: PatientClinicStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeAuthRepo = FakeAuthRepo(fakeUser)
        fakeAppointmentRepo = FakeAppointmentRepo(
            appointments = listOf(sampleAppointment, samplePendingPayment),
            doctors = listOf(sampleDoctor),
        )
        fakeTelemedicineRepo = FakeTelemedicineRepo(
            joinableIds = setOf("apt-1"),
        )
        clinicStore = PatientClinicStore(fakeAppointmentRepo, fakeTelemedicineRepo, testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): ConsultationHubViewModel =
        ConsultationHubViewModel(clinicStore, fakeAppointmentRepo)

    @Test
    fun `initial load classifies active and pending payment appointments`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.activeTelemedicineAppointment?.id).isEqualTo("apt-1")
        assertThat(state.pendingPaymentAppointment?.id).isEqualTo("apt-pending")
        assertThat(state.availableDoctors).isNotEmpty()
    }

    @Test
    fun `payAppointment leaves appointment pending without verified payment provider`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.payAppointment(samplePendingPayment)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.pendingPaymentAppointment?.id).isEqualTo("apt-pending")
        assertThat(state.paymentMessage).contains("No se pudo iniciar el proceso de pago")
    }

    // ── FAKES ──

    private class FakeAuthRepo(private val user: User?) : AuthRepository {
        override fun observeSession(): Flow<User?> = flowOf(user)
        override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
            user?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
        override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
            user?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
        override suspend fun register(email: String, password: String, selectedRole: UserRole) =
            Result.success(com.autamedica.android.domain.repository.UserRegistrationResult(user, false))
        override suspend fun logout() {}
        override suspend fun getCurrentUser(): User? = user
    }

    private class FakeAppointmentRepo(
        private val appointments: List<Appointment>,
        private val doctors: List<DoctorBookingInfo>,
        private val bookAppointmentReturnsError: Boolean = false,
    ) : AppointmentRepository {
        override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = Result.success(appointments)
        override suspend fun getAppointmentById(id: String): Result<Appointment> =
            appointments.firstOrNull { it.id == id }?.let { Result.success(it) }
                ?: Result.failure(Exception("Not found"))
        override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
        override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
        override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = Result.success(doctors)
        override suspend fun bookAppointment(
            doctorId: String,
            startTime: String,
            endTime: String,
            type: String,
            reason: String?,
        ): Result<Appointment> {
            if (bookAppointmentReturnsError) {
                return Result.failure(Exception("Booking service unavailable"))
            }
            return Result.success(
                Appointment(
                    id = "booked-${System.currentTimeMillis()}",
                    patientId = "patient-1",
                    doctorId = doctorId,
                    startTime = startTime,
                    endTime = endTime,
                    durationMinutes = 30,
                    type = AppointmentType.TELEMEDICINE,
                    status = AppointmentStatus.CONFIRMED,
                    notes = reason,
                    meetingUrl = "https://meet.autamedica.com/booked",
                )
            )
        }
    }

    private class FakeTelemedicineRepo(private val joinableIds: Set<String>) : TelemedicineRepository {
        override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> =
            Result.failure(Exception("Not implemented"))
        override suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>> =
            Result.success(joinableIds)
        override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = Result.success(Unit)
    }
}