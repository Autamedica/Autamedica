package com.autamedica.android.presentation.doctors.onboarding

import com.autamedica.android.data.repository.DoctorOnboardingClient
import com.autamedica.android.data.repository.DoctorOnboardingException
import com.autamedica.android.data.repository.DoctorOnboardingSubmission
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
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
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Before
import org.junit.Test

private class FakeOnboardingAuthRepo(
    private val currentUser: User? = User(
        id = "user-1",
        email = "doc@autamedica.com",
        firstName = "María",
        lastName = "Gómez",
        phone = "+5491112345678",
        role = UserRole.DOCTOR,
    ),
) : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(currentUser)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
        Result.success(currentUser!!)
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
        Result.success(currentUser!!)
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.success(UserRegistrationResult(user = currentUser, requiresEmailConfirmation = false))
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = currentUser
}

private class FakeOnboardingDoctorRepo(
    private val profile: DoctorProfile? = null,
) : DoctorRepository {
    override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> =
        profile?.let { Result.success(it) } ?: Result.failure(NoSuchElementException("missing"))
    override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = Result.success(DoctorStats())
    override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> = Result.success(emptyList())
    override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> =
        Result.failure(NotImplementedError())
}

private class FakeDoctorOnboardingClient(
    private val outcome: Result<String> = Result.success("doc-42"),
) : DoctorOnboardingClient(
    supabaseClient = mockk<SupabaseClient>(relaxed = true),
    sharedHttp = OkHttpClient(),
    json = Json { ignoreUnknownKeys = true },
) {
    val calls = mutableListOf<DoctorOnboardingSubmission>()

    override suspend fun submitOnboarding(submission: DoctorOnboardingSubmission): Result<String> {
        calls += submission
        return outcome
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorOnboardingViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial load strips PENDING placeholder license and General placeholder specialty`() = runTest {
        val viewModel = DoctorOnboardingViewModel(
            authRepository = FakeOnboardingAuthRepo(),
            doctorRepository = FakeOnboardingDoctorRepo(
                DoctorProfile(
                    id = "doc-1",
                    userId = "user-1",
                    licenseNumber = "PENDING-12345678",
                    specialty = "General",
                    active = false,
                )
            ),
            onboardingClient = FakeDoctorOnboardingClient(),
        )

        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.firstName).isEqualTo("María")
        assertThat(state.lastName).isEqualTo("Gómez")
        assertThat(state.licenseNumber).isEmpty()
        assertThat(state.specialty).isEmpty()
        assertThat(state.careCountry).isEqualTo("AR")
        assertThat(state.licenseType).isEqualTo("MN")
    }

    @Test
    fun `switching country between AR and BR updates licenseType cleanly`() = runTest {
        val viewModel = DoctorOnboardingViewModel(
            authRepository = FakeOnboardingAuthRepo(),
            doctorRepository = FakeOnboardingDoctorRepo(),
            onboardingClient = FakeDoctorOnboardingClient(),
        )
        advanceUntilIdle()

        viewModel.onLicenseTypeChange("MP")
        assertThat(viewModel.uiState.value.licenseType).isEqualTo("MP")

        viewModel.onCountryChange("BR")
        assertThat(viewModel.uiState.value.careCountry).isEqualTo("BR")
        assertThat(viewModel.uiState.value.licenseType).isEqualTo("CRM")

        viewModel.onCountryChange("AR")
        assertThat(viewModel.uiState.value.careCountry).isEqualTo("AR")
        assertThat(viewModel.uiState.value.licenseType).isEqualTo("MN")
    }

    @Test
    fun `submitting with blank or PENDING license fails validation without calling client`() = runTest {
        val client = FakeDoctorOnboardingClient()
        val viewModel = DoctorOnboardingViewModel(
            authRepository = FakeOnboardingAuthRepo(),
            doctorRepository = FakeOnboardingDoctorRepo(),
            onboardingClient = client,
        )
        advanceUntilIdle()

        viewModel.onSpecialtyChange("Cardiología")
        viewModel.onLicenseNumberChange("PENDING")
        viewModel.submit()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.submittedSuccess).isFalse()
        assertThat(state.error).isNotNull()
        assertThat(client.calls).isEmpty()
    }

    @Test
    fun `submitting valid AR onboarding transitions submittedSuccess to true`() = runTest {
        val client = FakeDoctorOnboardingClient(Result.success("doc-42"))
        val viewModel = DoctorOnboardingViewModel(
            authRepository = FakeOnboardingAuthRepo(),
            doctorRepository = FakeOnboardingDoctorRepo(),
            onboardingClient = client,
        )
        advanceUntilIdle()

        viewModel.onCountryChange("AR")
        viewModel.onLicenseTypeChange("MN")
        viewModel.onLicenseNumberChange("145890")
        viewModel.onJurisdictionChange("CABA")
        viewModel.onSpecialtyChange("Clínica Médica")
        viewModel.submit()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.submittedSuccess).isTrue()
        assertThat(state.error).isNull()
        assertThat(client.calls).hasSize(1)
        assertThat(client.calls.single().careCountry).isEqualTo("AR")
        assertThat(client.calls.single().licenseType).isEqualTo("MN")
        assertThat(client.calls.single().licenseNumber).isEqualTo("145890")
        assertThat(client.calls.single().specialty).isEqualTo("Clínica Médica")
    }

    @Test
    fun `submitting duplicate license 409 sets duplicate license error message`() = runTest {
        val client = FakeDoctorOnboardingClient(
            Result.failure(DoctorOnboardingException(409, "license_number_already_exists"))
        )
        val viewModel = DoctorOnboardingViewModel(
            authRepository = FakeOnboardingAuthRepo(),
            doctorRepository = FakeOnboardingDoctorRepo(),
            onboardingClient = client,
        )
        advanceUntilIdle()

        viewModel.onCountryChange("BR")
        viewModel.onUfBrazilChange("SP")
        viewModel.onLicenseNumberChange("198432")
        viewModel.onSpecialtyChange("Medicina de Família")
        viewModel.submit()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.submittedSuccess).isFalse()
        assertThat(state.error).contains("registrada")
    }
}
