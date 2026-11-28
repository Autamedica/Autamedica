package com.autamedica.android.presentation.doctors.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MemedPrescriberWebViewTest {

    @Test
    fun `blocks login redirects so WebView never renders broken web login`() {
        val loginUrls = listOf(
            "https://doctor.autamedica.com/auth/login?returnTo=%2Fdoctors%2Fprescriptions%2Fmemed-mobile",
            "https://www.autamedica.com/auth/login",
            "https://doctor.autamedica.com/login",
            "https://doctor.autamedica.com/signin",
            "https://doctor.autamedica.com/ingresar",
        )
        for (url in loginUrls) {
            assertEquals(
                MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT,
                MemedWebViewNavigationPolicy.classifyNavigation(url),
            )
        }
    }

    @Test
    fun `keeps Memed and ICP-Brasil HTTPS flows inside embedded WebView and blocks external schemes`() {
        val allowed = listOf(
            "https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?code=abc&next=%2Fdoctors%2Fprescriptions%2Fmemed-mobile%3FappointmentId%3D123",
            "https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?appointmentId=123",
            "https://partners.memed.com.br/integration.js",
            "https://vidaas.com.br/oauth/authorize",
            "https://oauth.birdid.com.br/authorize",
        )
        for (url in allowed) {
            assertEquals(
                MemedWebViewNavigationAction.ALLOW_IN_WEBVIEW,
                MemedWebViewNavigationPolicy.classifyNavigation(url),
            )
        }

        assertEquals(
            MemedWebViewNavigationAction.RETURN_TO_APP,
            MemedWebViewNavigationPolicy.classifyNavigation("autamedica://return"),
        )

        val blocked = listOf(
            "vidaas://callback?code=123",
            "intent://scan/#Intent;end",
            "http://doctor.autamedica.com/doctors/prescriptions/memed-mobile",
            "https://evil.example/phish",
        )
        for (url in blocked) {
            assertEquals(
                MemedWebViewNavigationAction.BLOCK_EXTERNAL,
                MemedWebViewNavigationPolicy.classifyNavigation(url),
            )
        }
    }

    @Test
    fun `classifies 401 and 403 HTTP failures cleanly`() {
        val unauth = MemedWebViewNavigationPolicy.classifyHttpError(
            requestUrl = "https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?code=abc",
            statusCode = 401,
            isForMainFrame = true,
        )
        assertNotNull(unauth)
        assertEquals(MemedWebViewErrorCode.EXCHANGE_UNAUTHORIZED, unauth?.code)
        assertEquals("EXCHANGE_HTTP_401", unauth?.diagnosticCode)
        assertTrue(unauth?.canAutoRetry == true)

        val forbidden = MemedWebViewNavigationPolicy.classifyHttpError(
            requestUrl = "https://doctor.autamedica.com/api/doctors/prescriptions/memed-mobile-context?appointmentId=123",
            statusCode = 403,
            isForMainFrame = false,
        )
        assertNotNull(forbidden)
        assertEquals(MemedWebViewErrorCode.EXCHANGE_FORBIDDEN, forbidden?.code)
        assertEquals("PORTAL_HTTP_403", forbidden?.diagnosticCode)
        assertFalse(forbidden?.canAutoRetry == true)

        assertNull(
            MemedWebViewNavigationPolicy.classifyHttpError(
                requestUrl = "https://partners.memed.com.br/favicon.ico",
                statusCode = 404,
                isForMainFrame = false,
            ),
        )
    }

    @Test
    fun `retry controller allows at most one auto retry for expired session and zero for clinical denial`() {
        val controller = MemedHandoffRetryController(maxAutoRetries = 1)
        val sessionError = MemedWebViewErrorState(
            code = MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
            diagnosticCode = "LOGIN_REDIRECT_BLOCKED",
            canAutoRetry = true,
        )
        assertTrue(controller.tryConsumeAutoRetry(sessionError))
        assertFalse(controller.tryConsumeAutoRetry(sessionError))

        controller.resetForManualRetry()
        assertTrue(controller.tryConsumeAutoRetry(sessionError))

        val clinicalDenial = MemedWebViewErrorState(
            code = MemedWebViewErrorCode.CLINICAL_DENIED_IN_PAGE,
            diagnosticCode = "verified_crm_required",
            canAutoRetry = false,
        )
        controller.resetForManualRetry()
        assertFalse(controller.tryConsumeAutoRetry(clinicalDenial))
    }

    @Test
    fun `parses MemedMobileRoute JS bridge events`() {
        val ready = MemedWebViewNavigationPolicy.parseBridgeEvent("""{"type":"ready"}""")
        assertEquals("ready", ready?.type)

        val expired = MemedWebViewNavigationPolicy.parseBridgeEvent(
            """{"type":"session_expired","code":"SESSION_EXPIRED","status":401,"message":"Sessão expirada"}""",
        )
        assertNotNull(expired)
        val errorState = MemedWebViewNavigationPolicy.errorFromBridgeEvent(expired!!)
        assertEquals(MemedWebViewErrorCode.SESSION_EXPIRED_IN_PAGE, errorState?.code)
        assertTrue(errorState?.canAutoRetry == true)

        val denied = MemedWebViewNavigationPolicy.parseBridgeEvent(
            """{"type":"clinical_denied","code":"verified_crm_required","status":403}""",
        )
        val deniedError = MemedWebViewNavigationPolicy.errorFromBridgeEvent(denied!!)
        assertEquals(MemedWebViewErrorCode.CLINICAL_DENIED_IN_PAGE, deniedError?.code)
        assertFalse(deniedError?.canAutoRetry == true)
    }

    @Test
    fun `prescription, certificate and video call screens use unified MemedPrescriberWebView with no manual cookies or external browsers`() {
        val androidMainDir = listOf(
            File("src/main/java/com/autamedica/android"),
            File("app/src/main/java/com/autamedica/android"),
            File("apps/android/app/src/main/java/com/autamedica/android"),
        ).first { it.exists() }

        val prescriberWebView = File(androidMainDir, "presentation/doctors/components/MemedPrescriberWebView.kt").readText()
        val createPrescriptionScreen = File(androidMainDir, "presentation/doctors/prescriptions/CreatePrescriptionScreen.kt").readText()
        val createCertificateScreen = File(androidMainDir, "presentation/doctors/certificates/CreateCertificateScreen.kt").readText()
        val videoCallScreen = File(androidMainDir, "presentation/videocall/VideoCallScreen.kt").readText()
        val bridgeRepo = File(androidMainDir, "data/repository/MemedMobileBridgeRepository.kt").readText()

        assertTrue(createPrescriptionScreen.contains("MemedPrescriberWebView("))
        assertTrue(createCertificateScreen.contains("MemedPrescriberWebView("))
        assertTrue(videoCallScreen.contains("MemedPrescriberWebView("))

        assertFalse(videoCallScreen.contains("MemedInCallWebView"))
        assertFalse(videoCallScreen.contains("CustomTabsIntent"))
        assertFalse(prescriberWebView.contains("CustomTabsIntent"))
        assertFalse(prescriberWebView.contains("Intent.ACTION_VIEW"))
        assertFalse(videoCallScreen.contains("auth-token="))
        assertFalse(prescriberWebView.contains("auth-token="))
        assertFalse(bridgeRepo.contains("auth-token="))
        assertFalse(prescriberWebView.contains("removeSessionCookies("))
        assertFalse(videoCallScreen.contains("removeSessionCookies("))
    }

    @Test
    fun `handles renderer crashes, edge-to-edge bottom insets, and live region announcements`() {
        val androidMainDir = listOf(
            File("src/main/java/com/autamedica/android"),
            File("app/src/main/java/com/autamedica/android"),
            File("apps/android/app/src/main/java/com/autamedica/android"),
        ).first { it.exists() }

        val prescriberWebView = File(androidMainDir, "presentation/doctors/components/MemedPrescriberWebView.kt").readText()
        val videoCallScreen = File(androidMainDir, "presentation/videocall/VideoCallScreen.kt").readText()

        assertTrue(MemedWebViewErrorCode.entries.contains(MemedWebViewErrorCode.RENDER_PROCESS_GONE))
        assertTrue(prescriberWebView.contains("navigationBarsPadding()"))
        assertTrue(prescriberWebView.contains("imePadding()"))
        assertTrue(prescriberWebView.contains("onRenderProcessGone("))
        assertTrue(prescriberWebView.contains("LiveRegionMode.Polite"))
        assertTrue(prescriberWebView.contains("LiveRegionMode.Assertive"))
        assertFalse(videoCallScreen.contains("applyStatusBarPadding = false"))
    }
}
