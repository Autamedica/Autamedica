package com.autamedica.android.presentation.ondemand

import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
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
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorOnDemandViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val doctorUser = User(
        id = "user-1",
        email = "doctor@autamedica.com",
        role = UserRole.DOCTOR,
        firstName = "Eduardo",
        lastName = "Marques",
    )

    @Test
    fun `carga identidad y estado de guardia`() = runTest {
        val vm = DoctorOnDemandViewModel(
            authRepository = authRepository(),
            doctorRepository = doctorRepository(),
            pharmacyDispatchRepository = FakePharmacyDispatchRepository(
                searching = MutableStateFlow(emptyList()),
            ),
        )

        advanceUntilIdle()

        assertThat(vm.uiState.value.isLoading).isFalse()
        assertThat(vm.uiState.value.doctorId).isEqualTo("doctor-1")
        assertThat(vm.uiState.value.isOnDuty).isTrue()
    }

    @Test
    fun `emite evento cuando llega una solicitud nueva`() = runTest {
        val queue = MutableStateFlow<List<PharmacyDispatchRequest>>(listOf(request("a")))
        val server = FakePharmacyDispatchRepository(searching = queue)

        val vm = DoctorOnDemandViewModel(
            authRepository = authRepository(),
            doctorRepository = doctorRepository(),
            pharmacyDispatchRepository = server,
        )

        advanceUntilIdle()
        val received = mutableListOf<String>()
        val collector = launch { vm.newRequestEvents.collect { received.add(it) } }

        queue.value = listOf(request("a"), request("b"))
        advanceUntilIdle()

        assertThat(received).containsExactly("b")

        collector.cancel()
    }

    @Test
    fun `expira localmente una oferta sin tocar el servidor`() = runTest {
        val queue = MutableStateFlow<List<PharmacyDispatchRequest>>(listOf(request("a")))
        val server = FakePharmacyDispatchRepository(searching = queue)

        val vm = DoctorOnDemandViewModel(
            authRepository = authRepository(),
            doctorRepository = doctorRepository(),
            pharmacyDispatchRepository = server,
        )

        advanceUntilIdle()
        assertThat(vm.uiState.value.searchingRequests.map { it.id }).containsExactly("a")

        vm.expireRequest("a")
        advanceUntilIdle()

        assertThat(vm.uiState.value.searchingRequests).isEmpty()
    }

    private fun authRepository() = object : AuthRepository {
        override fun observeSession(): Flow<User?> = flowOf(doctorUser)
        override suspend fun getCurrentUser(): User? = doctorUser
        override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
            Result.failure(NotImplementedError())
        override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
            Result.failure(NotImplementedError())
        override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
            Result.failure(NotImplementedError())
        override suspend fun logout() {}
    }

    private fun doctorRepository() = object : DoctorRepository {
        override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> = Result.success(
            DoctorProfile(id = "doctor-1", userId = "user-1", licenseNumber = "MN 12345", specialty = "Clinica"),
        )

        override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = Result.success(DoctorStats())
        override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> =
            Result.success(emptyList())
        override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> =
            Result.failure(NotImplementedError())
    }

    private class FakePharmacyDispatchRepository(
        val searching: MutableStateFlow<List<PharmacyDispatchRequest>>,
    ) : PharmacyDispatchRepository {
        override suspend fun getDoctorDutyStatus(doctorId: String): Result<DoctorDutyStatus> =
            Result.success(DoctorDutyStatus(doctorId = doctorId, isOnDuty = true))
        override suspend fun setDoctorDutyStatus(doctorId: String, isOnDuty: Boolean, activeTiers: List<String>): Result<Unit> =
            Result.success(Unit)
        override fun observeSearchingRequests(): StateFlow<List<PharmacyDispatchRequest>> = searching
        override suspend fun claimPharmacyRequest(requestId: String, doctorId: String): Result<DispatchClaimResult> =
            Result.success(DispatchClaimResult(success = false, code = "NOT_TESTED"))
        override suspend fun updateDispatchRequestStatus(requestId: String, status: String): Result<Unit> =
            Result.success(Unit)
        override suspend fun finishPharmacyRequest(doctorId: String, requestId: String): Result<Unit> =
            Result.success(Unit)
        override suspend fun createPatientDispatchRequest(
            patientDni: String,
            patientPhone: String,
            patientName: String?,
            tierRequested: String,
            symptomSummary: String?,
        ): Result<PharmacyDispatchRequest> =
            Result.failure(NotImplementedError())
        override fun observePatientRequest(requestId: String): Flow<PharmacyDispatchRequest> =
            flowOf(request(requestId))
    }
}

private fun request(id: String) = PharmacyDispatchRequest(
    id = id,
    patientDni = "12345678",
    patientPhone = "54911",
    patientName = "Paciente",
    tierRequested = "general",
    status = "searching",
    cloudflareRoomId = "cf-room-$id",
    createdAt = "2026-09-21T12:00:00-03:00",
    searchTimeoutAt = "2026-09-21T12:00:25-03:00",
)