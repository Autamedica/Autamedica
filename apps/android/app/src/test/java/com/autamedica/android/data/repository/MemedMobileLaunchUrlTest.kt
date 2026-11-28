package com.autamedica.android.data.repository

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.createSupabaseClient
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Base64
import java.util.concurrent.TimeUnit

class MemedMobileLaunchUrlTest {
    private val appointment = "12345678-abcd-4d91-8a1f-1234567890ab"
    private val allowed = "https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?appointmentId=$appointment"
    private val validOpaqueCode = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2"

    private lateinit var supabaseServer: MockWebServer
    private lateinit var portalServer: MockWebServer
    private lateinit var supabaseClient: SupabaseClient

    @Before
    fun setUp() {
        supabaseServer = MockWebServer()
        portalServer = MockWebServer()
        supabaseServer.start()
        portalServer.start()

        supabaseClient = createSupabaseClient(
            supabaseUrl = supabaseServer.url("/").toString(),
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
        }
    }

    @After
    fun tearDown() {
        supabaseServer.shutdown()
        portalServer.shutdown()
    }

    private fun makeJwt(sub: String = "doc-user-1"): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val header = enc.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val payload = enc.encodeToString(
            """{"sub":"$sub","aud":"authenticated","role":"authenticated","exp":4102444800}""".toByteArray(),
        )
        return "$header.$payload.synthetic"
    }

    @Test fun acceptsOnlyCanonicalPortalUrlAndMatchingAppointment() {
        assertEquals(allowed, MemedMobileLaunchUrl.validate(allowed, appointment))
        assertTrue(MemedMobileLaunchUrl.isUuid(appointment))
        assertFalse(MemedMobileLaunchUrl.isUuid("../admin"))
    }

    @Test fun acceptsPharmacyDispatchRequestIdAndRejectsMismatchedKeys() {
        val dispatchUrl = "https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?requestId=$appointment"
        assertEquals(dispatchUrl, MemedMobileLaunchUrl.validate(dispatchUrl, appointment, "requestId"))
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.validate(dispatchUrl, appointment, "appointmentId")
        }
    }

    @Test fun acceptsDirectPatientIdAndRejectsMismatchedKeys() {
        val patientUrl = "https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?patientId=$appointment"
        assertEquals(patientUrl, MemedMobileLaunchUrl.validate(patientUrl, appointment, "patientId"))
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.validate(patientUrl, appointment, "requestId")
        }
    }

    @Test fun pharmacyDispatchIsCanonicalWhenBothEncounterIdsExist() {
        assertEquals(
            MemedEncounterTarget("requestId", appointment),
            MemedMobileLaunchUrl.resolveEncounterTarget(
                appointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                dispatchRequestId = appointment,
            ),
        )
    }

    @Test fun invalidDispatchDoesNotFallBackToAnUnrelatedAppointment() {
        assertNull(
            MemedMobileLaunchUrl.resolveEncounterTarget(
                appointmentId = appointment,
                dispatchRequestId = "../invalid",
            ),
        )
    }

    @Test fun appointmentIsUsedOnlyWhenNoDispatchExists() {
        assertEquals(
            MemedEncounterTarget("appointmentId", appointment),
            MemedMobileLaunchUrl.resolveEncounterTarget(appointment, null),
        )
    }

    @Test fun blocksUrlTamperingAndCredentialLeakage() {
        val bad = listOf(
            allowed + "&patientId=123",
            allowed + "#access_token=secret",
            allowed.replace("doctor.autamedica.com", "evil.example"),
            allowed.replace("https:", "http:"),
            allowed.replace("https://", "https://attacker@"),
            allowed.replace("appointmentId=", "jwt="),
            allowed.replace(appointment, "00000000-aaaa-4d91-8a1f-000000000000"),
        )
        for (url in bad) {
            assertThrows(IllegalArgumentException::class.java) {
                MemedMobileLaunchUrl.validate(url, appointment)
            }
        }
    }

    @Test fun buildsAndValidatesOpaqueExchangeUrlWithZeroCredentials() {
        val nextPath = MemedMobileLaunchUrl.extractCanonicalNextPath(allowed)
        assertEquals("/doctors/prescriptions/memed-mobile?appointmentId=$appointment", nextPath)

        val exchangeUrl = MemedMobileLaunchUrl.buildExchangeUrl(
            code = validOpaqueCode,
            nextPath = nextPath,
        )
        assertTrue(exchangeUrl.startsWith("https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?"))
        assertTrue(exchangeUrl.contains("code=$validOpaqueCode"))
        assertFalse(exchangeUrl.contains("access_token"))
        assertFalse(exchangeUrl.contains("refresh_token"))
        assertFalse(exchangeUrl.contains("eyJ"))

        // Reject JWT passed as code, extra params, wrong next, or leaked tokens
        val jwtAsCode = makeJwt()
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.buildExchangeUrl(jwtAsCode, nextPath)
        }
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.validateExchangeUrl(
                "$exchangeUrl&extra=1",
                nextPath,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.validateExchangeUrl(
                exchangeUrl.replace(appointment, "00000000-aaaa-4d91-8a1f-000000000000"),
                nextPath,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MemedMobileLaunchUrl.validateExchangeUrl(
                "$exchangeUrl#refresh_token=leak",
                nextPath,
            )
        }
    }

    @Test fun repositoryPerformsTwoStepPreflightAndOpaqueExchangeWithoutTokensInUrl() = runTest {
        val jwt = makeJwt()
        supabaseClient.auth.importSession(
            UserSession(
                accessToken = jwt,
                refreshToken = "rt_initial_secret",
                expiresIn = 3600,
                tokenType = "bearer",
            ),
        )

        val portalOrigin = portalServer.url("/").toString().trimEnd('/')
        val expectedNext = "/doctors/prescriptions/memed-mobile?appointmentId=$appointment"
        val returnedExchangeUrl = MemedMobileLaunchUrl.buildExchangeUrl(
            code = validOpaqueCode,
            nextPath = expectedNext,
            baseOrigin = portalOrigin,
        )

        supabaseServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"success":true,"launchUrl":"$allowed","requiresBrowserSignIn":true,"provider":"memed","country":"BR"}""",
                ),
        )
        portalServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"success":true,"data":{"code":"$validOpaqueCode","exchangeUrl":"$returnedExchangeUrl","expiresInSeconds":45}}""",
                ),
        )

        val repo = MemedMobileBridgeRepository(
            client = supabaseClient,
            httpClient = OkHttpClient(),
            supabaseBaseUrl = supabaseServer.url("/").toString().trimEnd('/'),
            portalBaseUrl = portalOrigin,
        )

        val session = repo.createLaunch(appointment).getOrThrow()
        assertEquals(allowed, session.canonicalLaunchUrl)
        assertEquals(returnedExchangeUrl, session.exchangeUrl)
        assertFalse(session.exchangeUrl.contains(jwt))
        assertFalse(session.exchangeUrl.contains("rt_initial_secret"))

        val preflightReq = supabaseServer.takeRequest(2, TimeUnit.SECONDS)!!
        assertEquals("/functions/v1/memed-mobile-preflight", preflightReq.path)
        assertEquals("Bearer $jwt", preflightReq.getHeader("Authorization"))

        val exchangeReq = portalServer.takeRequest(2, TimeUnit.SECONDS)!!
        assertEquals("/api/doctors/memed-mobile/session-exchange", exchangeReq.path)
        assertEquals("Bearer $jwt", exchangeReq.getHeader("Authorization"))
        val exchangeBody = exchangeReq.body.readUtf8()
        assertTrue(exchangeBody.contains("rt_initial_secret"))
        assertTrue(exchangeBody.contains(expectedNext))
    }

    @Test fun repositoryRefreshesSessionAndRetriesOnceOnExchange401() = runTest {
        val staleJwt = makeJwt("doc-stale")
        val freshJwt = makeJwt("doc-fresh")
        supabaseClient.auth.importSession(
            UserSession(
                accessToken = staleJwt,
                refreshToken = "rt_stale",
                expiresIn = 3600,
                tokenType = "bearer",
            ),
        )

        val portalOrigin = portalServer.url("/").toString().trimEnd('/')
        val expectedNext = "/doctors/prescriptions/memed-mobile?appointmentId=$appointment"
        val freshExchangeUrl = MemedMobileLaunchUrl.buildExchangeUrl(
            code = validOpaqueCode,
            nextPath = expectedNext,
            baseOrigin = portalOrigin,
        )

        // 1st exchange POST returns 401 -> Supabase Auth refresh -> 2nd exchange POST returns 200
        portalServer.enqueue(
            MockResponse().setResponseCode(401).setBody("""{"success":false,"error":{"code":"UNAUTHENTICATED","message":"expired"}}"""),
        )
        supabaseServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"access_token":"$freshJwt","refresh_token":"rt_fresh","expires_in":3600,"token_type":"bearer","user":{"id":"doc-fresh","aud":"authenticated","role":"authenticated","email":"doc@autamedica.com"}}""",
                ),
        )
        portalServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"success":true,"data":{"code":"$validOpaqueCode","exchangeUrl":"$freshExchangeUrl","expiresInSeconds":45}}""",
                ),
        )

        val repo = MemedMobileBridgeRepository(
            client = supabaseClient,
            httpClient = OkHttpClient(),
            supabaseBaseUrl = supabaseServer.url("/").toString().trimEnd('/'),
            portalBaseUrl = portalOrigin,
        )

        val result = repo.createSessionExchangeForLaunchUrl(allowed, forceRefreshSession = false)
        assertTrue(result.isSuccess)
        assertEquals(freshExchangeUrl, result.getOrNull())

        val firstPost = portalServer.takeRequest(2, TimeUnit.SECONDS)!!
        assertEquals("Bearer $staleJwt", firstPost.getHeader("Authorization"))
        val secondPost = portalServer.takeRequest(2, TimeUnit.SECONDS)!!
        assertEquals("Bearer $freshJwt", secondPost.getHeader("Authorization"))
    }
}
