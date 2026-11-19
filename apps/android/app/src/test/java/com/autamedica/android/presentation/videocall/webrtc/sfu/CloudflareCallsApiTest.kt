package com.autamedica.android.presentation.videocall.webrtc.sfu

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CloudflareCallsApiTest {

    @Test
    fun `Cloudflare Calls requests mirror the deployed Edge Function route contract`() {
        assertThat(cloudflareCallsContractError("POST", "sessions/new")).isNull()
        assertThat(cloudflareCallsContractError("POST", "sessions/session-1/tracks/new")).isNull()
        assertThat(cloudflareCallsContractError("PUT", "sessions/session-1/renegotiate")).isNull()
        assertThat(cloudflareCallsContractError("POST", "sessions/session-1/tracks/close")).isNull()

        assertThat(cloudflareCallsContractError("POST", "send"))
            .isEqualTo("invalid_cloudflare_calls_path")
        assertThat(cloudflareCallsContractError("GET", "sessions/new"))
            .isEqualTo("invalid_cloudflare_calls_method")
        assertThat(cloudflareCallsContractError("POST", "poll"))
            .isEqualTo("invalid_cloudflare_calls_path")
        assertThat(cloudflareCallsContractError("POST", "leave"))
            .isEqualTo("invalid_cloudflare_calls_path")
    }

    @Test
    fun `guest token is sent only when there is no Supabase JWT session`() {
        val guestHeaders = buildGuestTokenHeaders(
            hasJwtSession = false,
            guestToken = "synthetic-hs256-guest-token",
        )
        assertThat(guestHeaders?.get("x-guest-token")).isEqualTo("synthetic-hs256-guest-token")

        val jwtHeaders = buildGuestTokenHeaders(
            hasJwtSession = true,
            guestToken = "must-not-be-sent",
        )
        assertThat(jwtHeaders).isNull()
    }

    @Test
    fun `missing guest token does not create an empty authorization header`() {
        assertThat(buildGuestTokenHeaders(hasJwtSession = false, guestToken = null)).isNull()
        assertThat(buildGuestTokenHeaders(hasJwtSession = false, guestToken = "  ")).isNull()
    }

    @Test
    fun `authorization errors have explicit user-facing messages for 401 402 and 403`() {
        assertThat(cloudflareAuthorizationMessage(401))
            .contains("autorización de invitado")
        assertThat(cloudflareAuthorizationMessage(402))
            .contains("R$79")
        assertThat(cloudflareAuthorizationMessage(403))
            .contains("no tenés permiso")
        assertThat(cloudflareAuthorizationMessage(500)).isNull()
    }

    @Test
    fun `authorization errors preserve explicit HTTP status semantics`() {
        val unauthorized = CloudflareCallsApiException(401, "invalid_guest_token", "invalid_guest_token")
        val paymentRequired = CloudflareCallsApiException(402, "brazil_pharmacy_payment_required", "jordan_payment_required")
        val forbidden = CloudflareCallsApiException(403, "guest_call_mismatch", "guest_call_mismatch")

        assertThat(unauthorized.isUnauthorized).isTrue()
        assertThat(paymentRequired.isPaymentRequired).isTrue()
        assertThat(forbidden.isForbidden).isTrue()
        assertThat(paymentRequired.errorCode).isEqualTo("jordan_payment_required")
    }
}
