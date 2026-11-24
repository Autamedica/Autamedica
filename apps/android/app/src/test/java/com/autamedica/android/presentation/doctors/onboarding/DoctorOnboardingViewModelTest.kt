package com.autamedica.android.presentation.doctors.onboarding

import com.autamedica.android.data.repository.DoctorOnboardingClient
import com.autamedica.android.data.repository.DoctorOnboardingException
import com.autamedica.android.data.repository.DoctorOnboardingSubmission
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class DoctorOnboardingViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val sampleUser = User(
        id = "user-1",
        email = "doc@autamedica.com",
        firstName = "María",
        lastName = "Gómez",
        phone = "+5491112345678",
        role = UserRole.DOCTOR,
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun fakeAuthRepository(user: User? = sampleUser): AuthRepository = mockk {
        coEvery { observeSession() } returns flowOf(user)
        coEvery { getCurrentUser() } returns user
    }

    private fun fakeDoctorRepository(profile: DoctorProfile?): DoctorRepository = mockk {
        coEvery { getDoctorProfile(any()) } returns (
            profile?.let { Result.success(it) } ?: Result.failure(NoSuchElementException("missing"))
        )
    }

    @Test
    fun `initial load strips PENDING placeholder license and General placeholder specialty`() = runTest {
        val viewModel = DoctorOnboardingViewModel(
            authRepository = fakeAuthRepository(),
            doctorRepository = fakeDoctorRepository(
                DoctorProfile(
                    id = "doc-1",
                    userId = "user-1",
                    licenseNumber = "PENDING-12345678",
                    specialty = "General",
                    active = false,
                )
            ),
            onboardingClient = mockk(relaxed = true),
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
            authRepository = fakeAuthRepository(),
            doctorRepository = fakeDoctorRepository(null),
            onboardingClient = mockk(relaxed = true),
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
        val client = mockk<DoctorOnboardingClient>(relaxed = true)
        val viewModel = DoctorOnboardingViewModel(
            authRepository = fakeAuthRepository(),
            doctorRepository = fakeDoctorRepository(null),
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
        coVerify(exactly = 0) { client.submitOnboarding(any()) }
    }

    @Test
    fun `submitting valid AR onboarding transitions submittedSuccess to true`() = runTest {
        val client = mockk<DoctorOnboardingClient>()
        coEvery { client.submitOnboarding(any()) } returns Result.success("doc-42")

        val viewModel = DoctorOnboardingViewModel(
            authRepository = fakeAuthRepository(),
            doctorRepository = fakeDoctorRepository(null),
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
        coVerify(exactly = 1) {
            client.submitOnboarding(
                match {
                    it.careCountry == "AR" &&
                        it.licenseType == "MN" &&
                        it.licenseNumber == "145890" &&
                        it.specialty == "Clínica Médica"
                }
            )
        }
    }

    @Test
    fun `submitting duplicate license 409 sets duplicate license error message`() = runTest {
        val client = mockk<DoctorOnboardingClient>()
        coEvery { client.submitOnboarding(any()) } returns Result.failure(
            DoctorOnboardingException(409, "license_number_already_exists")
        )

        val viewModel = DoctorOnboardingViewModel(
            authRepository = fakeAuthRepository(),
            doctorRepository = fakeDoctorRepository(null),
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
