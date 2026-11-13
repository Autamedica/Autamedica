package com.autamedica.android.presentation.doctors.prescriptions

import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
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
class DoctorPrescriptionsViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeRepository: FakeDoctorPrescriptionRepository
    private lateinit var viewModel: DoctorPrescriptionsViewModel

    private val samplePrescriptions = listOf(
        Prescription(
            id = "rx-101",
            status = "signed",
            cuir = "AR-MD-1A2B-C3D4E5",
            signedPdfUrl = "https://storage.autamedica.com/rx101.pdf",
            qrCodeContent = "https://autamedica.com/verify/AR-MD-1A2B-C3D4E5",
            medicationName = "Losartán 50 mg",
            dosage = "50 mg",
            frequency = "Cada 12 horas",
            instructions = "Con abundante agua",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            createdAt = "2026-09-10T14:00:00Z",
            countryCode = "AR",
            duration = "Por 30 días",
            diagnosis = "I10 - Hipertensión esencial",
            patientName = "Carlos Tévez",
            patientDni = "33123456",
            items = listOf(
                PrescriptionItem(
                    medicationName = "Losartán 50 mg",
                    dosage = "50 mg",
                    frequency = "Cada 12 horas",
                    duration = "Por 30 días"
                )
            ),
        ),
        Prescription(
            id = "rx-102",
            status = "dispensed",
            cuir = "AR-MD-2B3C-D4E5F6",
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/AR-MD-2B3C-D4E5F6",
            medicationName = "Amoxicilina 500 mg",
            dosage = "500 mg",
            frequency = "Cada 8 horas",
            instructions = "Tomar junto a las comidas",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            createdAt = "2026-09-05T10:00:00Z",
            countryCode = "AR",
            duration = "Por 7 días",
            diagnosis = "J02.9 - Faringitis aguda",
            patientName = "Lionel Messi",
            patientDni = "30987654",
            items = listOf(
                PrescriptionItem(
                    medicationName = "Amoxicilina 500 mg",
                    dosage = "500 mg",
                    frequency = "Cada 8 horas",
                    duration = "Por 7 días"
                )
            ),
        ),
        Prescription(
            id = "rx-103",
            status = "cancelled",
            cuir = "AR-MD-3C4D-E5F6A7",
            signedPdfUrl = null,
            qrCodeContent = null,
            medicationName = "Clonazepam 0.5 mg",
            dosage = "0.5 mg",
            frequency = "Antes de dormir",
            instructions = "Uso condicionado",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            createdAt = "2026-08-20T18:00:00Z",
            countryCode = "AR",
            duration = "Por 15 días",
            diagnosis = "F41.1 - Ansiedad generalizada",
            patientName = "Ángel Di María",
            patientDni = "32456789",
        ),
    )

    private val samplePatients = listOf(
        PrescriptionPatientItem(
            patientId = "pat-1",
            fullName = "Carlos Tévez",
            dni = "33123456",
            birthDate = "1984-02-05"
        ),
        PrescriptionPatientItem(
            patientId = "pat-2",
            fullName = "Lionel Messi",
            dni = "30987654",
            birthDate = "1987-06-24"
        ),
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakeDoctorPrescriptionRepository(
            prescriptions = samplePrescriptions.toMutableList(),
            patients = samplePatients
        )
        viewModel = DoctorPrescriptionsViewModel(fakeRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialStateLoadsPrescriptionsAndComputesMetrics() = runTest {
        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.prescriptions).hasSize(3)
        assertThat(state.totalCount).isEqualTo(3)
        assertThat(state.activeCount).isEqualTo(1)
        assertThat(state.dispensedCount).isEqualTo(1)
        assertThat(state.cancelledCount).isEqualTo(1)
        assertThat(state.filteredPrescriptions).hasSize(3)
    }

    @Test
    fun searchingByDniOrMedicationFiltersCorrectly() = runTest {
        viewModel.onSearchQueryChanged("30987654")
        var state = viewModel.uiState.value
        assertThat(state.filteredPrescriptions).hasSize(1)
        assertThat(state.filteredPrescriptions.first().patientName).isEqualTo("Lionel Messi")

        viewModel.onSearchQueryChanged("Amoxicilina")
        state = viewModel.uiState.value
        assertThat(state.filteredPrescriptions).hasSize(1)
        assertThat(state.filteredPrescriptions.first().id).isEqualTo("rx-102")

        viewModel.onSearchQueryChanged("Inexistente")
        state = viewModel.uiState.value
        assertThat(state.filteredPrescriptions).isEmpty()
    }

    @Test
    fun filteringByStatusReturnsCorrectSubset() = runTest {
        viewModel.onStatusFilterChanged("activa")
        assertThat(viewModel.uiState.value.filteredPrescriptions).hasSize(1)
        assertThat(viewModel.uiState.value.filteredPrescriptions.first().id).isEqualTo("rx-101")

        viewModel.onStatusFilterChanged("dispensada")
        assertThat(viewModel.uiState.value.filteredPrescriptions).hasSize(1)
        assertThat(viewModel.uiState.value.filteredPrescriptions.first().id).isEqualTo("rx-102")

        viewModel.onStatusFilterChanged("cancelada")
        assertThat(viewModel.uiState.value.filteredPrescriptions).hasSize(1)
        assertThat(viewModel.uiState.value.filteredPrescriptions.first().id).isEqualTo("rx-103")

        viewModel.onStatusFilterChanged("todas")
        assertThat(viewModel.uiState.value.filteredPrescriptions).hasSize(3)
    }

    @Test
    fun cancellationFlowRequiresMotiveAndUpdatesState() = runTest {
        val target = samplePrescriptions.first()
        viewModel.onRequestCancelPrescription(target)
        assertThat(viewModel.uiState.value.prescriptionToCancel).isEqualTo(target)

        // Attempt without motive
        viewModel.onConfirmCancelPrescription("")
        assertThat(viewModel.uiState.value.cancellationError).isNotNull()
        assertThat(viewModel.uiState.value.prescriptionToCancel).isEqualTo(target)

        // Confirm with valid clinical motive
        viewModel.onConfirmCancelPrescription("Ajuste de dosis a 100 mg")
        assertThat(viewModel.uiState.value.prescriptionToCancel).isNull()
        assertThat(fakeRepository.lastCancelledId).isEqualTo("rx-101")
        assertThat(fakeRepository.lastCancellationReason).isEqualTo("Ajuste de dosis a 100 mg")
    }

    @Test
    fun createPrescriptionValidatesMandatoryFields() = runTest {
        viewModel.initCreatePrescription("")

        // 1. Missing patient
        viewModel.onSubmitPrescription()
        assertThat(viewModel.uiState.value.createError).contains("paciente")

        // Select patient
        viewModel.onSelectPatient(samplePatients.first())

        // 2. Missing medication name
        viewModel.onSubmitPrescription()
        assertThat(viewModel.uiState.value.createError).contains("medicamento")

        // Fill medication name, miss dosage
        viewModel.onMedicationNameChanged(0, "Ibuprofeno 400 mg")
        viewModel.onSubmitPrescription()
        assertThat(viewModel.uiState.value.createError).contains("dosis")

        // Fill dosage, miss frequency
        viewModel.onDosageChanged(0, "400 mg")
        viewModel.onSubmitPrescription()
        assertThat(viewModel.uiState.value.createError).contains("frecuencia")

        // Fill frequency, miss diagnosis
        viewModel.onFrequencyChanged(0, "Cada 8 horas")
        viewModel.onSubmitPrescription()
        assertThat(viewModel.uiState.value.createError).contains("diagnóstico")
    }

    @Test
    fun multiItemFormAllowsUpToThreeItems() = runTest {
        viewModel.initCreatePrescription("")
        assertThat(viewModel.uiState.value.items).hasSize(1)

        viewModel.onAddMedicationItem()
        assertThat(viewModel.uiState.value.items).hasSize(2)

        viewModel.onAddMedicationItem()
        assertThat(viewModel.uiState.value.items).hasSize(3)

        // Cannot exceed 3
        viewModel.onAddMedicationItem()
        assertThat(viewModel.uiState.value.items).hasSize(3)

        // Remove item
        viewModel.onRemoveMedicationItem(1)
        assertThat(viewModel.uiState.value.items).hasSize(2)
    }


    @Test
    fun pendingDoctorCannotCreatePrescriptionEvenWithLicense() = runTest {
        fakeRepository.eligibilityResult =
            Result.success(DoctorEligibility(false, "MN 12345", "pending", "Validación pendiente"))
        viewModel.loadEligibility()
        prepareValidPrescription()
        viewModel.onSubmitPrescription()

        assertThat(viewModel.uiState.value.createError).contains("pendiente")
        assertThat(viewModel.uiState.value.createdPrescription).isNull()
        assertThat(fakeRepository.createAttempts).isEqualTo(0)
    }

    @Test
    fun eligibilityLookupFailureBlocksPrescriptionCreation() = runTest {
        fakeRepository.eligibilityResult = Result.failure(IllegalStateException("offline"))
        viewModel.loadEligibility()
        prepareValidPrescription()
        viewModel.onSubmitPrescription()

        assertThat(viewModel.uiState.value.createError).contains("verificar")
        assertThat(fakeRepository.createAttempts).isEqualTo(0)
    }

    private fun prepareValidPrescription() {
        viewModel.initCreatePrescription(samplePatients.first().patientId)
        viewModel.onSelectPatient(samplePatients.first())
        viewModel.onMedicationNameChanged(0, "Enalapril 10 mg")
        viewModel.onDosageChanged(0, "10 mg")
        viewModel.onFrequencyChanged(0, "Cada 24 horas")
        viewModel.onDiagnosisChanged("Hipertensión esencial", "I10")
    }

    @Test
    fun createPrescriptionSuccessEmitsOfficialCuir() = runTest {
        viewModel.initCreatePrescription(samplePatients.first().patientId)
        viewModel.onSelectPatient(samplePatients.first())
        viewModel.onMedicationNameChanged(0, "Enalapril 10 mg")
        viewModel.onDosageChanged(0, "10 mg")
        viewModel.onFrequencyChanged(0, "Cada 24 horas")
        viewModel.onDurationChanged(0, "Tratamiento crónico")
        viewModel.onDiagnosisChanged("Hipertensión esencial", "I10")

        var successCalled = false
        viewModel.onSubmitPrescription { created ->
            successCalled = true
            assertThat(created.cuir).startsWith("AR-MD-")
        }

        val state = viewModel.uiState.value
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.createdPrescription).isNotNull()
        assertThat(state.createdPrescription?.cuir).isNotNull()
        assertThat(successCalled).isTrue()
    }
}

private class FakeDoctorPrescriptionRepository(
    private val prescriptions: MutableList<Prescription> = mutableListOf(),
    private val patients: List<PrescriptionPatientItem> = emptyList(),
) : PrescriptionRepository {

    var eligibilityResult: Result<DoctorEligibility> =
        Result.success(DoctorEligibility(isEligible = true, doctorLicense = "MN 12345", validationStatus = "valid"))
    var createAttempts: Int = 0
    var lastCancelledId: String? = null
    var lastCancellationReason: String? = null

    override suspend fun getPatientPrescriptions(): Result<List<Prescription>> =
        Result.success(prescriptions)

    override suspend fun getPrescriptionById(id: String): Result<Prescription> {
        val found = prescriptions.find { it.id == id }
        return if (found != null) Result.success(found) else Result.failure(NoSuchElementException())
    }

    override suspend fun getDoctorPrescriptions(patientId: String?, status: String?): Result<List<Prescription>> {
        var filtered = prescriptions.toList()
        if (!patientId.isNullOrBlank()) {
            filtered = filtered.filter { it.patientDni == patientId || it.id == patientId }
        }
        if (!status.isNullOrBlank()) {
            filtered = when (status.lowercase()) {
                "activa", "signed" -> filtered.filter { it.isActive }
                "dispensada" -> filtered.filter { it.isDispensed }
                "cancelada" -> filtered.filter { it.isCancelled }
                else -> filtered
            }
        }
        return Result.success(filtered)
    }

    override suspend fun createPrescription(request: CreatePrescriptionRequest): Result<Prescription> {
        createAttempts++
        val cuir = "AR-MD-${System.currentTimeMillis().toString(16).uppercase()}-112233"
        val firstItem = request.items.first()
        val created = Prescription(
            id = "rx-new-${System.currentTimeMillis()}",
            status = "signed",
            cuir = cuir,
            signedPdfUrl = null,
            qrCodeContent = "https://autamedica.com/verify/$cuir",
            medicationName = firstItem.medicationName,
            dosage = firstItem.dosage,
            frequency = firstItem.frequency,
            instructions = firstItem.instructions,
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 12345",
            createdAt = "2026-09-11T20:00:00Z",
            countryCode = request.countryCode,
            duration = firstItem.duration,
            diagnosis = request.diagnosis,
            notes = request.notes,
            patientName = patients.find { it.patientId == request.patientId }?.fullName,
            patientDni = patients.find { it.patientId == request.patientId }?.dni,
            items = request.items,
        )
        prescriptions.add(0, created)
        return Result.success(created)
    }

    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> {
        lastCancelledId = prescriptionId
        lastCancellationReason = reason
        val idx = prescriptions.indexOfFirst { it.id == prescriptionId }
        if (idx != -1) {
            val old = prescriptions[idx]
            prescriptions[idx] = old.copy(status = "cancelled")
        }
        return Result.success(Unit)
    }

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> =
        Result.success(patients)

    override suspend fun getDoctorEligibility(): Result<DoctorEligibility> = eligibilityResult
}
