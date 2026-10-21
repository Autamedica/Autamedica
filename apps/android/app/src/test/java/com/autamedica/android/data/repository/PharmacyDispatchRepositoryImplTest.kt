package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.UserRegistrationResult
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

private class FakeAuthRepository : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(null)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
        Result.failure(Exception("No user"))
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
        Result.failure(Exception("No user"))
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.failure(Exception("No user"))
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = null
}

@OptIn(ExperimentalCoroutinesApi::class)
class PharmacyDispatchRepositoryImplTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var supabaseClient: SupabaseClient
    private lateinit var repository: PharmacyDispatchRepositoryImpl
    private val testDispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        supabaseClient = createSupabaseClient(
            supabaseUrl = mockWebServer.url("/").toString(),
            supabaseKey = "test-anon-key",
        ) {
            install(Postgrest)
        }

        repository = PharmacyDispatchRepositoryImpl(
            supabaseClient = supabaseClient,
            authRepository = FakeAuthRepository(),
            ioDispatcher = testDispatcher,
            httpClient = OkHttpClient(),
            json = Json { ignoreUnknownKeys = true },
        )
        repository.guestApiOrigin = mockWebServer.url("/").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    @Test
    fun `getDoctorDutyStatus returns successful duty status and active tiers`() = runTest {
        val doctorId = "doc-uuid-123"
        val responseBody = """
            [
                {
                    "doctor_id": "$doctorId",
                    "is_on_duty": true,
                    "active_tiers": ["general", "cardiologia", "pediatria"],
                    "current_active_request_id": "req-active-001"
                }
            ]
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(responseBody)
        )

        val result = repository.getDoctorDutyStatus(doctorId)

        assertThat(result.isSuccess).isTrue()
        val duty = result.getOrNull()
        assertThat(duty).isNotNull()
        assertThat(duty?.doctorId).isEqualTo(doctorId)
        assertThat(duty?.isOnDuty).isTrue()
        assertThat(duty?.activeTiers).containsExactly("general", "cardiologia", "pediatria").inOrder()
        assertThat(duty?.currentActiveRequestId).isEqualTo("req-active-001")

        val recordedRequest = mockWebServer.takeRequest()
        assertThat(recordedRequest.path).contains("doctor_duty_status")
        assertThat(recordedRequest.path).contains("doctor_id=eq.$doctorId")
    }

    @Test
    fun `sendDoctorHeartbeat calls doctor_heartbeat RPC successfully`() = runTest {
        val doctorId = "doc-uuid-456"

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{}")
        )

        val result = repository.sendDoctorHeartbeat(doctorId)

        assertThat(result.isSuccess).isTrue()
        val recordedRequest = mockWebServer.takeRequest()
        assertThat(recordedRequest.path).contains("rpc/doctor_heartbeat")
        val requestBody = recordedRequest.body.readUtf8()
        assertThat(requestBody).contains("p_doctor_id")
        assertThat(requestBody).contains(doctorId)
    }

    @Test
    fun `anonymous dispatch uses signed server API instead of reading PostgREST`() = runTest {
        val responseBody = """
            {
              "success": true,
              "data": {
                "request": {
                  "id": "request-synthetic-1",
                  "patient_dni": "00000000",
                  "patient_phone": "000000000",
                  "patient_name": "Patient Example",
                  "tier_requested": "general",
                  "symptom_summary": "synthetic symptom",
                  "status": "searching",
                  "assigned_doctor_id": null,
                  "cloudflare_room_id": "synthetic-room",
                  "created_at": "2026-10-21T00:00:00Z"
                },
                "accessToken": "synthetic-signed-token"
              }
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(responseBody)
        )

        val result = repository.createPatientDispatchRequest(
            patientDni = "00000000",
            patientPhone = "000000000",
            patientName = "Patient Example",
            tierRequested = "general",
            symptomSummary = "synthetic symptom",
            patientCpf = null,
        )

        assertThat(result.isSuccess).isTrue()
        assertThat(result.getOrNull()?.id).isEqualTo("request-synthetic-1")
        val request = mockWebServer.takeRequest()
        assertThat(request.method).isEqualTo("POST")
        assertThat(request.path).isEqualTo("/api/pharmacy/dispatch/request")
        assertThat(request.body.readUtf8()).contains("\\\"patientDni\\\":\\\"00000000\\\"")
    }

    @Test
    fun `anonymous dispatch refuses unsigned or malformed server responses`() = runTest {
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"success":true,"data":{"request":{"id":"bad-request"},"accessToken":""}}"""
                )
        )

        val result = repository.createPatientDispatchRequest(
            patientDni = "00000000",
            patientPhone = "000000000",
            patientName = "Patient Example",
            tierRequested = "general",
            symptomSummary = null,
            patientCpf = null,
        )
        assertThat(result.isFailure).isTrue()
    }

}
