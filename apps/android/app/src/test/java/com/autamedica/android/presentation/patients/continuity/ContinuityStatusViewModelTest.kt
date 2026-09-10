package com.autamedica.android.presentation.patients.continuity

import android.content.Context
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupStatus
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.FollowupRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.autamedica.android.util.WhatsAppBridge
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContinuityStatusViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var fakeFollowupRepository: FakeFollowupRepository
    private lateinit var fakeAuthRepository: FakeAuthRepository
    private lateinit var fakeWhatsAppBridge: WhatsAppBridge
    private lateinit var mockContext: Context

    private val testUser = User(
        id = "patient_uuid_123",
        email = "paciente@autamedica.com",
        role = UserRole.PATIENT,
        firstName = "Juan",
        lastName = "Pérez",
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        mockContext = mockk(relaxed = true)
        fakeWhatsAppBridge = WhatsAppBridge(mockContext)
        fakeWhatsAppBridge.uriParser = { mockk(relaxed = true) }
        fakeWhatsAppBridge.intentFactory = { _, _ -> mockk(relaxed = true) }

        fakeAuthRepository = FakeAuthRepository(currentUser = testUser)
        fakeFollowupRepository = FakeFollowupRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `fetchStatus sets empty state when user is not logged in`() = runTest {
        fakeAuthRepository.currentUser = null
        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)

        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.status).isEqualTo("none")
        assertThat(state.request).isNull()
    }

    @Test
    fun `fetchStatus maps pending 48h followup correctly`() = runTest {
        val sampleFollowup = AppointmentFollowup(
            id = "fup_001",
            appointmentId = "appt_123",
            callId = "call_456",
            patientId = "patient_uuid_123",
            doctorId = "doc_789",
            recipientPhone = "5491122334455",
            patientName = "Juan Pérez",
            doctorName = "Dr. Carlos Rossi",
            channel = "whatsapp",
            eventType = "appointment.followup_48h",
            message = "Control clínico post-consulta",
            scheduledFor = "2026-09-09T10:00:00Z",
            status = FollowupStatus.SENT,
            sentAt = "2026-09-09T10:05:00Z",
            dedupeKey = "followup_48h:call:call_456",
            response = null,
            metadata = mapOf("medication_name" to "Enalapril 10mg"),
        )
        fakeFollowupRepository.pendingCheckIn = sampleFollowup

        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)

        val state = viewModel.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.status).isEqualTo("active")
        assertThat(state.request).isNotNull()
        assertThat(state.request?.id).isEqualTo("fup_001")
        assertThat(state.request?.intent).isEqualTo("Seguimiento clínico post-consulta 48h (Línea 4)")
        assertThat(state.request?.assignedDoctor?.name).isEqualTo("Dr. Carlos Rossi")
        assertThat(state.request?.medication?.name).isEqualTo("Enalapril 10mg")
        assertThat(state.request?.isEscalatedAlertActive).isFalse()
    }

    @Test
    fun `submitPostConsultationCheckIn with better updates UI and calls repository`() = runTest {
        val sampleFollowup = AppointmentFollowup(
            id = "fup_002",
            patientId = "patient_uuid_123",
            doctorId = "doc_789",
            recipientPhone = "5491122334455",
            message = "Control",
            scheduledFor = "2026-09-09T10:00:00Z",
            status = FollowupStatus.SENT,
            dedupeKey = "dedupe_002",
        )
        fakeFollowupRepository.pendingCheckIn = sampleFollowup

        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)
        viewModel.submitPostConsultationCheckIn("better")

        val state = viewModel.uiState.value
        assertThat(state.isSubmittingCheckIn).isFalse()
        assertThat(state.request?.postConsultationCheckInState).isEqualTo("better")
        assertThat(state.request?.isEscalatedAlertActive).isFalse()
        assertThat(state.status).isEqualTo("resolved")
        assertThat(fakeFollowupRepository.lastSubmittedFollowupId).isEqualTo("fup_002")
        assertThat(fakeFollowupRepository.lastSubmittedEvolution).isEqualTo("better")
    }

    @Test
    fun `submitPostConsultationCheckIn with worse triggers clinical alert escalation`() = runTest {
        val sampleFollowup = AppointmentFollowup(
            id = "fup_003",
            patientId = "patient_uuid_123",
            doctorId = "doc_789",
            recipientPhone = "5491122334455",
            message = "Control",
            scheduledFor = "2026-09-09T10:00:00Z",
            status = FollowupStatus.SENT,
            dedupeKey = "dedupe_003",
        )
        fakeFollowupRepository.pendingCheckIn = sampleFollowup

        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)
        viewModel.submitPostConsultationCheckIn("worse")

        val state = viewModel.uiState.value
        assertThat(state.request?.isEscalatedAlertActive).isTrue()
        assertThat(state.request?.triageStatus).isEqualTo("escalated")
        assertThat(state.status).isEqualTo("active")
        assertThat(fakeFollowupRepository.lastSubmittedEvolution).isEqualTo("worse")
        assertThat(fakeFollowupRepository.lastSubmittedNotes).contains("empeoramiento")
    }

    @Test
    fun `recordDoseToday increments adherence count and recalculates score`() = runTest {
        val sampleFollowup = AppointmentFollowup(
            id = "fup_004",
            patientId = "patient_uuid_123",
            doctorId = "doc_789",
            recipientPhone = "5491122334455",
            message = "Control",
            scheduledFor = "2026-09-09T10:00:00Z",
            status = FollowupStatus.SENT,
            dedupeKey = "dedupe_004",
        )
        fakeFollowupRepository.pendingCheckIn = sampleFollowup

        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)
        val initialDoses = viewModel.uiState.value.request?.dosesTakenInCycle ?: 0

        viewModel.recordDoseToday()

        val updatedRequest = viewModel.uiState.value.request
        assertThat(updatedRequest?.dosesTakenInCycle).isEqualTo(initialDoses + 1)
        assertThat(updatedRequest?.medication?.isTakenToday).isTrue()
        assertThat(viewModel.uiState.value.feedbackMessage).contains("Score de adherencia actualizado")
    }

    @Test
    fun `whatsapp bridge helper methods delegate properly`() = runTest {
        val viewModel = ContinuityStatusViewModel(fakeFollowupRepository, fakeAuthRepository, fakeWhatsAppBridge)

        assertThat(viewModel.openWhatsAppTriage()).isTrue()
        assertThat(viewModel.openWhatsAppSupport()).isTrue()
        assertThat(viewModel.openWhatsAppFollowup("1")).isTrue()
        assertThat(viewModel.openWhatsAppAudioAnamnesis()).isTrue()
    }
}

// ── Fakes ──

private class FakeFollowupRepository : FollowupRepository {
    var pendingCheckIn: AppointmentFollowup? = null
    var activeFollowups: List<AppointmentFollowup> = emptyList()

    var lastSubmittedFollowupId: String? = null
    var lastSubmittedEvolution: String? = null
    var lastSubmittedNotes: String? = null

    override suspend fun getActiveFollowupsForPatient(patientId: String): Result<List<AppointmentFollowup>> {
        return Result.success(activeFollowups)
    }

    override suspend fun getPendingCheckIn(patientId: String): Result<AppointmentFollowup?> {
        return Result.success(pendingCheckIn)
    }

    override suspend fun submitCheckIn(followupId: String, evolution: String, notes: String?): Result<Unit> {
        lastSubmittedFollowupId = followupId
        lastSubmittedEvolution = evolution
        lastSubmittedNotes = notes
        return Result.success(Unit)
    }
}

private class FakeAuthRepository(var currentUser: User?) : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(currentUser)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
        currentUser?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
        currentUser?.let { Result.success(it) } ?: Result.failure(Exception("No user"))
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.success(UserRegistrationResult(currentUser, false))
    override suspend fun logout() { currentUser = null }
    override suspend fun getCurrentUser(): User? = currentUser
}
