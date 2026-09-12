package com.autamedica.android.presentation.prescriptions

import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.MedicalCertificateRepository
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
    private lateinit var fakeCertificateRepository: FakeMedicalCertificateRepository
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

    private val sampleCertificates = listOf(
        MedicalCertificate(
            id = "cert-1",
            cuir = "AR-CERT-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            daysOfRest = 2,
            startDate = "2026-09-11",
            endDate = "2026-09-13",
            diagnosis = "Gastroenteritis aguda",
            hideDiagnosis = false,
            observations = "Reposo en domicilio con hidratación",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            patientName = "Maximiliano",
            patientDni = "34567890",
            signedPdfUrl = "https://storage.autamedica.com/cert1.pdf",
            qrCodeContent = "https://autamedica.com/verify/AR-CERT-001",
            countryCode = "AR",
            createdAt = "2026-09-11T12:00:00Z",
        ),
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakePrescriptionRepository(samplePrescriptions)
        fakeCertificateRepository = FakeMedicalCertificateRepository(sampleCertificates)
        viewModel = PrescriptionsViewModel(fakeRepository, fakeCertificateRepository)
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
        assertThat(state.certificates).hasSize(1)
        assertThat(state.activeCount).isEqualTo(1)
        assertThat(state.activeCertificatesCount).isEqualTo(1)
        assertThat(state.selectedTab).isEqualTo(DocumentTab.RECETAS)
        assertThat(state.selectedFilter).isEqualTo(PrescriptionFilter.TODAS)
        assertThat(state.filteredPrescriptions).hasSize(3)
    }

    @Test
    fun switchingTabsUpdatesSelectedTab() = runTest {
        viewModel.selectTab(DocumentTab.ATESTADOS)
        val state = viewModel.uiState.value
        assertThat(state.selectedTab).isEqualTo(DocumentTab.ATESTADOS)
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

    @Test
    fun selectingAndClearingCertificateUpdatesState() = runTest {
        val target = sampleCertificates.first()
        viewModel.selectCertificate(target)
        assertThat(viewModel.uiState.value.selectedCertificate).isEqualTo(target)

        viewModel.clearSelectedCertificate()
        assertThat(viewModel.uiState.value.selectedCertificate).isNull()
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

    override suspend fun getDoctorPrescriptions(patientId: String?, status: String?): Result<List<Prescription>> =
        Result.success(items)

    override suspend fun createPrescription(request: com.autamedica.android.domain.model.CreatePrescriptionRequest): Result<Prescription> =
        Result.success(items.first())

    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> =
        Result.success(emptyList())

    override suspend fun getDoctorEligibility(): Result<com.autamedica.android.domain.model.DoctorEligibility> =
        Result.success(com.autamedica.android.domain.model.DoctorEligibility(true, "MN 12345", "valid"))
}

private class FakeMedicalCertificateRepository(
    private val items: List<MedicalCertificate> = emptyList(),
) : MedicalCertificateRepository {
    override suspend fun getPatientCertificates(): Result<List<MedicalCertificate>> = Result.success(items)
    override suspend fun getCertificateById(id: String): Result<MedicalCertificate> {
        val item = items.find { it.id == id }
        return if (item != null) Result.success(item) else Result.failure(NoSuchElementException())
    }

    override suspend fun getDoctorCertificates(patientId: String?): Result<List<MedicalCertificate>> =
        Result.success(items)

    override suspend fun createCertificate(request: CreateCertificateRequest): Result<MedicalCertificate> =
        Result.success(items.first())

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> =
        Result.success(emptyList())
}
