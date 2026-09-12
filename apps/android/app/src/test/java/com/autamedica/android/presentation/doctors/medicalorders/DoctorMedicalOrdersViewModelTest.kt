package com.autamedica.android.presentation.doctors.medicalorders

import com.autamedica.android.domain.model.CreateMedicalOrderRequest
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.domain.repository.MedicalOrderRepository
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
class DoctorMedicalOrdersViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeMedicalOrderRepo: FakeMedicalOrderRepository
    private lateinit var fakePrescriptionRepo: FakePrescriptionRepository
    private lateinit var viewModel: DoctorMedicalOrdersViewModel

    private val sampleOrders = listOf(
        MedicalOrder(
            id = "order-1",
            cuir = "AR-ORD-20260912-001091",
            status = "signed",
            studyType = StudyType.LABORATORY,
            practices = listOf(PracticeItem("Hemograma completo"), PracticeItem("Glucemia en ayunas")),
            diagnosis = "Control anual de rutina",
            notes = "Ayuno 8 hs",
            qrCodeContent = "https://autamedica.com/verify/AR-ORD-20260912-001091",
            signedPdfUrl = "https://bucket/order-1.pdf",
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Juan Pérez",
            patientDni = "30123456",
            createdAt = "2026-09-12T10:00:00Z",
        ),
        MedicalOrder(
            id = "order-2",
            cuir = "AR-ORD-20260910-002488",
            status = "signed",
            studyType = StudyType.IMAGING,
            practices = listOf(PracticeItem("Ecografía abdominal completa")),
            diagnosis = "Dolor en hipocondrio derecho",
            notes = "Ayuno 6 hs y vejiga llena",
            qrCodeContent = "https://autamedica.com/verify/AR-ORD-20260910-002488",
            signedPdfUrl = null,
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "María López",
            patientDni = "28987654",
            createdAt = "2026-09-10T15:30:00Z",
        ),
        MedicalOrder(
            id = "order-3",
            cuir = "AR-ORD-20260908-003311",
            status = "signed",
            studyType = StudyType.CARDIOLOGY,
            practices = listOf(PracticeItem("Electrocardiograma (ECG)")),
            diagnosis = "Palpitaciones y disnea de esfuerzo",
            notes = null,
            qrCodeContent = "https://autamedica.com/verify/AR-ORD-20260908-003311",
            signedPdfUrl = null,
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Carlos Rossi",
            patientDni = "25111222",
            createdAt = "2026-09-08T09:15:00Z",
        ),
    )

    private val samplePatients = listOf(
        PrescriptionPatientItem(
            patientId = "pat-1",
            fullName = "Juan Pérez",
            dni = "30123456",
            birthDate = "1985-05-12",
        ),
        PrescriptionPatientItem(
            patientId = "pat-2",
            fullName = "María López",
            dni = "28987654",
            birthDate = "1990-11-23",
        ),
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeMedicalOrderRepo = FakeMedicalOrderRepository(sampleOrders)
        fakePrescriptionRepo = FakePrescriptionRepository(samplePatients)
        viewModel = DoctorMedicalOrdersViewModel(fakeMedicalOrderRepo, fakePrescriptionRepo)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadOrders populates orders and computes counters correctly`() = runTest {
        val state = viewModel.uiState.value
        assertThat(state.orders).hasSize(3)
        assertThat(state.filteredOrders).hasSize(3)
        assertThat(state.totalCount).isEqualTo(3)
        assertThat(state.labCount).isEqualTo(1)
        assertThat(state.imagingCount).isEqualTo(1)
        assertThat(state.cardioCount).isEqualTo(1)
        assertThat(state.otherCount).isEqualTo(0)
    }

    @Test
    fun `filter by LABORATORY updates filtered orders list`() = runTest {
        viewModel.setFilter(OrderFilter.LABORATORY)
        val state = viewModel.uiState.value
        assertThat(state.filteredOrders).hasSize(1)
        assertThat(state.filteredOrders.first().studyType).isEqualTo(StudyType.LABORATORY)
    }

    @Test
    fun `search query filters by patient name or practice`() = runTest {
        viewModel.onSearchQueryChange("Ecografía")
        val state = viewModel.uiState.value
        assertThat(state.filteredOrders).hasSize(1)
        assertThat(state.filteredOrders.first().id).isEqualTo("order-2")
    }

    @Test
    fun `createOrder calls repository and reloads list`() = runTest {
        viewModel.selectPatient(samplePatients.first())
        viewModel.onStudyTypeChange(StudyType.OTHER)
        viewModel.updatePractice(0, "Espirometría computarizada")
        viewModel.onDiagnosisChange("Asma bronquial leve")
        viewModel.onNotesChange("Sin medicación inhalatoria 12 hs previas")

        var successCalled = false
        viewModel.createOrder(onSuccess = { successCalled = true })

        assertThat(successCalled).isTrue()
        val state = viewModel.uiState.value
        assertThat(state.orders).hasSize(4)
        assertThat(state.userMessage).contains("AR-ORD")
    }

    @Test
    fun `createOrder without diagnosis sets error message`() = runTest {
        viewModel.selectPatient(samplePatients.first())
        viewModel.updatePractice(0, "Hemograma")
        viewModel.onDiagnosisChange("")

        viewModel.createOrder()

        val state = viewModel.uiState.value
        assertThat(state.errorMessage).contains("diagnóstico")
    }
}

private class FakeMedicalOrderRepository(
    initialOrders: List<MedicalOrder> = emptyList(),
) : MedicalOrderRepository {

    private val orders = initialOrders.toMutableList()

    override suspend fun getDoctorMedicalOrders(): Result<List<MedicalOrder>> {
        return Result.success(orders)
    }

    override suspend fun getPatientMedicalOrders(): Result<List<MedicalOrder>> {
        return Result.success(orders)
    }

    override suspend fun getMedicalOrderById(id: String): Result<MedicalOrder> {
        val found = orders.firstOrNull { it.id == id }
        return if (found != null) Result.success(found) else Result.failure(NoSuchElementException())
    }

    override suspend fun createMedicalOrder(request: CreateMedicalOrderRequest): Result<MedicalOrder> {
        val newOrder = MedicalOrder(
            id = "order-${orders.size + 1}",
            cuir = "AR-ORD-20260912-${orders.size + 1000}",
            status = "signed",
            studyType = request.studyType,
            practices = request.practices,
            diagnosis = request.diagnosis,
            notes = request.notes,
            qrCodeContent = "https://autamedica.com/verify/AR-ORD-20260912-${orders.size + 1000}",
            signedPdfUrl = null,
            doctorName = "Dr. Eduardo Da Rosa",
            doctorLicense = "MP006402",
            patientName = "Paciente Test",
            patientDni = "12345678",
            createdAt = "2026-09-12T12:00:00Z",
        )
        orders.add(0, newOrder)
        return Result.success(newOrder)
    }

    override suspend fun cancelMedicalOrder(orderId: String, reason: String): Result<Unit> {
        val index = orders.indexOfFirst { it.id == orderId }
        if (index != -1) {
            orders[index] = orders[index].copy(status = "cancelled")
            return Result.success(Unit)
        }
        return Result.failure(NoSuchElementException())
    }
}

private class FakePrescriptionRepository(
    private val patients: List<PrescriptionPatientItem>,
) : PrescriptionRepository {

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> {
        return Result.success(patients)
    }

    override suspend fun getDoctorEligibility(): Result<DoctorEligibility> {
        return Result.success(
            DoctorEligibility(
                isEligible = true,
                doctorLicense = "MP006402",
                validationStatus = "valid",
                reason = null,
            )
        )
    }

    override suspend fun getPatientPrescriptions(): Result<List<Prescription>> = Result.success(emptyList())
    override suspend fun getDoctorPrescriptions(patientId: String?, status: String?): Result<List<Prescription>> = Result.success(emptyList())
    override suspend fun getPrescriptionById(id: String): Result<Prescription> = Result.failure(NotImplementedError())
    override suspend fun createPrescription(request: CreatePrescriptionRequest): Result<Prescription> = Result.failure(NotImplementedError())
    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> = Result.success(Unit)
}
