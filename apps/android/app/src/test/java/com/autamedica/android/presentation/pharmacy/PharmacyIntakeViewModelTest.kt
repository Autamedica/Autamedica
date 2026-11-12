package com.autamedica.android.presentation.pharmacy

import androidx.lifecycle.SavedStateHandle
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.domain.repository.DispatchCheckoutResult
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
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

private class FakePharmacyDispatchRepository(
    val requestFlow: MutableStateFlow<PharmacyDispatchRequest?> = MutableStateFlow(null),
) : PharmacyDispatchRepository {
    var createResult: Result<PharmacyDispatchRequest> = Result.failure(Exception("Not set"))
    var lastCreatedDni: String? = null
    var lastCreatedPhone: String? = null
    var lastCreatedName: String? = null
    var lastCreatedTier: String? = null
    var lastCreatedSummary: String? = null
    var lastCreatedCountry: String? = null
    var lastReferralCode: String? = null
    val statusUpdates = mutableListOf<Pair<String, String>>()
    var cancelResult: Result<Boolean> = Result.success(true)
    var checkoutResult: Result<DispatchCheckoutResult> = Result.success(DispatchCheckoutResult("pending","https://www.mercadopago.com.br/checkout"))
    var paymentStatusResult: Result<String> = Result.success("not_started")
    var paymentCheckCount: Int = 0
    var activeRequestResult: Result<PharmacyDispatchRequest?> = Result.success(null)
    val cancellationAttempts = mutableListOf<String>()

    override suspend fun startDispatchCheckout(requestId: String): Result<DispatchCheckoutResult> = checkoutResult

    override suspend fun getActivePatientDispatchRequest(): Result<PharmacyDispatchRequest?> = activeRequestResult

    override suspend fun getDispatchPaymentStatus(requestId: String): Result<String> {
        paymentCheckCount++
        return paymentStatusResult
    }

    override suspend fun cancelPatientDispatchRequest(requestId: String): Result<Boolean> {
        cancellationAttempts.add(requestId)
        return cancelResult
    }

    override suspend fun getDoctorDutyStatus(doctorId: String): Result<DoctorDutyStatus> =
        Result.success(DoctorDutyStatus(doctorId = doctorId))

    override suspend fun setDoctorDutyStatus(
        doctorId: String,
        isOnDuty: Boolean,
        activeTiers: List<String>,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun sendDoctorHeartbeat(doctorId: String): Result<Unit> = Result.success(Unit)

    override fun observeSearchingRequests(): StateFlow<List<PharmacyDispatchRequest>> =
        MutableStateFlow(emptyList())

    override suspend fun claimPharmacyRequest(
        requestId: String,
        doctorId: String,
    ): Result<DispatchClaimResult> =
        Result.success(DispatchClaimResult(success = true, code = "MATCH_SUCCESSFUL", requestId = requestId))

    override suspend fun updateDispatchRequestStatus(
        requestId: String,
        status: String,
    ): Result<Unit> {
        statusUpdates.add(requestId to status)
        return Result.success(Unit)
    }

    override suspend fun finishPharmacyRequest(
        doctorId: String,
        requestId: String,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String?,
        careCountry: String?,
        referralCode: String?,
    ): Result<PharmacyDispatchRequest> {
        lastCreatedDni = patientDni
        lastCreatedPhone = patientPhone
        lastCreatedName = patientName
        lastCreatedTier = tierRequested
        lastCreatedSummary = symptomSummary
        lastCreatedCountry = careCountry
        lastReferralCode = referralCode
        createResult.getOrNull()?.let { requestFlow.value = it }
        return createResult
    }

    val activeDoctorsFlow: MutableStateFlow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> = MutableStateFlow(emptyList())

    override fun observePatientRequest(requestId: String): Flow<PharmacyDispatchRequest> =
        requestFlow.filterNotNull()

    override suspend fun getActiveOnDutyDoctors(): Result<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> =
        Result.success(activeDoctorsFlow.value)

    override fun observeActiveOnDutyDoctors(): Flow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> =
        activeDoctorsFlow
}

@OptIn(ExperimentalCoroutinesApi::class)
class PharmacyIntakeViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepo: FakeAuthRepository
    private lateinit var profileRepo: FakeProfileRepository
    private lateinit var pharmacyRepo: FakePharmacyDispatchRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepo = FakeAuthRepository()
        profileRepo = FakeProfileRepository()
        pharmacyRepo = FakePharmacyDispatchRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `intake failures distinguish profile session permission and network errors`() {
        assertThat(classifyIntakeCreationFailure(
            IllegalStateException("care_country_or_patient_profile_required")
        )).contains("perfil de paciente")
        assertThat(classifyIntakeCreationFailure(
            IllegalStateException("care_country_dispatch_mismatch")
        )).contains("país")
        assertThat(classifyIntakeCreationFailure(
            IllegalStateException("Guest dispatch API rejected intake (HTTP 401)")
        )).contains("sesión")
        assertThat(classifyIntakeCreationFailure(
            IllegalStateException("permission denied for function")
        )).contains("autorizar")
        assertThat(classifyIntakeCreationFailure(
            java.net.UnknownHostException("unable to resolve host")
        )).contains("conexión")
        assertThat(classifyIntakeCreationFailure(
            IllegalStateException("Unexpected database rejection: private information")
        )).doesNotContain("private information")
    }

    @Test
    fun `intake submission exposes actionable profile error without submitting twice`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo, profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onCountrySelected("AR")
        vm.onPatientNameChanged("Paciente de prueba")
        vm.onPatientDniChanged("12345678")
        vm.onPatientPhoneChanged("+5491198765432")
        vm.onReasonTextChanged("Consulta general")
        pharmacyRepo.createResult = Result.failure(
            IllegalStateException("care_country_or_patient_profile_required")
        )
        assertThat(vm.uiState.value.isFormValid).isTrue()
        vm.submitRequest()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.error).contains("perfil de paciente")
        assertThat(vm.uiState.value.error).doesNotContain("conexión")
        assertThat(vm.uiState.value.activeRequestId).isNull()
        assertThat(vm.uiState.value.isSubmitting).isFalse()
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
            pharmacyDispatchRepository = pharmacyRepo,
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
            pharmacyDispatchRepository = pharmacyRepo,
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
    fun `Jordan QR presets Brazil and forwards referral code to signed dispatch`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("referralCode" to "JORDAN")),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        assertThat(vm.uiState.value.careCountry).isEqualTo("BR")
        vm.onCountrySelected("AR")
        assertThat(vm.uiState.value.careCountry).isEqualTo("BR")
        vm.onPatientNameChanged("Paciente brasileiro")
        vm.onPatientPhoneChanged("+5551987654321")
        vm.onPatientDniChanged("12345678909")
        vm.onReasonTextChanged("Consulta geral")
        pharmacyRepo.createResult = Result.success(
            PharmacyDispatchRequest(
                id = "guest-jordan-br", patientDni = "12345678909",
                patientPhone = "+5551987654321", patientName = "Paciente brasileiro",
                tierRequested = "general", status = "searching",
                cloudflareRoomId = "cf-room-br", createdAt = "2026-11-05T18:00:00Z",
                careCountry = "BR",
            )
        )
        vm.submitRequest()
        testScheduler.runCurrent()
        assertThat(pharmacyRepo.lastCreatedCountry).isEqualTo("BR")
        assertThat(pharmacyRepo.lastReferralCode).isEqualTo("JORDAN")
    }

    @Test
    fun `brazil form requires CPF and passes explicit country`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onPatientNameChanged("PACIENTE DEMO")
        vm.onPatientPhoneChanged("+5551987654321")
        vm.onReasonTextChanged("Consulta de demonstração")
        vm.onCountrySelected("BR")
        vm.onPatientDniChanged("12345678909")
        assertThat(vm.uiState.value.isFormValid).isTrue()

        pharmacyRepo.createResult = Result.success(
            PharmacyDispatchRequest(
                id = "guest-br-synthetic",
                patientDni = "",
                patientPhone = "+5551987654321",
                patientName = "PACIENTE DEMO",
                tierRequested = "general",
                status = "searching",
                cloudflareRoomId = "cf-room-general-demo",
                createdAt = "2026-11-04T12:00:00Z",
            )
        )
        vm.submitRequest()
        testScheduler.runCurrent()
        assertThat(pharmacyRepo.lastCreatedCountry).isEqualTo("BR")
    }

    @Test
    fun `reason chip selection populates reason text and chip state`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
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
    fun `changing country clears foreign ID and auto-filled reason but preserves typed text`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onCountrySelected("AR")
        vm.onPatientDniChanged("35123456")
        vm.onReasonChipSelected("Renovación de Receta")
        vm.onCountrySelected("BR")

        assertThat(vm.uiState.value.careCountry).isEqualTo("BR")
        assertThat(vm.uiState.value.patientDni).isEmpty()
        assertThat(vm.uiState.value.selectedReasonChip).isNull()
        assertThat(vm.uiState.value.reasonText).isEmpty()

        vm.onPatientDniChanged("12345678909")
        vm.onReasonTextChanged("Consulta particular")
        vm.onCountrySelected("AR")

        assertThat(vm.uiState.value.patientDni).isEmpty()
        assertThat(vm.uiState.value.selectedReasonChip).isNull()
        assertThat(vm.uiState.value.reasonText).isEqualTo("Consulta particular")
    }

    @Test
    fun `submitting without required fields sets validation error`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onCountrySelected("AR")
        vm.submitRequest()
        assertThat(vm.uiState.value.error).isNotNull()
        assertThat(vm.uiState.value.activeRequestId).isNull()
    }

    @Test
    fun `choosing another clinical reason never sends the previous auto selected chip`() = runTest(testDispatcher) {
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onReasonChipSelected("Renovación de Receta")
        assertThat(vm.uiState.value.effectiveReason).isEqualTo("Renovación de Receta")
        vm.onReasonChipSelected("Presión / Hipertensión")
        assertThat(vm.uiState.value.reasonText).isEqualTo("Presión / Hipertensión")
        assertThat(vm.uiState.value.effectiveReason).isEqualTo("Presión / Hipertensión")
        vm.onReasonChipSelected("Presión / Hipertensión")
        assertThat(vm.uiState.value.reasonText).isEmpty()
    }

    @Test
    fun `submitting valid form creates dispatch request and keeps radar alive while searching`() = runTest(testDispatcher) {
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

        val fakeCreatedRequest = PharmacyDispatchRequest(
            id = "req-999",
            patientDni = "28999888",
            patientPhone = "+5491122334455",
            patientName = "María López",
            tierRequested = "general",
            symptomSummary = "Presión / Hipertensión",
            status = "searching",
            cloudflareRoomId = "cf-room-general-9888",
            createdAt = "2026-09-21T00:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(fakeCreatedRequest)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onReasonChipSelected("Presión / Hipertensión")
        vm.onCountrySelected("AR")
        vm.submitRequest()
        testScheduler.runCurrent()

        assertThat(vm.uiState.value.activeRequestId).isEqualTo("req-999")
        assertThat(pharmacyRepo.lastCreatedName).isEqualTo("María López")
        assertThat(pharmacyRepo.lastCreatedDni).isEqualTo("28999888")
        assertThat(pharmacyRepo.lastCreatedSummary).isEqualTo("Presión / Hipertensión")
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.PENDING)
        // La espera (radar) queda activa: la sala existe pero el médico aún no atendió la llamada.
        assertThat(vm.uiState.value.roomId).isEqualTo("cf-room-general-9888")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()
    }

    @Test
    fun `loadUserProfile cleans email to format clean patientName in title case`() = runTest(testDispatcher) {
        val userWithEmail = User(
            id = "u-email",
            email = "jaqueline42marques@GMAIL.COM",
            role = UserRole.PATIENT,
        )
        authRepo.user = userWithEmail
        profileRepo.user = userWithEmail

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        assertThat(vm.uiState.value.patientName).isEqualTo("Jaqueline Marques")
        assertThat(vm.uiState.value.isAuthenticated).isTrue()
    }

    @Test
    fun `radar stays active while searching and matched and cuts only when doctor attends (in_call)`() = runTest(testDispatcher) {
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

        val fakeCreatedRequest = PharmacyDispatchRequest(
            id = "req-race-1",
            patientDni = "28999888",
            patientPhone = "+5491122334455",
            patientName = "María López",
            tierRequested = "general",
            symptomSummary = "Presión / Hipertensión",
            status = "searching",
            cloudflareRoomId = "cf-room-general-race1",
            createdAt = "2026-09-21T00:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(fakeCreatedRequest)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onPatientNameChanged("María López")
        vm.onPatientDniChanged("28999888")
        vm.onPatientPhoneChanged("+5491122334455")
        vm.onReasonChipSelected("Presión / Hipertensión")
        vm.onCountrySelected("AR")
        vm.submitRequest()
        testScheduler.runCurrent()

        // searching: radar de espera activo, sin navegación
        assertThat(vm.uiState.value.activeRequestId).isEqualTo("req-race-1")
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.PENDING)
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()

        // matched: el médico fue asignado por el claim pero aún no atiende; el radar sigue vivo
        pharmacyRepo.requestFlow.value = fakeCreatedRequest.copy(status = "matched", assignedDoctorId = "doc-1")
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.ASSIGNED)
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()

        // in_call: el médico atendió la llamada; se corta la espera y queda lista la navegación
        pharmacyRepo.requestFlow.value = fakeCreatedRequest.copy(status = "in_call", assignedDoctorId = "doc-1")
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.IN_CALL)
        assertThat(vm.uiState.value.readyToJoinCall).isTrue()
        assertThat(vm.uiState.value.roomId).isEqualTo("cf-room-general-race1")
    }

    @Test
    fun `cancelActiveRequest cancels active request, updates repository and resets state`() = runTest(testDispatcher) {
        val fakeCreatedRequest = PharmacyDispatchRequest(
            id = "req-cancel-123",
            patientDni = "28999888",
            patientPhone = "+5491122334455",
            patientName = "Carlos Gómez",
            tierRequested = "general",
            symptomSummary = "Dolor Muscular",
            status = "searching",
            cloudflareRoomId = "cf-room-general-9888",
            createdAt = "2026-09-21T00:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(fakeCreatedRequest)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onPatientNameChanged("Carlos Gómez")
        vm.onPatientDniChanged("28999888")
        vm.onPatientPhoneChanged("+5491122334455")
        vm.onReasonChipSelected("Dolor Muscular")
        vm.onCountrySelected("AR")
        vm.submitRequest()
        testScheduler.runCurrent()

        assertThat(vm.uiState.value.activeRequestId).isEqualTo("req-cancel-123")

        // User chooses to cancel
        vm.cancelActiveRequest()
        advanceUntilIdle()

        assertThat(pharmacyRepo.cancellationAttempts).containsExactly("req-cancel-123")
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
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        vm.onPatientNameChanged("Esteban Quito")
        vm.cancelActiveRequest()
        advanceUntilIdle()

        assertThat(pharmacyRepo.cancellationAttempts).isEmpty()
        assertThat(vm.uiState.value.patientName).isEqualTo("Esteban Quito")
        assertThat(vm.uiState.value.activeRequestId).isNull()
    }

    @Test
    fun `refused or failed cancellation preserves active request and displays error`() = runTest(testDispatcher) {
        val created = PharmacyDispatchRequest(
            id = "req-no-cancel-123",
            patientDni = "28999888",
            patientPhone = "+5491122334455",
            patientName = "Paciente sintético",
            tierRequested = "general",
            symptomSummary = "Prueba sintética",
            status = "searching",
            cloudflareRoomId = "cf-room-uncancelled",
            createdAt = "2026-11-04T00:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(created)
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onPatientNameChanged("Paciente sintético")
        vm.onPatientDniChanged("28999888")
        vm.onPatientPhoneChanged("+5491122334455")
        vm.onCountrySelected("AR")
        vm.onReasonTextChanged("Prueba sintética")
        vm.submitRequest()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.activeRequestId).isEqualTo(created.id)
        assertThat(vm.uiState.value.queuePosition).isEqualTo(0)
        assertThat(vm.uiState.value.estimatedMinutes).isEqualTo(0)

        pharmacyRepo.cancelResult = Result.success(false)
        vm.cancelActiveRequest()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.activeRequestId).isEqualTo(created.id)
        assertThat(vm.uiState.value.error).contains("No se confirmó")
        assertThat(vm.uiState.value.isSubmitting).isFalse()

        pharmacyRepo.cancelResult = Result.failure(IllegalStateException("Synthetic network error"))
        vm.cancelActiveRequest()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.activeRequestId).isEqualTo(created.id)
        assertThat(vm.uiState.value.error).contains("No pudimos cancelar")
        assertThat(vm.uiState.value.isSubmitting).isFalse()
        assertThat(pharmacyRepo.cancellationAttempts).containsExactly(created.id, created.id)
    }

    @Test
    fun `Jordan consultation does not enter video until payment provider approves`() = runTest(testDispatcher) {
        val req = PharmacyDispatchRequest(
            id = "synthetic-jordan-br", careCountry = "BR", referralPartnerId = "partner-jordan-br",
            patientDni = "12345678909", patientPhone = "+5551987654321",
            patientName = "Paciente BR", status = "searching",
            cloudflareRoomId = "cf-room-br-test", createdAt = "2026-11-05T18:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(req)
        pharmacyRepo.paymentStatusResult = Result.success("pending")
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("referralCode" to "JORDAN")),
            authRepository = authRepo, profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onPatientNameChanged("Paciente BR")
        vm.onPatientPhoneChanged("+5551987654321")
        vm.onPatientDniChanged("12345678909")
        vm.onReasonTextChanged("Consulta geral")
        vm.submitRequest()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.PENDING)
        assertThat(vm.uiState.value.requiresBrazilianPayment).isTrue()
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()
        assertThat(vm.uiState.value.paymentStatus).isEqualTo("pending")
        // Pay-first: the patient can open checkout while the dispatch is still searching.
        vm.beginBrazilianCheckout()
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.paymentCheckoutUrl).startsWith("https://")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()
        assertThat(pharmacyRepo.paymentCheckCount).isGreaterThan(0)

        // PSP approval alone does not enter the call while no doctor has accepted.
        pharmacyRepo.paymentStatusResult = Result.success("approved")
        // The PSP is polled independently every five seconds while dispatch is searching.
        advanceTimeBy(5_000)
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.paymentStatus).isEqualTo("approved")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()

        // A later physician assignment/call state may unlock media only with PSP approval.
        pharmacyRepo.requestFlow.value = req.copy(status = "in_call", patientName = "Paciente BR aprovado")
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.readyToJoinCall).isTrue()
    }

    @Test
    fun `Jordan app restore keeps in-call patient on checkout while payment is pending and polls PSP`() = runTest(testDispatcher) {
        val restored = PharmacyDispatchRequest(
            id = "restored-jordan-pending", careCountry = "BR", referralPartnerId = "partner-jordan-br",
            patientDni = "12345678909", patientPhone = "+5551987654321", patientName = "Paciente BR",
            status = "in_call", cloudflareRoomId = "cf-room-restored-jordan",
            createdAt = "2026-11-12T00:00:00Z",
        )
        pharmacyRepo.activeRequestResult = Result.success(restored)
        pharmacyRepo.requestFlow.value = restored
        pharmacyRepo.paymentStatusResult = Result.success("pending")
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("referralCode" to "JORDAN")),
            authRepository = authRepo, profileRepository = profileRepo, pharmacyDispatchRepository = pharmacyRepo,
        )
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.activeRequestId).isEqualTo(restored.id)
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.IN_CALL)
        assertThat(vm.uiState.value.requiresBrazilianPayment).isTrue()
        assertThat(vm.uiState.value.paymentStatus).isEqualTo("pending")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()
        val initialChecks = pharmacyRepo.paymentCheckCount
        assertThat(initialChecks).isGreaterThan(0)
        advanceTimeBy(5_000)
        testScheduler.runCurrent()
        assertThat(pharmacyRepo.paymentCheckCount).isGreaterThan(initialChecks)
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()

        // Ending/canceling the recovered request must stop the independent PSP poller.
        vm.cancelActiveRequest()
        testScheduler.runCurrent()
        val checksAfterCancel = pharmacyRepo.paymentCheckCount
        advanceTimeBy(10_000)
        testScheduler.runCurrent()
        assertThat(pharmacyRepo.paymentCheckCount).isEqualTo(checksAfterCancel)
    }

    @Test
    fun `Jordan app restore unlocks in-call navigation only after PSP approval`() = runTest(testDispatcher) {
        val restored = PharmacyDispatchRequest(
            id = "restored-jordan-approved", careCountry = "BR", referralPartnerId = "partner-jordan-br",
            patientDni = "12345678909", patientPhone = "+5551987654321", patientName = "Paciente BR",
            status = "in_call", cloudflareRoomId = "cf-room-restored-approved",
            createdAt = "2026-11-12T00:00:00Z",
        )
        pharmacyRepo.activeRequestResult = Result.success(restored)
        pharmacyRepo.requestFlow.value = restored
        pharmacyRepo.paymentStatusResult = Result.success("approved")
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("referralCode" to "JORDAN")),
            authRepository = authRepo, profileRepository = profileRepo, pharmacyDispatchRepository = pharmacyRepo,
        )
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.paymentStatus).isEqualTo("approved")
        assertThat(vm.uiState.value.readyToJoinCall).isTrue()
        assertThat(pharmacyRepo.paymentCheckCount).isGreaterThan(0)
    }

    @Test
    fun `Jordan app restore never unlocks in-call navigation for refunded payment`() = runTest(testDispatcher) {
        val restored = PharmacyDispatchRequest(
            id = "restored-jordan-refunded", careCountry = "BR", referralPartnerId = "partner-jordan-br",
            patientDni = "12345678909", patientPhone = "+5551987654321", patientName = "Paciente BR",
            status = "in_call", cloudflareRoomId = "cf-room-restored-refunded",
            createdAt = "2026-11-12T00:00:00Z",
        )
        pharmacyRepo.activeRequestResult = Result.success(restored)
        pharmacyRepo.requestFlow.value = restored
        pharmacyRepo.paymentStatusResult = Result.success("refunded")
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(mapOf("referralCode" to "JORDAN")),
            authRepository = authRepo, profileRepository = profileRepo, pharmacyDispatchRepository = pharmacyRepo,
        )
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.paymentStatus).isEqualTo("refunded")
        assertThat(vm.uiState.value.readyToJoinCall).isFalse()
        assertThat(pharmacyRepo.paymentCheckCount).isGreaterThan(0)
    }

    @Test
    fun `no online doctors is a normal persistent waiting state and legacy expiration is informational`() = runTest(testDispatcher) {
        val created = PharmacyDispatchRequest(
            id = "req-persistent-ar-1",
            patientDni = "28999888",
            patientPhone = "+5491122334455",
            patientName = "Paciente sintético AR",
            tierRequested = "general",
            symptomSummary = "Renovación de receta",
            status = "searching",
            cloudflareRoomId = "cf-room-persistent-ar",
            createdAt = "2026-11-05T00:00:00Z",
        )
        pharmacyRepo.createResult = Result.success(created)
        pharmacyRepo.activeDoctorsFlow.value = emptyList()
        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()
        vm.onPatientNameChanged("Paciente sintético AR")
        vm.onPatientDniChanged("28999888")
        vm.onPatientPhoneChanged("+5491122334455")
        vm.onCountrySelected("AR")
        vm.onReasonTextChanged("Renovación de receta")
        vm.submitRequest()
        testScheduler.runCurrent()
        pharmacyRepo.requestFlow.value = created
        testScheduler.runCurrent()

        // Zero active physicians must not turn a valid queue into an error.
        assertThat(vm.uiState.value.careCountry).isEqualTo("AR")
        assertThat(vm.uiState.value.activeDoctors).isEmpty()
        assertThat(vm.uiState.value.status).isEqualTo(PharmacyConsultationStatus.PENDING)
        assertThat(vm.uiState.value.activeRequestId).isEqualTo(created.id)
        assertThat(vm.uiState.value.error).isNull()
        assertThat(vm.uiState.value.statusNotice).isNull()

        // An actual legacy terminal status is shown as neutral information.
        pharmacyRepo.requestFlow.value = created.copy(status = "expired")
        testScheduler.runCurrent()
        assertThat(vm.uiState.value.activeRequestId).isNull()
        assertThat(vm.uiState.value.error).isNull()
        assertThat(vm.uiState.value.statusNotice).contains("finalizó")
    }

    @Test
    fun `observeActiveOnDutyDoctors updates activeDoctors dynamically on connection and disconnection`() = runTest(testDispatcher) {
        val doctor1 = com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo(
            id = "doc-1",
            name = "Dr. Roberto Méndez",
            shortName = "Dr. Méndez",
            specialty = "Medicina General",
            initials = "RM",
            isAvailable = true,
        )
        pharmacyRepo.activeDoctorsFlow.value = listOf(doctor1)

        val vm = PharmacyIntakeViewModel(
            savedStateHandle = SavedStateHandle(),
            authRepository = authRepo,
            profileRepository = profileRepo,
            pharmacyDispatchRepository = pharmacyRepo,
        )
        advanceUntilIdle()

        // Doctor is online
        assertThat(vm.uiState.value.activeDoctors).containsExactly(doctor1)

        // Doctor goes offline (disables real-time duty switch)
        pharmacyRepo.activeDoctorsFlow.value = emptyList()
        advanceUntilIdle()

        // Immediately updates to empty list
        assertThat(vm.uiState.value.activeDoctors).isEmpty()
    }
}