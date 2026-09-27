package com.autamedica.android.presentation.consultation

import com.autamedica.android.data.repository.PatientClinicStore
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.CreateMedicalOrderRequest
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.FollowupCheckInEvolution
import com.autamedica.android.domain.model.FollowupStatus
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionDispensation
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentPaymentExecution
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.FollowupRepository
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.domain.repository.MedicalOrderRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.OffsetDateTime

@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationHubViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val fakeUser = User(
        id = "patient-1",
        email = "patient@test.com",
        role = UserRole.PATIENT,
        firstName = "Juan",
        lastName = "Pérez",
    )

    private val sampleDoctor = DoctorBookingInfo(
        id = "doc-1",
        userId = "u-doc-1",
        name = "Dr. Alejandro Rossi",
        specialty = "Medicina General",
        licenseNumber = "MN 145.890",
        consultationFee = 15000.0,
        availableSlots = listOf("10:00", "11:30"),
    )

    private val sampleAppointment = Appointment(
        id = "apt-1",
        patientId = "patient-1",
        doctorId = "doc-1",
        startTime = OffsetDateTime.now().plusMinutes(20).toString(),
        endTime = OffsetDateTime.now().plusMinutes(50).toString(),
        durationMinutes = 30,
        type = AppointmentType.TELEMEDICINE,
        status = AppointmentStatus.CONFIRMED,
        notes = "Consulta de control clínico",
        meetingUrl = "https://meet.autamedica.com/apt-1",
        doctorName = "Dr. Alejandro Rossi",
        doctorSpecialty = "Medicina General",
        doctorLicenseNumber = "MN 145.890",
        doctorFee = 15000.0,
    )

    private val samplePendingPayment = Appointment(
        id = "apt-pending",
        patientId = "patient-1",
        doctorId = "doc-1",
        startTime = OffsetDateTime.now().plusHours(2).toString(),
        endTime = OffsetDateTime.now().plusHours(2).plusMinutes(30).toString(),
        durationMinutes = 30,
        type = AppointmentType.TELEMEDICINE,
        status = AppointmentStatus.PAYMENT_PENDING,
        notes = "Turno pendiente de pago",
        meetingUrl = null,
        doctorName = "Dr. Alejandro Rossi",
        doctorSpecialty = "Medicina General",
        doctorFee = 15000.0,
    )

    private val samplePrescription = Prescription(
        id = "rx-1",
        status = "active",
        cuir = "CUIR-2026-AR-0992",
        signedPdfUrl = "https://autamedica.com/rx-1.pdf",
        qrCodeContent = "CUIR-2026-AR-0992",
        medicationName = "Losartán 50mg",
        dosage = "1 comprimido",
        frequency = "cada 12 horas",
        instructions = "Tomar con agua por la mañana y noche",
        doctorName = "Dr. Alejandro Rossi",
        doctorLicense = "MN 145.890",
        createdAt = OffsetDateTime.now().toString(),
        countryCode = "AR",
        duration = "30 días",
        diagnosis = "Hipertensión arterial esencial",
        notes = null,
    )

    private val sampleMedicalOrder = MedicalOrder(
        id = "order-1",
        cuir = "CUIR-ORD-8812",
        status = "pending",
        studyType = StudyType.LABORATORY,
        practices = listOf(PracticeItem("Hemograma completo", "420101")),
        diagnosis = "Control metabólico y lipídico",
        notes = null,
        qrCodeContent = "CUIR-ORD-8812",
        signedPdfUrl = "https://autamedica.com/order-1.pdf",
        doctorName = "Dr. Alejandro Rossi",
        doctorLicense = "MN 145.890",
        createdAt = OffsetDateTime.now().toString(),
    )

    private val sampleFollowup = AppointmentFollowup(
        id = "follow-1",
        appointmentId = "apt-prev",
        patientId = "patient-1",
        doctorId = "doc-1",
        recipientPhone = "+5491100000000",
        message = "¿Cómo evolucionaron tus síntomas?",
        scheduledFor = OffsetDateTime.now().minusHours(2).toString(),
        status = FollowupStatus.PENDING,
        dedupeKey = "dedupe-1",
    )

    private lateinit var fakeAppointmentRepo: FakeAppointmentRepo
    private lateinit var fakeTelemedicineRepo: FakeTelemedicineRepo
    private lateinit var fakeHealthRepo: FakeHealthRepo
    private lateinit var fakePrescriptionRepo: FakePrescriptionRepo
    private lateinit var fakeMedicalOrderRepo: FakeMedicalOrderRepo
    private lateinit var fakeFollowupRepo: FakeFollowupRepo
    private lateinit var fakeProfileRepo: FakeProfileRepo
    private lateinit var clinicStore: PatientClinicStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeAppointmentRepo = FakeAppointmentRepo(
            appointments = listOf(sampleAppointment),
            doctors = listOf(sampleDoctor),
        )
        fakeTelemedicineRepo = FakeTelemedicineRepo(
            joinableIds = setOf("apt-1"),
        )
        fakeHealthRepo = FakeHealthRepo(
            allergies = listOf("Penicilina"),
            medications = listOf("Enalapril 10mg"),
            completionPercentage = 100,
        )
        fakePrescriptionRepo = FakePrescriptionRepo(listOf(samplePrescription))
        fakeMedicalOrderRepo = FakeMedicalOrderRepo(listOf(sampleMedicalOrder))
        fakeFollowupRepo = FakeFollowupRepo(sampleFollowup)
        fakeProfileRepo = FakeProfileRepo(fakeUser)

        clinicStore = PatientClinicStore(fakeAppointmentRepo, fakeTelemedicineRepo, testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): ConsultationHubViewModel =
        ConsultationHubViewModel(
            clinicStore = clinicStore,
            appointmentRepository = fakeAppointmentRepo,
            healthRepository = fakeHealthRepo,
            prescriptionRepository = fakePrescriptionRepo,
            medicalOrderRepository = fakeMedicalOrderRepo,
            followupRepository = fakeFollowupRepo,
            profileRepository = fakeProfileRepo,
        )

    @Test
    fun `initial load classifies active videoconsultation and populates clinical constants`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()

        // 1. Consola FSM: Videoconsulta activa con validación legal
        assertThat(state.consoleState).isInstanceOf(ConsultationConsoleState.ActiveVideoconsultation::class.java)
        val activeCall = state.consoleState as ConsultationConsoleState.ActiveVideoconsultation
        assertThat(activeCall.doctorName).isEqualTo("Dr. Alejandro Rossi")
        assertThat(activeCall.isSisaValidated).isTrue()
        assertThat(activeCall.licenseNumber).isEqualTo("MN 145.890")

        // 2. Constantes Clínicas (Nubank density)
        assertThat(state.clinicalConstants.allergies).containsExactly("Penicilina")
        assertThat(state.clinicalConstants.habitualMedications).containsExactly("Enalapril 10mg")
        assertThat(state.clinicalConstants.isAnamnesisComplete).isTrue()

        // 3. Farmacoterapia Activa con CUIR
        assertThat(state.activePrescriptions).hasSize(1)
        assertThat(state.activePrescriptions.first().cuir).isEqualTo("CUIR-2026-AR-0992")

        // 4. Órdenes médicas de estudios
        assertThat(state.pendingMedicalOrders).hasSize(1)
        assertThat(state.pendingMedicalOrders.first().studyType).isEqualTo(StudyType.LABORATORY)

        // 5. Continuidad asistencial 48h
        assertThat(state.pendingFollowupCheckIn).isNotNull()
        assertThat(state.pendingFollowupCheckIn?.id).isEqualTo("follow-1")
    }

    @Test
    fun `red flag detector identifies chest pain and emergency dial 107`() = runTest(testDispatcher) {
        val flags = RedFlagDetector.evaluate("Siento dolor de pecho y falta de aire", emptySet())
        assertThat(flags).isNotEmpty()
        val cardFlag = flags.firstOrNull { it.title.contains("torácica", ignoreCase = true) }
        assertThat(cardFlag).isNotNull()
        assertThat(cardFlag?.emergencyPhone).isEqualTo("107")
    }

    @Test
    fun `red flag detector identifies syncope and neurological deficit`() = runTest(testDispatcher) {
        val flags = RedFlagDetector.evaluate("Tuve un síncope y pérdida de conocimiento", emptySet())
        assertThat(flags).isNotEmpty()
        val neuroFlag = flags.firstOrNull { it.title.contains("neurológico", ignoreCase = true) }
        assertThat(neuroFlag).isNotNull()
        assertThat(neuroFlag?.emergencyPhone).isEqualTo("107")
    }

    @Test
    fun `submitFollowupEvolution marks checkin as complete`() = runTest(testDispatcher) {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.submitFollowupEvolution("follow-1", FollowupCheckInEvolution.BETTER)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.pendingFollowupCheckIn).isNull()
        assertThat(state.toastMessage).contains("Evolución registrada correctamente")
    }

    // ── FAKES ──

    private class FakeHealthRepo(
        private val allergies: List<String>,
        private val medications: List<String>,
        private val completionPercentage: Int,
    ) : HealthRepository {
        override suspend fun getAnamnesisSummary(): Result<AnamnesisSummary?> = Result.success(
            AnamnesisSummary(
                id = "anamnesis-1",
                status = "completed",
                completionPercentage = completionPercentage,
                locked = false,
                updatedAt = "2026-01-01T00:00:00Z",
                completedSections = 13,
                totalSections = 13,
            )
        )

        override suspend fun getPreventiveProfile(): Result<PatientPreventiveProfile> =
            Result.failure(Exception("Not implemented"))

        override suspend fun getOrCreateAnamnesis(): Result<AnamnesisSummary> =
            getAnamnesisSummary().map { it!! }

        override suspend fun getAnamnesisSections(anamnesisId: String): Result<List<AnamnesisSection>> = Result.success(
            listOf(
                AnamnesisSection(
                    id = "sec-1",
                    anamnesisId = anamnesisId,
                    section = "Alergias conocidas",
                    data = mapOf("declaracion" to allergies.joinToString(", ")),
                    completed = true,
                    completedAt = "2026-01-01T00:00:00Z",
                    updatedAt = "2026-01-01T00:00:00Z",
                ),
                AnamnesisSection(
                    id = "sec-2",
                    anamnesisId = anamnesisId,
                    section = "Medicamentos habituales",
                    data = mapOf("medicacion" to medications.joinToString(", ")),
                    completed = true,
                    completedAt = "2026-01-01T00:00:00Z",
                    updatedAt = "2026-01-01T00:00:00Z",
                ),
            )
        )

        override suspend fun saveSection(anamnesisId: String, section: String, data: Map<String, String>): Result<Unit> = Result.success(Unit)
        override suspend fun completeSection(anamnesisId: String, section: String): Result<Unit> = Result.success(Unit)
        override suspend fun submitAnamnesis(anamnesisId: String): Result<Unit> = Result.success(Unit)
    }

    private class FakePrescriptionRepo(
        private val prescriptions: List<Prescription>,
    ) : PrescriptionRepository {
        override suspend fun getPatientPrescriptions(): Result<List<Prescription>> = Result.success(prescriptions)
        override suspend fun getPrescriptionById(id: String): Result<Prescription> =
            prescriptions.firstOrNull { it.id == id }?.let { Result.success(it) }
                ?: Result.failure(Exception("Not found"))
        override suspend fun getDoctorPrescriptions(patientId: String?, status: String?): Result<List<Prescription>> =
            Result.success(prescriptions)
        override suspend fun getPrescriptionDispensation(prescriptionId: String): Result<PrescriptionDispensation> =
            Result.failure(NoSuchElementException())
        override suspend fun createPrescription(request: CreatePrescriptionRequest): Result<Prescription> =
            Result.failure(Exception("Not implemented"))
        override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> = Result.success(Unit)
        override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> = Result.success(emptyList())
        override suspend fun getDoctorEligibility(): Result<DoctorEligibility> = Result.failure(Exception("Not implemented"))
    }

    private class FakeMedicalOrderRepo(
        private val orders: List<MedicalOrder>,
    ) : MedicalOrderRepository {
        override suspend fun getDoctorMedicalOrders(): Result<List<MedicalOrder>> = Result.success(orders)
        override suspend fun getPatientMedicalOrders(): Result<List<MedicalOrder>> = Result.success(orders)
        override suspend fun getMedicalOrderById(id: String): Result<MedicalOrder> =
            orders.firstOrNull { it.id == id }?.let { Result.success(it) } ?: Result.failure(Exception("Not found"))
        override suspend fun createMedicalOrder(request: CreateMedicalOrderRequest): Result<MedicalOrder> =
            Result.failure(Exception("Not implemented"))
        override suspend fun cancelMedicalOrder(orderId: String, reason: String): Result<Unit> = Result.success(Unit)
    }

    private class FakeFollowupRepo(
        private var pendingCheckIn: AppointmentFollowup?,
    ) : FollowupRepository {
        override suspend fun getActiveFollowupsForPatient(patientId: String): Result<List<AppointmentFollowup>> =
            Result.success(listOfNotNull(pendingCheckIn))
        override suspend fun getPendingCheckIn(patientId: String): Result<AppointmentFollowup?> =
            Result.success(pendingCheckIn)
        override suspend fun submitCheckIn(followupId: String, evolution: String, notes: String?): Result<Unit> {
            pendingCheckIn = null
            return Result.success(Unit)
        }
    }

    private class FakeProfileRepo(private val user: User) : ProfileRepository {
        override suspend fun getProfile(): Result<User> = Result.success(user)
        override suspend fun getPatientProfileSnapshot(): Result<PatientProfileSnapshot?> = Result.success(null)
        override suspend fun updateProfile(firstName: String, lastName: String, phone: String?): Result<User> = Result.success(user)
    }

    private class FakeAppointmentRepo(
        private val appointments: List<Appointment>,
        private val doctors: List<DoctorBookingInfo>,
        private val bookAppointmentReturnsError: Boolean = false,
    ) : AppointmentRepository {
        override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = Result.success(appointments)
        override suspend fun getAppointmentById(id: String): Result<Appointment> =
            appointments.firstOrNull { it.id == id }?.let { Result.success(it) }
                ?: Result.failure(Exception("Not found"))
        override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
        override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
        override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = Result.success(doctors)
        override suspend fun bookAppointment(
            doctorId: String,
            startTime: String,
            endTime: String,
            type: String,
            reason: String?,
        ): Result<Appointment> {
            if (bookAppointmentReturnsError) {
                return Result.failure(Exception("Booking service unavailable"))
            }
            return Result.success(
                Appointment(
                    id = "booked-${System.currentTimeMillis()}",
                    patientId = "patient-1",
                    doctorId = doctorId,
                    startTime = startTime,
                    endTime = endTime,
                    durationMinutes = 30,
                    type = AppointmentType.TELEMEDICINE,
                    status = AppointmentStatus.CONFIRMED,
                    notes = reason,
                    meetingUrl = "https://meet.autamedica.com/booked",
                )
            )
        }
        override suspend fun createAppointmentPayment(appointmentId: String): Result<AppointmentPaymentExecution> =
            Result.success(AppointmentPaymentExecution("approved", null))
        override suspend fun getAppointmentPaymentStatus(appointmentId: String): Result<String> =
            Result.success("approved")
    }

    private class FakeTelemedicineRepo(private val joinableIds: Set<String>) : TelemedicineRepository {
        override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> =
            Result.failure(Exception("Not implemented"))
        override suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>> =
            Result.success(joinableIds)
        override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = Result.success(Unit)
    }
}