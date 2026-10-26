package com.autamedica.android.presentation.doctors.certificates

import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.DoctorEligibility
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
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorCertificatesViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeCertRepo: FakeDoctorCertificateRepository
    private lateinit var fakePrescriptionRepo: FakeDoctorPrescriptionRepository
    private lateinit var viewModel: DoctorCertificatesViewModel

    private val sampleCertificates = listOf(
        MedicalCertificate(
            id = "cert-1",
            cuir = "AR-CERT-20260912-001091",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            daysOfRest = 2,
            startDate = "2026-09-12",
            endDate = "2026-09-14",
            diagnosis = "Gastroenteritis aguda",
            hideDiagnosis = false,
            observations = "Reposo 48 hs",
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Maximiliano Gutierrez",
            patientDni = "95123456",
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/AR-CERT-20260912-001091",
            countryCode = "AR",
            createdAt = "2026-09-12T00:00:00Z",
        ),
        MedicalCertificate(
            id = "cert-2",
            cuir = "AR-CERT-20260910-002488",
            status = "signed",
            certificateType = CertificateType.APTITUD_FISICA,
            daysOfRest = 0,
            startDate = "2026-09-10",
            endDate = "2027-09-10",
            diagnosis = "Apto para deportes",
            hideDiagnosis = false,
            observations = "Validez anual",
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Ana Gómez",
            patientDni = "34567890",
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/AR-CERT-20260910-002488",
            countryCode = "AR",
            createdAt = "2026-09-10T00:00:00Z",
        ),
        MedicalCertificate(
            id = "cert-3",
            cuir = "AR-CERT-20260901-009999",
            status = "cancelled",
            certificateType = CertificateType.CONSTANCIA_ATENCION,
            daysOfRest = 0,
            startDate = "2026-09-01",
            endDate = null,
            diagnosis = "Consulta ambulatoria",
            hideDiagnosis = false,
            observations = "Anulado por error de carga",
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Carlos Pérez",
            patientDni = "28999111",
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/AR-CERT-20260901-009999",
            countryCode = "AR",
            createdAt = "2026-09-01T00:00:00Z",
        )
    )

    private val samplePatients = listOf(
        PrescriptionPatientItem("pat-1", "Maximiliano Gutierrez", "95123456", "30 años"),
        PrescriptionPatientItem("pat-2", "Ana Gómez", "34567890", "28 años")
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeCertRepo = FakeDoctorCertificateRepository(sampleCertificates, samplePatients)
        fakePrescriptionRepo = FakeDoctorPrescriptionRepository(samplePatients)
        viewModel = DoctorCertificatesViewModel(fakeCertRepo, fakePrescriptionRepo)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialStateLoadsCertificatesAndCounts() = runTest {
        val state = viewModel.uiState.value
        assertThat(state.certificates).hasSize(3)
        assertThat(state.totalCount).isEqualTo(3)
        assertThat(state.validCount).isEqualTo(2)
        assertThat(state.cancelledCount).isEqualTo(1)
        assertThat(state.filteredCertificates).hasSize(3)
    }

    @Test
    fun filteringByStatusWorks() = runTest {
        viewModel.onSelectStatusFilter("validos")
        assertThat(viewModel.uiState.value.filteredCertificates).hasSize(2)

        viewModel.onSelectStatusFilter("cancelados")
        assertThat(viewModel.uiState.value.filteredCertificates).hasSize(1)
        assertThat(viewModel.uiState.value.filteredCertificates.first().id).isEqualTo("cert-3")
    }

    @Test
    fun searchingByPatientNameOrCuirWorks() = runTest {
        viewModel.onSearchQueryChange("Maximiliano")
        assertThat(viewModel.uiState.value.filteredCertificates).hasSize(1)
        assertThat(viewModel.uiState.value.filteredCertificates.first().id).isEqualTo("cert-1")

        viewModel.onSearchQueryChange("002488")
        assertThat(viewModel.uiState.value.filteredCertificates).hasSize(1)
        assertThat(viewModel.uiState.value.filteredCertificates.first().id).isEqualTo("cert-2")
    }

    @Test
    fun initCreateCertificatePreselectsPatientAndCalculatesEndDate() = runTest {
        viewModel.initCreateCertificate("pat-1")
        val state = viewModel.uiState.value
        assertThat(state.selectedPatient).isNotNull()
        assertThat(state.selectedPatient?.patientId).isEqualTo("pat-1")
        assertThat(state.certificateType).isEqualTo(CertificateType.REPOSO_LABORAL)
        assertThat(state.daysOfRest).isEqualTo(2)

        val expectedEnd = LocalDate.now().plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE)
        assertThat(state.endDate).isEqualTo(expectedEnd)
    }

    @Test
    fun changingDaysOfRestUpdatesEndDate() = runTest {
        viewModel.initCreateCertificate("pat-1")
        viewModel.onDaysOfRestChange(5)
        val state = viewModel.uiState.value
        assertThat(state.daysOfRest).isEqualTo(5)
        val expectedEnd = LocalDate.now().plusDays(5).format(DateTimeFormatter.ISO_LOCAL_DATE)
        assertThat(state.endDate).isEqualTo(expectedEnd)
    }

    @Test
    fun submitFailsWhenNoPatientSelected() = runTest {
        viewModel.initCreateCertificate("")
        viewModel.onDiagnosisChange("Diagnóstico válido")
        viewModel.onSubmitCertificate()

        assertThat(viewModel.uiState.value.createError).isEqualTo("Seleccione un paciente de la lista")
        assertThat(viewModel.uiState.value.createdCertificate).isNull()
    }

    @Test
    fun submitFailsWhenDiagnosisIsEmpty() = runTest {
        viewModel.initCreateCertificate("pat-1")
        viewModel.onDiagnosisChange("   ")
        viewModel.onSubmitCertificate()

        assertThat(viewModel.uiState.value.createError).isEqualTo("Ingrese un diagnóstico o motivo clínico de la certificación")
        assertThat(viewModel.uiState.value.createdCertificate).isNull()
    }

    @Test
    fun submitSucceedsWithValidDataAndRespectsHideDiagnosis() = runTest {
        viewModel.initCreateCertificate("pat-1")
        viewModel.onDiagnosisChange("Bronquitis aguda")
        viewModel.onToggleHideDiagnosis(true)
        viewModel.onObservationsChange("Reposo en cama")

        viewModel.onSubmitCertificate()

        val state = viewModel.uiState.value
        assertThat(state.createError).isNull()
        assertThat(state.createdCertificate).isNotNull()
        assertThat(state.createdCertificate?.hideDiagnosis).isTrue()
        assertThat(state.createdCertificate?.diagnosis).isNull() // Hidden in public model
        assertThat(state.userMessage).contains("Borrador de certificado guardado")
    }
}

private class FakeDoctorCertificateRepository(
    private val certificates: List<MedicalCertificate>,
    private val patients: List<PrescriptionPatientItem>,
) : MedicalCertificateRepository {
    override suspend fun getPatientCertificates(): Result<List<MedicalCertificate>> =
        Result.success(certificates)

    override suspend fun getCertificateById(id: String): Result<MedicalCertificate> =
        Result.success(certificates.first())

    override suspend fun getDoctorCertificates(patientId: String?): Result<List<MedicalCertificate>> =
        Result.success(certificates)

    override suspend fun createCertificate(request: CreateCertificateRequest): Result<MedicalCertificate> {
        val cert = MedicalCertificate(
            id = "new-cert",
            cuir = "AR-CERT-20260912-TEST01",
            status = "draft",
            certificateType = request.certificateType,
            daysOfRest = request.daysOfRest,
            startDate = request.startDate,
            endDate = request.endDate,
            diagnosis = if (request.hideDiagnosis) null else request.diagnosis,
            hideDiagnosis = request.hideDiagnosis,
            observations = request.observations,
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Maximiliano Gutierrez",
            patientDni = "95123456",
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/AR-CERT-20260912-TEST01",
            countryCode = request.countryCode,
            createdAt = "2026-09-12T00:00:00Z"
        )
        return Result.success(cert)
    }

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> =
        Result.success(patients)
}

private class FakeDoctorPrescriptionRepository(
    private val patients: List<PrescriptionPatientItem>,
) : PrescriptionRepository {
    override suspend fun getPatientPrescriptions(): Result<List<Prescription>> = Result.success(emptyList())
    override suspend fun getPrescriptionById(id: String): Result<Prescription> = Result.failure(NoSuchElementException())
    override suspend fun getDoctorPrescriptions(patientId: String?, status: String?): Result<List<Prescription>> = Result.success(emptyList())
    override suspend fun createPrescription(request: com.autamedica.android.domain.model.CreatePrescriptionRequest): Result<Prescription> = Result.failure(NotImplementedError())
    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> = Result.success(Unit)
    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> = Result.success(patients)
    override suspend fun getDoctorEligibility(): Result<DoctorEligibility> =
        Result.success(DoctorEligibility(true, "MP006402", "valid"))
}
