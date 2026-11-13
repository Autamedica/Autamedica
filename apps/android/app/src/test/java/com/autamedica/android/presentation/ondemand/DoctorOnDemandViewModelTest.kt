package com.autamedica.android.presentation.ondemand

import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.DoctorGuardApproval
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
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

    private val searchingRequestsFlow = MutableStateFlow<List<PharmacyDispatchRequest>>(emptyList())

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
    override suspend fun claimPharmacyRequest(requestId: String, doctorId: String): Result<DispatchClaimResult> = Result.failure(NotImplementedError())
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
class DoctorOnDemandViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepo: FakeAuthRepo
    private lateinit var doctorRepo: FakeDoctorRepo
    private lateinit var dispatchRepo: FakePharmacyDispatchRepo
    private lateinit var connectivityObserver: FakeConnectivityObserver

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepo = FakeAuthRepo()
        doctorRepo = FakeDoctorRepo()
        dispatchRepo = FakePharmacyDispatchRepo()
        connectivityObserver = FakeConnectivityObserver()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initialization when on duty starts heartbeat and runs periodic ticks`() = runTest(testDispatcher) {
        val viewModel = DoctorOnDemandViewModel(
            authRepository = authRepo,
            doctorRepository = doctorRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )

        testScheduler.runCurrent()
        assertThat(viewModel.uiState.value.isOnDuty).isTrue()
        assertThat(dispatchRepo.heartbeatInvocations.size).isAtLeast(1)

        // Advance 30s -> triggers second heartbeat
        testScheduler.advanceTimeBy(30_000L)
        testScheduler.runCurrent()
        assertThat(dispatchRepo.heartbeatInvocations.size).isAtLeast(2)

        // Advance another 30s -> triggers third heartbeat
        testScheduler.advanceTimeBy(30_000L)
        testScheduler.runCurrent()
        assertThat(dispatchRepo.heartbeatInvocations.size).isAtLeast(3)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `heartbeat transient failure triggers short adaptive retry instead of waiting full 30s`() = runTest(testDispatcher) {
        val viewModel = DoctorOnDemandViewModel(
            authRepository = authRepo,
            doctorRepository = doctorRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )

        testScheduler.runCurrent()
        val initialCount = dispatchRepo.heartbeatInvocations.size
        assertThat(initialCount).isAtLeast(1)

        // Configure next heartbeat to fail (simulating cell tower drop / socket timeout)
        dispatchRepo.heartbeatResponse = Result.failure(IOException("Socket timeout"))

        // Advance 30s to trigger heartbeat that fails
        testScheduler.advanceTimeBy(30_000L)
        testScheduler.runCurrent()
        val afterFailureCount = dispatchRepo.heartbeatInvocations.size
        assertThat(afterFailureCount).isEqualTo(initialCount + 1)

        // Advance only 4s (within the 3s ± jitter backoff window)
        // With adaptive backoff, it should retry in ~3s instead of waiting 30s!
        testScheduler.advanceTimeBy(4_000L)
        testScheduler.runCurrent()

        assertThat(dispatchRepo.heartbeatInvocations.size).isGreaterThan(afterFailureCount)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `network reconnection triggers immediate heartbeat without waiting cycle completion`() = runTest(testDispatcher) {
        val viewModel = DoctorOnDemandViewModel(
            authRepository = authRepo,
            doctorRepository = doctorRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )

        testScheduler.runCurrent()
        val countAfterInit = dispatchRepo.heartbeatInvocations.size
        assertThat(countAfterInit).isAtLeast(1)

        // Simulate network loss (e.g. entering tunnel)
        connectivityObserver.statusFlow.tryEmit(ConnectivityObserver.Status.Lost)
        testScheduler.advanceTimeBy(5_000L)
        testScheduler.runCurrent()

        val countBeforeReconnect = dispatchRepo.heartbeatInvocations.size

        // Phone exits tunnel: Network switches back to Available!
        connectivityObserver.statusFlow.tryEmit(ConnectivityObserver.Status.Available)
        testScheduler.runCurrent()

        // Immediate heartbeat should have been dispatched upon reconnection!
        assertThat(dispatchRepo.heartbeatInvocations.size).isGreaterThan(countBeforeReconnect)

        viewModel.viewModelScope.cancel()
    }

    @Test
    fun `toggling duty status stops heartbeat when off duty and resumes when on duty`() = runTest(testDispatcher) {
        val viewModel = DoctorOnDemandViewModel(
            authRepository = authRepo,
            doctorRepository = doctorRepo,
            pharmacyDispatchRepository = dispatchRepo,
            connectivityObserver = connectivityObserver,
            ioDispatcher = testDispatcher,
        )

        testScheduler.runCurrent()
        assertThat(viewModel.uiState.value.isOnDuty).isTrue()

        // Toggle to off duty
        viewModel.toggleDuty()
        testScheduler.runCurrent()
        assertThat(viewModel.uiState.value.isOnDuty).isFalse()

        val countWhenOff = dispatchRepo.heartbeatInvocations.size

        // Advance 60 seconds - no heartbeats should occur while off duty
        testScheduler.advanceTimeBy(60_000L)
        testScheduler.runCurrent()
        assertThat(dispatchRepo.heartbeatInvocations.size).isEqualTo(countWhenOff)

        // Toggle back on duty
        viewModel.toggleDuty()
        testScheduler.runCurrent()
        assertThat(viewModel.uiState.value.isOnDuty).isTrue()
        assertThat(dispatchRepo.heartbeatInvocations.size).isGreaterThan(countWhenOff)

        viewModel.viewModelScope.cancel()
    }
}
