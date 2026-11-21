package com.autamedica.android.presentation.doctors.signature

import com.autamedica.android.R
import com.autamedica.android.data.local.SecurePreferences
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorSignatureViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var supabaseClient: SupabaseClient
    private lateinit var securePreferences: SecurePreferences
    private lateinit var viewModel: DoctorSignatureViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        supabaseClient = mockk(relaxed = true)
        securePreferences = mockk(relaxed = true)
        viewModel = DoctorSignatureViewModel(supabaseClient, securePreferences)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `rejects short license number before querying backend`() = runTest(testDispatcher) {
        viewModel.validateDoctorLicense(dni = "12345678909", medicalLicense = "12")
        val state = viewModel.state.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.sisaValidated).isFalse()
        assertThat(state.errorMessageRes).isEqualTo(R.string.signature_error_invalid_license)
    }

    @Test
    fun `clearError resets validation and error state`() = runTest(testDispatcher) {
        viewModel.validateDoctorLicense(dni = "12345678909", medicalLicense = "12")
        assertThat(viewModel.state.value.errorMessageRes).isNotNull()
        viewModel.clearError()
        assertThat(viewModel.state.value.errorMessageRes).isNull()
        assertThat(viewModel.state.value.errorMessage).isNull()
    }
}
