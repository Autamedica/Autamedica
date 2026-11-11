package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
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
import io.mockk.every
import io.mockk.mockk
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
    private val secureValues = mutableMapOf<String, String>()
    private val securePrefs = mockk<SecurePreferences>()

    @Before
    fun setUp() {
        secureValues.clear()
        every { securePrefs.getString(any()) } answers { secureValues[firstArg<String>()] }
        every { securePrefs.putString(any(), any()) } answers {
            secureValues[firstArg<String>()] = secondArg<String>()
            Unit
        }
        every { securePrefs.remove(any()) } answers {
            secureValues.remove(firstArg<String>())
            Unit
        }
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
            securePreferences = securePrefs,
        )
        repository.guestApiOrigin = mockWebServer.url("/").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    private suspend fun createSyntheticGuestRequest(): String {
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "success": true,
                      "data": {
                        "request": {
                          "id": "guest-cancel-1",
                          "patient_dni": "00000000",
                          "patient_phone": "000000000",
                          "patient_name": "Synthetic Example",
                          "tier_requested": "general",
                          "status": "searching",
                          "cloudflare_room_id": "synthetic-room-cancel",
                          "created_at": "2026-11-04T00:00:00Z"
                        },
                        "accessToken": "synthetic-signed-cancel-token",
                        "recoveryToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                      }
                    }""".trimIndent()
                )
        )
        val result = repository.createPatientDispatchRequest(
            patientDni = "00000000",
            patientPhone = "000000000",
            patientName = "Synthetic Example",
            tierRequested = "general",
            symptomSummary = null,
            patientCpf = null,
            careCountry = "AR",
        )
        val id = result.getOrThrow().id
        assertThat(mockWebServer.takeRequest().path).isEqualTo("/api/pharmacy/dispatch/request")
        return id
    }


    @Test
    fun `guest SFU token is returned only for the matching stored room`() = runTest {
        val requestId = createSyntheticGuestRequest()
        assertThat(repository.getGuestAccessTokenForRoom("synthetic-room-cancel"))
            .isEqualTo("synthetic-signed-cancel-token")
        assertThat(repository.getGuestAccessTokenForRoom("different-room")).isNull()
        assertThat(requestId).isEqualTo("guest-cancel-1")
    }

    @Test
    fun `Brazilian QR payment requires signed scope and does not trust pending checkout as approved`() = runTest {
        val requestId = "12345678-1234-4234-8234-123456789012"
        val partnerId = "22222222-2222-4222-8222-222222222222"
        val recovery = "a".repeat(64)
        val created = """
            {"success":true,"data":{
              "request":{"id":"$requestId","care_country":"BR",
                "referral_partner_id":"$partnerId",
                "patient_cpf":"12345678909","patient_phone":"+5551987654321",
                "patient_name":"Synthetic Patient","tier_requested":"general",
                "status":"searching","cloudflare_room_id":"cf-room-br-qr",
                "created_at":"2026-11-05T12:00:00Z"},
              "accessToken":"signed-intake-token","recoveryToken":"$recovery"
            }}
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200)
            .setHeader("Content-Type","application/json").setBody(created))
        val intake = repository.createPatientDispatchRequest(
            patientDni="12345678909",patientPhone="+5551987654321",
            patientName="Synthetic Patient",tierRequested="general",
            symptomSummary="Consulta geral",patientCpf="12345678909",
            careCountry="BR",referralCode="JORDAN",
        ).getOrThrow()
        assertThat(intake.referralPartnerId).isEqualTo(partnerId)
        val request = mockWebServer.takeRequest()
        assertThat(request.path).isEqualTo("/api/pharmacy/dispatch/request")
        assertThat(request.body.readUtf8()).contains("\"referralCode\":\"JORDAN\"")

        mockWebServer.enqueue(MockResponse().setResponseCode(200)
            .setHeader("Content-Type","application/json")
            .setBody("""{"success":true,"data":{"status":"pending","checkoutUrl":"https://www.mercadopago.com.br/checkout/"}}"""))
        val checkout = repository.startDispatchCheckout(requestId).getOrThrow()
        assertThat(checkout.status).isEqualTo("pending")
        assertThat(checkout.checkoutUrl).startsWith("https://")
        val post = mockWebServer.takeRequest()
        assertThat(post.path).isEqualTo("/api/pharmacy/dispatch/payment/create")
        assertThat(post.body.readUtf8()).contains("signed-intake-token")
        assertThat(post.getHeader("Authorization")).isNull()

        mockWebServer.enqueue(MockResponse().setResponseCode(200)
            .setHeader("Content-Type","application/json")
            .setBody("""{"success":true,"data":{"status":"pending","amountCents":7900,"currency":"BRL"}}"""))
        val status = repository.getDispatchPaymentStatus(requestId).getOrThrow()
        assertThat(status).isEqualTo("pending")
        assertThat(mockWebServer.takeRequest().path).isEqualTo("/api/pharmacy/dispatch/payment/status")
        // No redundant /resume HTTP roundtrip or recovery database write during polling.
        assertThat(mockWebServer.requestCount).isEqualTo(3)
    }

    @Test
    fun `anonymous queue can be restored after process death without exposing long lived JWT`() = runTest {
        val requestId = "01234567-89ab-4cde-8f01-23456789abcd"
        val recoveryToken = "a".repeat(64)
        secureValues["pharmacy_guest_queue_recovery_v1"] = "$requestId:$recoveryToken"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "success": true,
                      "data": {
                        "request": {
                          "id": "$requestId",
                          "patient_dni": "00000000",
                          "patient_phone": "000000000",
                          "patient_name": "Synthetic Guest",
                          "tier_requested": "general",
                          "status": "searching",
                          "care_country": "AR",
                          "cloudflare_room_id": "guest-room-1",
                          "created_at": "2026-11-05T00:00:00Z"
                        },
                        "accessToken": "renewed-two-hour-test-token"
                      }
                    }""".trimIndent(),
                ),
        )
        val restored = repository.getActivePatientDispatchRequest().getOrThrow()
        assertThat(restored?.id).isEqualTo(requestId)
        assertThat(restored?.status).isEqualTo("searching")
        assertThat(restored?.careCountry).isEqualTo("AR")
        val posted = mockWebServer.takeRequest()
        assertThat(posted.method).isEqualTo("POST")
        assertThat(posted.path).isEqualTo("/api/pharmacy/dispatch/resume")
        assertThat(posted.body.readUtf8()).contains(recoveryToken)
    }

    @Test
    fun `guest cancellation without a signed intake token fails closed`() = runTest {
        val result = repository.cancelPatientDispatchRequest("no-issued-token")
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `guest cancellation uses signed API and requires confirmed true`() = runTest {
        val id = createSyntheticGuestRequest()
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":true,"data":{"cancelled":true}}""")
        )
        assertThat(repository.cancelPatientDispatchRequest(id).getOrThrow()).isTrue()
        val sent = mockWebServer.takeRequest()
        assertThat(sent.method).isEqualTo("POST")
        assertThat(sent.path).isEqualTo("/api/pharmacy/on-demand/cancel")
        val body = sent.body.readUtf8()
        assertThat(body).contains(id)
        assertThat(body).contains("synthetic-signed-cancel-token")
        assertThat(sent.getHeader("Authorization")).isNull()

        // Token was consumed only after confirmation; subsequent attempts fail closed.
        assertThat(repository.cancelPatientDispatchRequest(id).isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(2)
    }

    @Test
    fun `refused cancellation retains guest token for status updates and retry`() = runTest {
        val id = createSyntheticGuestRequest()
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":true,"data":{"cancelled":false}}""")
        )
        assertThat(repository.cancelPatientDispatchRequest(id).getOrThrow()).isFalse()
        mockWebServer.takeRequest()

        mockWebServer.enqueue(
            MockResponse().setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":false,"error":{"code":"UNAUTHENTICATED"}}""")
        )
        assertThat(repository.cancelPatientDispatchRequest(id).isFailure).isTrue()
        assertThat(mockWebServer.takeRequest().path).isEqualTo("/api/pharmacy/on-demand/cancel")
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
    fun `doctor heartbeat without an authenticated Supabase session never uses anon credentials`() = runTest {
        val result = repository.sendDoctorHeartbeat("doc-uuid-456")
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `forbidden consultation finish never falls back to direct clinical updates`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"code":"42501","message":"doctor_not_authorized"}""")
        )
        val result = repository.finishPharmacyRequest("doc-uuid-1", "request-uuid-2")
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(1)
        val request = mockWebServer.takeRequest()
        assertThat(request.path).contains("rpc/finish_pharmacy_consultation")
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
                "accessToken": "synthetic-signed-token",
                        "recoveryToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
            careCountry = "AR",
        )

        // Fail with the underlying exception, not a generic Boolean assertion.
        val created = result.getOrThrow()
        assertThat(created.id).isEqualTo("request-synthetic-1")
        val request = mockWebServer.takeRequest()
        assertThat(request.method).isEqualTo("POST")
        assertThat(request.path).isEqualTo("/api/pharmacy/dispatch/request")
        assertThat(request.body.readUtf8()).contains("patientDni")
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
            careCountry = "AR",
        )
        assertThat(result.isFailure).isTrue()
    }

}
