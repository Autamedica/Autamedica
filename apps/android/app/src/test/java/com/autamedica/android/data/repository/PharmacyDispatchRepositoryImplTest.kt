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
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
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
import java.util.concurrent.TimeUnit
import java.util.Base64

private class FakeAuthRepository(var currentUser: User? = null) : AuthRepository {
    override fun observeSession(): Flow<User?> = flowOf(currentUser)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> =
        Result.failure(Exception("No user"))
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> =
        Result.failure(Exception("No user"))
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult> =
        Result.failure(Exception("No user"))
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = currentUser
}

@OptIn(ExperimentalCoroutinesApi::class)
class PharmacyDispatchRepositoryImplTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var supabaseClient: SupabaseClient
    private lateinit var repository: PharmacyDispatchRepositoryImpl
    private lateinit var fakeAuthRepository: FakeAuthRepository
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
            install(Auth) {
                sessionManager = MemorySessionManager()
                codeVerifierCache = MemoryCodeVerifierCache()
                autoLoadFromStorage = false
                autoSaveToStorage = false
                alwaysAutoRefresh = false
                enableLifecycleCallbacks = false
            }
            install(Postgrest)
        }

        fakeAuthRepository = FakeAuthRepository()
        repository = PharmacyDispatchRepositoryImpl(
            supabaseClient = supabaseClient,
            authRepository = fakeAuthRepository,
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

    private fun syntheticAuthenticatedJwt(userId: String): String {
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val header = encoder.encodeToString("""{"alg":"none","typ":"JWT"}""".toByteArray())
        val payload = encoder.encodeToString(
            """{"sub":"$userId","aud":"authenticated","role":"authenticated","exp":4102444800,"iat":1700000000}"""
                .toByteArray(),
        )
        return "$header.$payload.synthetic-signature"
    }

    private suspend fun authenticateDoctor(userId: String) {
        val email = "doctor@example.invalid"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"id":"$userId","aud":"authenticated","role":"authenticated","email":"$email","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"identities":[]}""",
                ),
        )
        supabaseClient.auth.importAuthToken(
            accessToken = syntheticAuthenticatedJwt(userId),
            retrieveUser = true,
            autoRefresh = false,
        )
        val authRequest = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(authRequest?.path).contains("/auth/v1/user")
        fakeAuthRepository.currentUser = User(
            id = userId,
            email = email,
            role = UserRole.DOCTOR,
        )
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
                          "id": "11111111-1111-4111-8111-111111111111",
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
        val requestsBeforeMismatch = mockWebServer.requestCount
        assertThat(repository.getGuestAccessTokenForRoom("different-room")).isNull()
        assertThat(mockWebServer.requestCount).isEqualTo(requestsBeforeMismatch)
        assertThat(requestId).isEqualTo("11111111-1111-4111-8111-111111111111")
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
    fun `doctor refusal without an authenticated session fails closed`() = runTest {
        val result = repository.declinePharmacyOffer("44444444-4444-4444-8444-444444444444")

        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `doctor refusal sends exact offer id to server guarded RPC`() = runTest {
        val doctorUserId = "33333333-3333-4333-8333-333333333333"
        authenticateDoctor(doctorUserId)
        val offerId = "44444444-4444-4444-8444-444444444444"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"declined":true}"""),
        )

        assertThat(repository.declinePharmacyOffer(offerId).getOrThrow()).isTrue()

        val request = mockWebServer.takeRequest()
        assertThat(request.method).isEqualTo("POST")
        assertThat(request.path).isEqualTo("/rest/v1/rpc/decline_my_pharmacy_dispatch_offer")
        assertThat(request.body.readUtf8()).contains("\"p_offer_id\":\"$offerId\"")
        assertThat(mockWebServer.requestCount).isEqualTo(2)
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
        authenticateDoctor(doctorId)
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
        assertThat(mockWebServer.requestCount).isEqualTo(2)
    }

    @Test
    fun `pending offer polling skips the protected RPC without an authenticated session`() = runTest {
        repository.observeSearchingRequests()

        // The observer starts before sign-in on some app paths. It must not
        // issue the protected PostgREST RPC with the project's anon credential.
        val request = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(request).isNull()
    }

    @Test
    fun `pending offers transition from anon to authenticated session and clear on logout`() = runTest {
        val anonymousOffers = repository.observeSearchingRequests()
        assertThat(anonymousOffers.value).isEmpty()
        assertThat(mockWebServer.requestCount).isEqualTo(0)

        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"id":"authenticated-user-id","aud":"authenticated","role":"authenticated","email":"patient@example.test","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"identities":[]}"""),
        )
        supabaseClient.auth.importAuthToken(
            accessToken = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdXRoZW50aWNhdGVkLWRvY3Rvci1pZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6NDEwMjQ0NDgwMCwiaWF0IjoxNzAwMDAwMDAwfQ.c3ludGhldGljLXNpZ25hdHVyZQ",
            retrieveUser = true,
            autoRefresh = false,
        )
        val authUserRequest = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(authUserRequest?.path).contains("/auth/v1/user")
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """[
                      {
                        "id": "offer-request-123",
                        "patient_phone": "+5491100000000",
                        "patient_name": "Synthetic Patient",
                        "tier_requested": "general",
                        "status": "searching",
                        "cloudflare_room_id": "synthetic-doctor-room",
                        "created_at": "2026-11-19T00:00:00Z",
                        "care_country": "AR",
                        "offer_id": "offer-123",
                        "offer_expires_at": "2026-11-19T00:10:00Z"
                      }
                    ]""".trimIndent(),
                ),
        )

        val authenticatedOffers = repository.observeSearchingRequests()
        // Drive the session-aware worker login-resume poll in this JVM fixture.
        testDispatcher.scheduler.advanceTimeBy(1_001L)
        val rpc = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(rpc).isNotNull()
        assertThat(rpc!!.path).isEqualTo("/rest/v1/rpc/get_my_pending_dispatch_offers")
        assertThat(rpc.getHeader("Authorization"))
            .isEqualTo("Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdXRoZW50aWNhdGVkLWRvY3Rvci1pZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6NDEwMjQ0NDgwMCwiaWF0IjoxNzAwMDAwMDAwfQ.c3ludGhldGljLXNpZ25hdHVyZQ")
        val receivedOffers = withContext(Dispatchers.Default) {
            withTimeout(5_000L) {
                authenticatedOffers.first { offers ->
                    offers.any { it.id == "offer-request-123" }
                }
            }
        }
        assertThat(receivedOffers.map { it.id })
            .containsExactly("offer-request-123")

        mockWebServer.enqueue(MockResponse().setResponseCode(204))
        supabaseClient.auth.signOut()
        val loggedOutOffers = repository.observeSearchingRequests()
        val logout = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(logout?.path).contains("/auth/v1/logout")
        assertThat(loggedOutOffers.value).isEmpty()
        assertThat(mockWebServer.requestCount).isEqualTo(3)
    }

    @Test
    fun `active on duty doctors RPC is skipped without an authenticated Supabase session`() = runTest {
        val result = repository.getActiveOnDutyDoctors()

        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `doctor heartbeat without an authenticated Supabase session never uses anon credentials`() = runTest {
        val result = repository.sendDoctorHeartbeat("doc-uuid-456")
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `online presence heartbeat without an authenticated Supabase session never uses anon credentials`() = runTest {
        val result = repository.sendDoctorPresenceHeartbeat()
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(0)
    }

    @Test
    fun `forbidden consultation finish never falls back to direct clinical updates`() = runTest {
        authenticateDoctor("doc-uuid-1")
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"code":"42501","message":"doctor_not_authorized"}""")
        )
        val result = repository.finishPharmacyRequest("doc-uuid-1", "request-uuid-2")
        assertThat(result.isFailure).isTrue()
        assertThat(mockWebServer.requestCount).isEqualTo(2)
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

    @Test
    fun `authenticated Brazilian intake uses signed API with Bearer token, lgpdConsent and handles pending_payment`() = runTest {
        val patientUserId = "77777777-7777-4777-8777-777777777777"
        val email = "paciente.br@example.invalid"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"id":"$patientUserId","aud":"authenticated","role":"authenticated","email":"$email","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"identities":[]}""",
                ),
        )
        supabaseClient.auth.importAuthToken(
            accessToken = syntheticAuthenticatedJwt(patientUserId),
            retrieveUser = true,
            autoRefresh = false,
        )
        mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        fakeAuthRepository.currentUser = User(id = patientUserId, email = email, role = UserRole.PATIENT)

        // 1) patients care_country verification query
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""[{"care_country":"BR"}]"""),
        )
        // 2) Signed API response returning pending_payment + recoveryToken
        val requestId = "88888888-8888-4888-8888-888888888888"
        val recovery = "b".repeat(64)
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "success": true,
                      "data": {
                        "request": {
                          "id": "$requestId",
                          "care_country": "BR",
                          "patient_cpf": "12345678909",
                          "patient_phone": "+5551987654321",
                          "patient_name": "Paciente Brasil",
                          "tier_requested": "general",
                          "status": "pending_payment",
                          "currency": "BRL",
                          "price_minor": 7900,
                          "cloudflare_room_id": "cf-room-br-auth",
                          "created_at": "2026-11-21T18:00:00Z"
                        },
                        "accessToken": "signed-br-auth-token",
                        "recoveryToken": "$recovery"
                      }
                    }""".trimIndent(),
                ),
        )

        val created = repository.createPatientDispatchRequest(
            patientDni = "12345678909",
            patientPhone = "+5551987654321",
            patientName = "Paciente Brasil",
            tierRequested = "general",
            symptomSummary = "Renovação de receita",
            patientCpf = "12345678909",
            careCountry = "BR",
            referralCode = null,
        ).getOrThrow()

        assertThat(created.id).isEqualTo(requestId)
        assertThat(created.status).isEqualTo("pending_payment")
        assertThat(created.priceMinor).isEqualTo(7900)
        assertThat(created.currency).isEqualTo("BRL")

        val countryCheckReq = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(countryCheckReq?.path).contains("/rest/v1/patients")

        val dispatchReq = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(dispatchReq?.path).isEqualTo("/api/pharmacy/dispatch/request")
        assertThat(dispatchReq?.getHeader("Authorization")).startsWith("Bearer ")
        val sentBody = dispatchReq?.body?.readUtf8().orEmpty()
        assertThat(sentBody).contains("\"careCountry\":\"BR\"")
        assertThat(sentBody).contains("\"lgpdConsent\":true")
        assertThat(sentBody).contains("\"patientCpf\":\"12345678909\"")
    }

    @Test
    fun `signed API rejection surfaces allowlisted error code without leaking PHI`() = runTest {
        mockWebServer.enqueue(
            MockResponse().setResponseCode(409)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":false,"error":"no_doctors_available_now"}"""),
        )
        val result = repository.createPatientDispatchRequest(
            patientDni = "12345678909",
            patientPhone = "+5551987654321",
            patientName = "Paciente Brasil",
            tierRequested = "general",
            symptomSummary = "Consulta",
            patientCpf = "12345678909",
            careCountry = "BR",
        )
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("no_doctors_available_now")
        assertThat(extractSafeDispatchErrorCode("""{"error":"CPF 12345678909 leaked"}""")).isNull()
    }

    @Test
    fun `authenticated patient without guest recovery uses Bearer token for checkout`() = runTest {
        val patientUserId = "77777777-7777-4777-8777-777777777777"
        val email = "paciente.br@example.invalid"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"id":"$patientUserId","aud":"authenticated","role":"authenticated","email":"$email","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"identities":[]}""",
                ),
        )
        supabaseClient.auth.importAuthToken(
            accessToken = syntheticAuthenticatedJwt(patientUserId),
            retrieveUser = true,
            autoRefresh = false,
        )
        mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        fakeAuthRepository.currentUser = User(id = patientUserId, email = email, role = UserRole.PATIENT)

        val requestId = "99999999-9999-4999-8999-999999999999"
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":true,"data":{"status":"pending","checkoutUrl":"https://www.mercadopago.com.br/checkout/auth-test"}}"""),
        )

        val checkout = repository.startDispatchCheckout(requestId).getOrThrow()
        assertThat(checkout.status).isEqualTo("pending")
        assertThat(checkout.checkoutUrl).isEqualTo("https://www.mercadopago.com.br/checkout/auth-test")

        val post = mockWebServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(post?.path).isEqualTo("/api/pharmacy/dispatch/payment/create")
        assertThat(post?.getHeader("Authorization")).startsWith("Bearer ")
        val sentBody = post?.body?.readUtf8().orEmpty()
        assertThat(sentBody).contains("\"requestId\":\"$requestId\"")
        assertThat(sentBody).doesNotContain("accessToken")
    }

}
