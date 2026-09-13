package com.autamedica.android.presentation.patients

import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalCoroutinesApi::class)
class PatientsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val doctorUser = User(
        id = "user-1",
        email = "doctor@autamedica.com",
        role = UserRole.DOCTOR,
        firstName = "Eduardo",
        lastName = "Marques",
    )

    private val doctorProfile = DoctorProfile(
        id = "doctor-1",
        userId = "user-1",
        licenseNumber = "MN 12345",
        specialty = "Clinica",
    )

    private class FakeAuthRepository(private val user: User?) : AuthRepository {
        override fun observeSession(): Flow<User?> = flowOf(user)
        override suspend fun getCurrentUser(): User? = user
        override suspend fun login(
            email: String,
            password: String,
            selectedRole: UserRole?,
        ): Result<User> = Result.failure(NotImplementedError())

        override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
            Result.failure(NotImplementedError())

        override suspend fun register(
            email: String,
            password: String,
            selectedRole: UserRole,
        ): Result<UserRegistrationResult> = Result.failure(NotImplementedError())

        override suspend fun logout() {}
    }

    private class FakeDoctorRepository(
        var profileResult: Result<DoctorProfile> = Result.success(
            DoctorProfile(id = "doctor-1", userId = "user-1", licenseNumber = "MN 12345", specialty = "Clinica"),
        ),
        var patientsResult: Result<List<PatientSummary>> = Result.success(emptyList()),
    ) : DoctorRepository {
        override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> = profileResult
        override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = Result.success(DoctorStats())
        override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> = patientsResult
        override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> =
            Result.failure(NotImplementedError())
    }

    private fun patient(
        id: String,
        first: String,
        last: String,
        next: String? = null,
        prev: String? = null,
    ) = PatientSummary(
        id = id,
        userId = "$id-user",
        firstName = first,
        lastName = last,
        lastAppointment = prev,
        nextAppointment = next,
    )

    private fun iso(dt: OffsetDateTime): String =
        dt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

    @Test
    fun `loads patients and computes groups on init`() = runTest {
        val patients = listOf(
            patient("p1", "María", "González", next = iso(OffsetDateTime.now().plusDays(1))),
            patient("p2", "Bruno", "Perez", prev = iso(OffsetDateTime.now().minusHours(2))),
        )
        val repo = FakeDoctorRepository(
            profileResult = Result.success(doctorProfile),
            patientsResult = Result.success(patients),
        )
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))

        advanceUntilIdle()

        val state = vm.uiState.value
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
        assertThat(state.patients.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(state.totalCount).isEqualTo(2)
        assertThat(state.upcomingCount).isEqualTo(1)
        assertThat(state.groups.upcoming.map { it.id }).containsExactly("p1")
        assertThat(state.groups.attended.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `missing current user reports auth error`() = runTest {
        val vm = PatientsViewModel(FakeDoctorRepository(), FakeAuthRepository(null))

        advanceUntilIdle()

        assertThat(vm.uiState.value.isLoading).isFalse()
        assertThat(vm.uiState.value.error).isEqualTo("Error de autenticacion")
    }

    @Test
    fun `doctor profile failure reports identification error`() = runTest {
        val repo = FakeDoctorRepository(profileResult = Result.failure(RuntimeException("boom")))
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))

        advanceUntilIdle()

        assertThat(vm.uiState.value.error).isEqualTo("No se pudo identificar al doctor")
    }

    @Test
    fun `patients fetch failure reports load error`() = runTest {
        val repo = FakeDoctorRepository(
            profileResult = Result.success(doctorProfile),
            patientsResult = Result.failure(RuntimeException("boom")),
        )
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))

        advanceUntilIdle()

        assertThat(vm.uiState.value.error).isEqualTo("Error al cargar pacientes")
    }

    @Test
    fun `search query filters and recomputes groups`() = runTest {
        val patients = listOf(
            patient("p1", "María", "González", next = iso(OffsetDateTime.now().plusDays(1))),
            patient("p2", "Bruno", "Perez", prev = iso(OffsetDateTime.now().minusHours(2))),
        )
        val repo = FakeDoctorRepository(
            profileResult = Result.success(doctorProfile),
            patientsResult = Result.success(patients),
        )
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))
        advanceUntilIdle()

        vm.onSearchQueryChange("mar")
        assertThat(vm.uiState.value.groups.upcoming.map { it.id }).containsExactly("p1")
        assertThat(vm.uiState.value.groups.attended).isEmpty()

        vm.onSearchQueryChange("bruno")
        assertThat(vm.uiState.value.groups.upcoming).isEmpty()
        assertThat(vm.uiState.value.groups.attended.map { it.id }).containsExactly("p2")

        vm.onSearchQueryChange("")
        assertThat(vm.uiState.value.groups.upcoming.map { it.id }).containsExactly("p1")
    }

    @Test
    fun `filter selection recomputes groups`() = runTest {
        val patients = listOf(
            patient("p1", "María", "González", next = iso(OffsetDateTime.now().plusDays(1))),
            patient("p2", "Bruno", "Perez", prev = iso(OffsetDateTime.now().minusHours(2))),
            patient("p3", "Carla", "Diaz", prev = iso(OffsetDateTime.now().minusDays(60))),
        )
        val repo = FakeDoctorRepository(
            profileResult = Result.success(doctorProfile),
            patientsResult = Result.success(patients),
        )
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))
        advanceUntilIdle()

        vm.onFilterSelected(PatientFilter.UPCOMING)
        assertThat(vm.uiState.value.groups.upcoming.map { it.id }).containsExactly("p1")
        assertThat(vm.uiState.value.groups.attended).isEmpty()

        vm.onFilterSelected(PatientFilter.RECENT)
        assertThat(vm.uiState.value.groups.upcoming).isEmpty()
        assertThat(vm.uiState.value.groups.attended.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `refresh flags and completes`() = runTest {
        val repo = FakeDoctorRepository(
            profileResult = Result.success(doctorProfile),
            patientsResult = Result.success(emptyList()),
        )
        val vm = PatientsViewModel(repo, FakeAuthRepository(doctorUser))
        advanceUntilIdle()

        vm.refresh()
        assertThat(vm.uiState.value.isRefreshing).isTrue()

        advanceUntilIdle()
        assertThat(vm.uiState.value.isRefreshing).isFalse()
        assertThat(vm.uiState.value.error).isNull()
    }
}