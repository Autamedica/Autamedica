package com.autamedica.android.presentation.doctors.signature

import com.autamedica.core.util.CpfValidator
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.Locale

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorSignatureViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val supabaseClient: SupabaseClient = mockk(relaxed = true)
    private lateinit var viewModel: DoctorSignatureViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        viewModel = DoctorSignatureViewModel(supabaseClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `brazil context rejects invalid cpf with repeated digits`() {
        viewModel.validateProfessionalDocument(
            documentNumber = "111.111.111-11",
            medicalLicense = "CRM-RS 12345",
            countryCode = "BR",
        )

        assertThat(viewModel.state.value.sisaValidated).isFalse()
        assertThat(viewModel.state.value.errorMessage).isEqualTo("Informe um CPF válido (11 dígitos)")
    }

    @Test
    fun `brazil context rejects invalid cpf with wrong checksum`() {
        viewModel.validateProfessionalDocument(
            documentNumber = "123.456.789-00",
            medicalLicense = "12345",
            countryCode = "BR",
        )

        assertThat(viewModel.state.value.sisaValidated).isFalse()
        assertThat(viewModel.state.value.errorMessage).isEqualTo("Informe um CPF válido (11 dígitos)")
    }

    @Test
    fun `brazil context accepts valid cpf and proceeds to verify`() {
        // Valid CPF: 52998224725
        val validCpf = "529.982.247-25"
        assertThat(CpfValidator.isValid(validCpf)).isTrue()

        viewModel.validateProfessionalDocument(
            documentNumber = validCpf,
            medicalLicense = "CRM 12345",
            countryCode = "BR",
        )

        // Error message for document format should NOT be set
        assertThat(viewModel.state.value.errorMessage).isNotEqualTo("Informe um CPF válido (11 dígitos)")
    }

    @Test
    fun `argentina context validates dni length 7 to 9 digits`() {
        // Valid DNI
        viewModel.validateProfessionalDocument(
            documentNumber = "35123456",
            medicalLicense = "MN 123456",
            countryCode = "AR",
        )
        assertThat(viewModel.state.value.errorMessage).isNotEqualTo("Ingrese un DNI válido (7 a 9 dígitos)")

        // Invalid short DNI
        viewModel.validateProfessionalDocument(
            documentNumber = "12345",
            medicalLicense = "MN 123456",
            countryCode = "AR",
        )
        assertThat(viewModel.state.value.sisaValidated).isFalse()
        assertThat(viewModel.state.value.errorMessage).isEqualTo("Ingrese un DNI válido (7 a 9 dígitos)")
    }
}
