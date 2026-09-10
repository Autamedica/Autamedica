package com.autamedica.android.presentation.prescriptions

import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PrescriptionsViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeRepository: FakePrescriptionRepository
    private lateinit var viewModel: PrescriptionsViewModel

    private val samplePrescriptions = listOf(
        Prescription(
            id = "rx-1",
            status = "activa",
            cuir = "CUIR-001",
            signedPdfUrl = "https://storage.autamedica.com/rx1.pdf",
            qrCodeContent = null,
            medicationName = "Losartán 50mg",
            dosage = "50mg",
            frequency = "Cada 12 hs",
            instructions = "En ayunas",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            createdAt = "2026-09-08T00:00:00Z",
            countryCode = "AR",
            duration = "30 días",
        ),
        Prescription(
            id = "rx-2",
            status = "dispensada",
            cuir = "CUIR-002",
            signedPdfUrl = null,
            qrCodeContent = null,
            medicationName = "Amoxicilina 500mg",
            dosage = "500mg",
            frequency = "Cada 8 hs",
            instructions = "Completar 7 días",
            doctorName = "Dra. Ana López",
            doctorLicense = "MP 67890",
            createdAt = "2026-09-01T00:00:00Z",
            countryCode = "AR",
            duration = "7 días",
        ),
        Prescription(
            id = "rx-3",
            status = "completada",
            cuir = "CUIR-003",
            signedPdfUrl = null,
            qrCodeContent = null,
            medicationName = "Ibuprofeno 400mg",
            dosage = "400mg",
            frequency = "Cada 8 hs",
            instructions = "Con comida",
            doctorName = "Dr. Carlos Ruiz",
            doctorLicense = "MN 11111",
            createdAt = "2026-08-15T00:00:00Z",
            countryCode = "AR",
            duration = "3 días",
        ),
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakePrescriptionRepository(samplePrescriptions)
        viewModel = PrescriptionsViewModel(fakeRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialStateLoadsPrescriptionsAndCalculatesActiveCount() = runTest {
        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.prescriptions).hasSize(3)
        assertThat(state.activeCount).isEqualTo(1)
        assertThat(state.selectedFilter).isEqualTo(PrescriptionFilter.TODAS)
        assertThat(state.filteredPrescriptions).hasSize(3)
    }

    @Test
    fun filteringByActivasReturnsOnlyActivePrescriptions() = runTest {
        viewModel.setFilter(PrescriptionFilter.ACTIVAS)
        val state = viewModel.uiState.value
        assertThat(state.selectedFilter).isEqualTo(PrescriptionFilter.ACTIVAS)
        assertThat(state.filteredPrescriptions).hasSize(1)
        assertThat(state.filteredPrescriptions.first().id).isEqualTo("rx-1")
    }

    @Test
    fun filteringByDispensadasReturnsOnlyDispensedPrescriptions() = runTest {
        viewModel.setFilter(PrescriptionFilter.DISPENSADAS)
        val state = viewModel.uiState.value
        assertThat(state.selectedFilter).isEqualTo(PrescriptionFilter.DISPENSADAS)
        assertThat(state.filteredPrescriptions).hasSize(1)
        assertThat(state.filteredPrescriptions.first().id).isEqualTo("rx-2")
    }

    @Test
    fun filteringByCompletadasReturnsOnlyCompletedPrescriptions() = runTest {
        viewModel.setFilter(PrescriptionFilter.COMPLETADAS)
        val state = viewModel.uiState.value
        assertThat(state.selectedFilter).isEqualTo(PrescriptionFilter.COMPLETADAS)
        assertThat(state.filteredPrescriptions).hasSize(1)
        assertThat(state.filteredPrescriptions.first().id).isEqualTo("rx-3")
    }

    @Test
    fun selectingAndClearingPrescriptionUpdatesState() = runTest {
        val target = samplePrescriptions.first()
        viewModel.selectPrescription(target)
        assertThat(viewModel.uiState.value.selectedPrescription).isEqualTo(target)

        viewModel.clearSelectedPrescription()
        assertThat(viewModel.uiState.value.selectedPrescription).isNull()
    }
}

private class FakePrescriptionRepository(
    private val items: List<Prescription> = emptyList(),
) : PrescriptionRepository {
    override suspend fun getPatientPrescriptions(): Result<List<Prescription>> = Result.success(items)
    override suspend fun getPrescriptionById(id: String): Result<Prescription> {
        val item = items.find { it.id == id }
        return if (item != null) Result.success(item) else Result.failure(NoSuchElementException())
    }
}
