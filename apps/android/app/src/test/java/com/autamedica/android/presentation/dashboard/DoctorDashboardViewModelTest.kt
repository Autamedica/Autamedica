package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.DoctorGuardApproval
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.RequestStatusResponse
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.autamedica.android.util.ConnectivityObserver
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

private class FakeAuthRepo(
    private val currentUser: User? = User(
        id = "user-123",
        email = "doctor@autamedica.com",
        firstName = "Dr. Eduardo",
        lastName = "Marques",
        role = UserRole.DOCTOR,
    ),
) : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(currentUser)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> = Result.success(currentUser!!)
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> = Result.success(currentUser!!)
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.success(UserRegistrationResult(user = currentUser, requiresEmailConfirmation = false))
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = currentUser
}

private class FakeDoctorRepo : DoctorRepository {
    override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> = Result.success(
        DoctorProfile(
            id = "doctor-456",
            userId = userId,
            specialty = "Cardiología",
            licenseNumber = "MN-12345",
        )
    )
    override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = Result.success(DoctorStats())
    override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> = Result.success(emptyList())
    override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> = Result.failure(NotImplementedError())
}

private class FakeAppointmentRepo : AppointmentRepository {
    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = Result.success(emptyList())
    override suspend fun getAppointmentById(id: String): Result<Appointment> = Result.failure(NotImplementedError())
    override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
    override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = Result.success(emptyList())
    override suspend fun bookAppointment(
        doctorId: String,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?
    ): Result<Appointment> = Result.failure(NotImplementedError())
}

private class FakeTelemedicineRepo : TelemedicineRepository {
    override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> = Result.failure(NotImplementedError())
    override suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>> = Result.success(emptySet())
    override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = Result.success(Unit)
}

private class FakeChatRepo : ChatRepository {
    override fun observeChats(): Flow<List<MedicalChat>> = flowOf(emptyList())
    override fun observeMessages(chatId: String): Flow<List<MedicalMessage>> = flowOf(emptyList())
    override suspend fun sendMessage(chatId: String, content: String, contentType: String): Result<Unit> = Result.success(Unit)
    override suspend fun markAsRead(chatId: String): Result<Unit> = Result.success(Unit)
    override suspend fun getTotalUnreadCount(): Result<Int> = Result.success(0)
    override suspend fun cleanup() {}
}

private class FakePharmacyDispatchRepo : PharmacyDispatchRepository {
    // These fixtures represent an administratively APPROVED clinical doctor.
    // Unapproved doctors must fail closed in production.
    override suspend fun getMyGuardApproval(): Result<DoctorGuardApproval> =
        Result.success(DoctorGuardApproval(
            approved = true,
            code = "CLINICALLY_APPROVED",
            country = "AR",
            verificationStatus = "valid",
        ))

    var dutyStatus = DoctorDutyStatus(
        doctorId = "doctor-456",
        isOnDuty = true,
        activeTiers = listOf("general"),
        currentActiveRequestId = null,
    )
    val heartbeatInvocations = mutableListOf<Long>()
    var heartbeatResponse: Result<Unit> = Result.success(Unit)
    val searchingRequestsFlow = MutableStateFlow<List<PharmacyDispatchRequest>>(emptyList())
    val declinedOfferIds = mutableListOf<String>()
    override suspend fun declinePharmacyOffer(offerId: String): Result<Boolean> {
        declinedOfferIds += offerId
        return Result.success(true)
    }

    override suspend fun getDoctorDutyStatus(doctorId: String): Result<DoctorDutyStatus> = Result.success(dutyStatus)
    override suspend fun setDoctorDutyStatus(doctorId: String, isOnDuty: Boolean, activeTiers: List<String>): Result<Unit> {
        dutyStatus = dutyStatus.copy(isOnDuty = isOnDuty, activeTiers = activeTiers)
        return Result.success(Unit)
    }
    override suspend fun sendDoctorHeartbeat(doctorId: String): Result<Unit> {
        heartbeatInvocations.add(System.currentTimeMillis())
        return heartbeatResponse
    }
    override fun observeSearchingRequests(): StateFlow<List<PharmacyDispatchRequest>> = searchingRequestsFlow.asStateFlow()
    override fun observeIncomingOffers(): StateFlow<List<PharmacyDispatchRequest>> = searchingRequestsFlow.asStateFlow()
    override val incomingOffers: StateFlow<List<PharmacyDispatchRequest>> get() = searchingRequestsFlow.asStateFlow()
    override suspend fun claimPharmacyRequest(requestId: String, doctorId: String): Result<com.autamedica.android.domain.model.DispatchClaimResult> =
        Result.success(com.autamedica.android.domain.model.DispatchClaimResult(success = true, code = "CLAIM_SUCCESS", cloudflareRoomId = "room-$requestId"))
    override suspend fun updateDispatchRequestStatus(requestId: String, status: String): Result<Unit> = Result.success(Unit)
    override suspend fun finishPharmacyRequest(doctorId: String, requestId: String): Result<Unit> = Result.success(Unit)
    override suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String?,
        careCountry: String?,
        referralCode: String?,
    ): Result<PharmacyDispatchRequest> = Result.failure(NotImplementedError())
    override fun observePatientRequest(requestId: String): Flow<PharmacyDispatchRequest> = flowOf()
    override suspend fun getActiveOnDutyDoctors(): Result<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> = Result.success(emptyList())
    override fun observeActiveOnDutyDoctors(): Flow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> = flowOf(emptyList())
}

private class FakeConnectivityObserver : ConnectivityObserver {
    val statusFlow = MutableSharedFlow<ConnectivityObserver.Status>(extraBufferCapacity = 16)
    override val status: Flow<ConnectivityObserver.Status> = statusFlow
    override var isConnected: Boolean = true
}

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorDashboardViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepo: FakeAuthRepo
    private lateinit var doctorRepo: FakeDoctorRepo
    private lateinit var appointmentRepo: FakeAppointmentRepo
    private lateinit var telemedicineRepo: FakeTelemedicineRepo
    private lateinit var chatRepo: FakeChatRepo
    private lateinit var dispatchRepo: FakePharmacyDispatchRepo
    private lateinit var connectivityObserver: FakeConnectivityObserver
    private val activeViewModels = mutableListOf<DoctorDashboardViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepo = FakeAuthRepo()
        doctorRepo = FakeDoctorRepo()
        appointmentRepo = FakeAppointmentRepo()
        telemedicineRepo = FakeTelemedicineRepo()
        chatRepo = FakeChatRepo()
        dispatchRepo = FakePharmacyDispatchRepo()
        connectivityObserver = FakeConnectivityObserver()
    }

    @After
    fun tearDown() {
        // Always cancel background heartbeat/FCM jobs, including when an assertion fails.
        activeViewModels.forEach { it.viewModelScope.cancel() }
        activeViewModels.clear()
        Dispatchers.resetMain()
    }

    @Test
    fun `when on duty heartbeat sends periodically every 30s`() = runTest(testDispatcher) {
        val viewModel = DoctorDashboardViewModel(
            doctorRepository = doctorRepo,
            appointmentRepository = appointmentRepo,
            authRepository = authRepo,
            telemedicineRepository = telemedicineRepo,
            chatRepository = chatRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )
        activeViewModels += viewModel

        testScheduler.runCurrent()
        assertThat(dispatchRepo.heartbeatInvocations.size).isAtLeast(1)

        testScheduler.advanceTimeBy(30_000L)
        testScheduler.runCurrent()
        assertThat(dispatchRepo.heartbeatInvocations.size).isAtLeast(2)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `heartbeat failure triggers adaptive short backoff retry`() = runTest(testDispatcher) {
        val viewModel = DoctorDashboardViewModel(
            doctorRepository = doctorRepo,
            appointmentRepository = appointmentRepo,
            authRepository = authRepo,
            telemedicineRepository = telemedicineRepo,
            chatRepository = chatRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )
        activeViewModels += viewModel

        testScheduler.runCurrent()
        val initialCount = dispatchRepo.heartbeatInvocations.size
        assertThat(initialCount).isAtLeast(1)

        dispatchRepo.heartbeatResponse = Result.failure(IOException("Cellular timeout"))

        testScheduler.advanceTimeBy(30_000L)
        testScheduler.runCurrent()
        val afterFailureCount = dispatchRepo.heartbeatInvocations.size
        assertThat(afterFailureCount).isEqualTo(initialCount + 1)

        // Advance 4s - adaptive backoff triggers retry within 3s ± jitter
        testScheduler.advanceTimeBy(4_000L)
        testScheduler.runCurrent()

        assertThat(dispatchRepo.heartbeatInvocations.size).isGreaterThan(afterFailureCount)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `network reconnection triggers immediate heartbeat without waiting full 30s cycle`() = runTest(testDispatcher) {
        val viewModel = DoctorDashboardViewModel(
            doctorRepository = doctorRepo,
            appointmentRepository = appointmentRepo,
            authRepository = authRepo,
            telemedicineRepository = telemedicineRepo,
            chatRepository = chatRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )
        activeViewModels += viewModel

        testScheduler.runCurrent()
        val initialCount = dispatchRepo.heartbeatInvocations.size
        assertThat(initialCount).isAtLeast(1)

        connectivityObserver.statusFlow.tryEmit(ConnectivityObserver.Status.Lost)
        testScheduler.advanceTimeBy(5_000L)
        testScheduler.runCurrent()

        val countBeforeReconnect = dispatchRepo.heartbeatInvocations.size

        // Phone regains network
        connectivityObserver.statusFlow.tryEmit(ConnectivityObserver.Status.Available)
        testScheduler.runCurrent()

        assertThat(dispatchRepo.heartbeatInvocations.size).isGreaterThan(countBeforeReconnect)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `incoming dispatch offers from pharmacyDispatchRepository are delivered to doctor immediately when on duty`() = runTest(testDispatcher) {
        val viewModel = DoctorDashboardViewModel(
            doctorRepository = doctorRepo,
            appointmentRepository = appointmentRepo,
            authRepository = authRepo,
            telemedicineRepository = telemedicineRepo,
            chatRepository = chatRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )
        activeViewModels += viewModel

        testScheduler.runCurrent()

        val incomingRequest = PharmacyDispatchRequest(
            id = "req-real-999",
            offerId = "offer-owned-999",
            offerExpiresAt = java.time.OffsetDateTime.now().plusSeconds(30).toString(),
            careCountry = "AR",
            patientDni = "30111222",
            patientPhone = "+5491199887766",
            patientName = "Carlos Tevez",
            tierRequested = "general",
            symptomSummary = "Dolor lumbar agudo tras esfuerzo físico",
            status = "searching",
            cloudflareRoomId = "cf-room-general-999",
            createdAt = java.time.OffsetDateTime.now().toString(),
        )

        dispatchRepo.searchingRequestsFlow.value = listOf(incomingRequest)
        testScheduler.runCurrent()

        val state = viewModel.uiState.value
        assertThat(state.simulatedDispatchAlert).isNotNull()
        assertThat(state.simulatedDispatchAlert?.id).isEqualTo("req-real-999")
        assertThat(state.simulatedDispatchAlert?.patientName).isEqualTo("Carlos Tevez")
        assertThat(state.liveWaitingQueue).hasSize(1)
        assertThat(state.liveWaitingQueue.first().id).isEqualTo("req-real-999")

        // Dismiss alert
        viewModel.dismissDispatchAlert("req-real-999")
        testScheduler.runCurrent()

        assertThat(viewModel.uiState.value.simulatedDispatchAlert).isNull()
        assertThat(dispatchRepo.declinedOfferIds).containsExactly("offer-owned-999")

        viewModel.viewModelScope.cancel()
    }
}
