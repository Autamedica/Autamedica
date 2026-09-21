package com.autamedica.android.presentation.pharmacy

import androidx.lifecycle.SavedStateHandle
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.model.RequestStatusResponse
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyOnDemandRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

private class FakeAuthRepository(var user: User? = null) : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(user)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
        user?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
        user?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.success(UserRegistrationResult(user, false))
    override suspend fun logout() { user = null }
    override suspend fun getCurrentUser(): User? = user
}

private class FakeProfileRepository(
    var user: User? = null,
    var snapshot: PatientProfileSnapshot? = null,
) : ProfileRepository {
    override suspend fun getProfile(): Result<User> =
        user?.let { Result.success(it) } ?: Result.failure(Exception("No profile"))
    override suspend fun getPatientProfileSnapshot(): Result<PatientProfileSnapshot?> =
        Result.success(snapshot)
    override suspend fun updateProfile(firstName: String, lastName: String, phone: String?): Result<User> =
        user?.let { Result.success(it) } ?: Result.failure(Exception("No profile"))
}

private class FakePharmacyOnDemandRepository : PharmacyOnDemandRepository {
    var createRequestResult: Result<PharmacyConsultationRequest> = Result.failure(Exception("Not set"))
    var getStatusResult: Result<RequestStatusResponse> = Result.failure(Exception("Not set"))
    var lastCreatedReason: String? = null
    var lastCreatedPatientName: String? = null
    var lastCreatedPatientDni: String? = null
    var lastCreatedPatientPhone: String? = null

    override fun observeOnDutyState(): Flow<DoctorOnDutyPharmacyState> =
        flowOf(DoctorOnDutyPharmacyState())

    override suspend fun getOnDutyStatus(): Result<DoctorOnDutyPharmacyState> =
        Result.success(DoctorOnDutyPharmacyState())

    override suspend fun toggleOnDuty(onDuty: Boolean): Result<DoctorOnDutyPharmacyState> =
        Result.success(DoctorOnDutyPharmacyState(isOnDuty = onDuty))

    override suspend fun getPendingQueue(): Result<List<PharmacyConsultationRequest>> =
        Result.success(emptyList())

    override suspend fun claimRequest(requestId: String): Result<PharmacyClaimResult> =
        Result.success(
            PharmacyClaimResult(
                requestId = requestId,
                callId = "call-1",
                roomId = "room-123",
                guestInviteId = "guest-1",
                doctorRoomUrl = "https://example.com/doc",
                patientJoinUrl = "https://example.com/patient",
            )
        )

    override suspend fun createRequest(
        pharmacyId: String?,
        pharmacyName: String,
        patientDni: String,
        patientName: String,
        patientPhone: String,
        reason: String,
    ): Result<PharmacyConsultationRequest> {
        lastCreatedReason = reason
        lastCreatedPatientName = patientName
        lastCreatedPatientDni = patientDni
        lastCreatedPatientPhone = patientPhone
        return createRequestResult
    }

    var lastCancelledRequestId: String? = null

    override suspend fun getRequestStatus(requestId: String): Result<RequestStatusResponse> {
        return getStatusResult
    }

    override suspend fun cancelRequest(requestId: String): Result<Unit> {
        lastCancelledRequestId = requestId
        return Result.success(Unit)
    }

    var lastCancelledActiveDni: String? = null
    var lastCancelledActivePhone: String? = null

    override suspend fun cancelActiveRequestsForPatient(patientDni: String, patientPhone: String): Result<Unit> {
        lastCancelledActiveDni = patientDni
        lastCancelledActivePhone = patientPhone
        return Result.success(Unit)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class PharmacyIntakeViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepo: FakeAuthRepository
    private lateinit var profileRepo: FakeProfileRepository
    private lateinit var pharmacyRepo: FakePharmacyOnDemandRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepo = FakeAuthRepository()
        profileRepo = FakeProfileRepository()
        pharmacyRepo = FakePharmacyOnDemandRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `logged in user autofills patientName, phone, and DNI from profile`() = runTest(testDispatcher) {
        val testUser = User(
            id = "user-abc",
            email = "paciente@autamedica.com",
            firstName = "Carlos",
            lastName = "Gómez",
            phone = "+5491155554321",
            role = UserRole.PATIENT,
        )
        val testSnapshot = PatientProfileSnapshot(
            dni = "35123456",
        )
        authRepo.user = testUser
        profileRepo.user = testUser
        profileRepo.snapshot = testSnapshot

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("pharmacyId" to "farmacia-central")),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertThat(state.isAuthenticated).isTrue()
        assertThat(state.patientName).isEqualTo("Carlos Gómez")
        assertThat(state.patientPhone).isEqualTo("+5491155554321")
        assertThat(state.patientDni).isEqualTo("35123456")
        assertThat(state.pharmacyId).isEqualTo("farmacia-central")
        assertThat(state.isLoadingProfile).isFalse()
    }

    @Test
    fun `unauthenticated user has empty autofill and isAuthenticated false`() = runTest(testDispatcher) {
        authRepo.user = null
        profileRepo.user = null
        profileRepo.snapshot = null

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertThat(state.isAuthenticated).isFalse()
        assertThat(state.patientName).isEmpty()
        assertThat(state.patientPhone).isEmpty()
        assertThat(state.patientDni).isEmpty()
        assertThat(state.isLoadingProfile).isFalse()
    }

    @Test
    fun `reason chip selection populates reason text and chip state`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onReasonChipSelected("Renovación de Receta")
        assertThat(vm.uiState.value.selectedReasonChip).isEqualTo("Renovación de Receta")
        assertThat(vm.uiState.value.reasonText).isEqualTo("Renovación de Receta")
        assertThat(vm.uiState.value.effectiveReason).isEqualTo("Renovación de Receta")

        // Unselecting toggles off chip
        vm.onReasonChipSelected("Renovación de Receta")
        assertThat(vm.uiState.value.selectedReasonChip).isNull()
    }

    @Test
    fun `submitting without required fields sets validation error`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.submitRequest()
        assertThat(vm.uiState.value.error).isNotNull()
        assertThat(vm.uiState.value.activeRequestId).isNull()
    }

    @Test
    fun `submitting valid form creates request and polling detects ASSIGNED doctor with roomId`() = runTest(testDispatcher) {
        authRepo.user = User(
            id = "user-abc",
            email = "paciente@autamedica.com",
            firstName = "María",
            lastName = "López",
            phone = "+5491122334455",
            role = UserRole.PATIENT,
        )
        profileRepo.user = authRepo.user
        profileRepo.snapshot = PatientProfileSnapshot(
            dni = "28999888",
        )

        val fakeCreatedRequest = PharmacyConsultationRequest(
            id = "req-999",
            pharmacyId = "farm-1",
            pharmacyName = "Farmacia de Turno",
            patientDni = "28999888",
            patientName = "María López",
            patientPhone = "+5491122334455",
            reason = "Presión / Hipertensión",
            status = PharmacyConsultationStatus.PENDING,
        )
        pharmacyRepo.createRequestResult = Result.success(fakeCreatedRequest)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onReasonChipSelected("Presión / Hipertensión")
        vm.submitRequest()
        testScheduler.runCurrent()

        assertThat(vm.uiState.value.activeRequestId).isEqualTo("req-999")
        assertThat(pharmacyRepo.lastCreatedPatientName).isEqualTo("María López")
        assertThat(pharmacyRepo.lastCreatedPatientDni).isEqualTo("28999888")
        assertThat(pharmacyRepo.lastCreatedReason).isEqualTo("Presión / Hipertensión")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()

        // Simulate doctor claiming the request during polling
        pharmacyRepo.getStatusResult = Result.success(
            RequestStatusResponse(
                id = "req-999",
                status = PharmacyConsultationStatus.ASSIGNED,
                queuePosition = 0,
                doctorName = "Dra. Silvina Ramos",
                doctorSpecialty = "Clínica Médica",
                roomId = "room_pharmacy_999",
            )
        )

        advanceTimeBy(2100)
        testScheduler.runCurrent()

        val finalState = vm.uiState.value
        assertThat(finalState.status).isEqualTo(PharmacyConsultationStatus.ASSIGNED)
        assertThat(finalState.assignedDoctorName).isEqualTo("Dra. Silvina Ramos")
        assertThat(finalState.roomId).isEqualTo("room_pharmacy_999")
        assertThat(finalState.readyToJoinCall).isTrue()
    }

    @Test
    fun `cancelActiveRequest cancels active request, updates repository and resets state`() = runTest(testDispatcher) {
        val fakeCreatedRequest = PharmacyConsultationRequest(
            id = "req-cancel-123",
            pharmacyId = "farm-1",
            pharmacyName = "Farmacia de Turno",
            patientDni = "28999888",
            patientName = "Carlos Gómez",
            patientPhone = "+5491122334455",
            reason = "Dolor Muscular",
            status = PharmacyConsultationStatus.PENDING,
        )
        pharmacyRepo.createRequestResult = Result.success(fakeCreatedRequest)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onPatientNameChanged("Carlos Gómez")
        vm.onPatientDniChanged("28999888")
        vm.onPatientPhoneChanged("+5491122334455")
        vm.onReasonChipSelected("Dolor Muscular")
        vm.submitRequest()
        testScheduler.runCurrent()

        assertThat(vm.uiState.value.activeRequestId).isEqualTo("req-cancel-123")

        // User chooses to cancel
        vm.cancelActiveRequest()
        advanceUntilIdle()

        assertThat(pharmacyRepo.lastCancelledRequestId).isEqualTo("req-cancel-123")
        assertThat(vm.uiState.value.activeRequestId).isNull()
        assertThat(vm.uiState.value.status).isNull()
        assertThat(vm.uiState.value.queuePosition).isEqualTo(0)
        assertThat(vm.uiState.value.isSubmitting).isFalse()
    }

    @Test
    fun `cancelActiveRequest when no active request does not call repository and leaves form intact`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyOnDemandRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onPatientNameChanged("Esteban Quito")
        vm.cancelActiveRequest()
        advanceUntilIdle()

        assertThat(pharmacyRepo.lastCancelledRequestId).isNull()
        assertThat(vm.uiState.value.patientName).isEqualTo("Esteban Quito")
        assertThat(vm.uiState.value.activeRequestId).isNull()
    }
}
