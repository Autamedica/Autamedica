package com.autamedica.android.presentation.videocall.webrtc.sfu

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.currentSessionOrNull
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Headers
import io.ktor.http.headersOf
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Cliente SFU para pacientes/doctores con Supabase JWT y pacientes invitados
 * con el JWT HMAC de alcance único del flujo Jordan.
 */
interface CloudflareCallsApi {
    suspend fun call(method: String, path: String, body: JsonElement? = null): JsonElement
}

class CloudflareCallsApiException(
    val httpStatus: Int,
    val details: String,
    val errorCode: String? = null,
) : RuntimeException("Cloudflare Calls error $httpStatus: ${errorCode ?: "request_failed"}") {
    val isUnauthorized: Boolean get() = httpStatus == 401
    val isPaymentRequired: Boolean get() = httpStatus == 402
    val isForbidden: Boolean get() = httpStatus == 403
}

/** Null means use the normal Supabase session; non-null is only for guest auth. */
internal fun buildGuestTokenHeaders(hasJwtSession: Boolean, guestToken: String?): Headers? {
    if (hasJwtSession) return null
    val token = guestToken?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return headersOf("x-guest-token", token)
}

class SupabaseCloudflareCallsApi(
    private val supabaseClient: SupabaseClient,
    private val json: Json,
    private val roomId: String,
    private val guestTokenProvider: suspend () -> String? = { null },
) : CloudflareCallsApi {

    override suspend fun call(method: String, path: String, body: JsonElement?): JsonElement {
        val payload = buildJsonObject {
            put("roomId", roomId)
            put("method", method)
            put("path", path)
            if (body != null) put("body", body)
        }

        val jwt = supabaseClient.auth.currentSessionOrNull()?.accessToken
            ?.takeIf { it.isNotBlank() }
        val headers = if (jwt != null) {
            // A valid signed-in session remains the canonical auth path. Never
            // attach guest credentials as a fallback to a rejected user JWT.
            Headers.Empty
        } else {
            buildGuestTokenHeaders(false, guestTokenProvider())
                ?: throw CloudflareCallsApiException(401, "guest_token_missing", "guest_token_missing")
        }

        com.autamedica.android.logging.SecureLog.info("[SFU-API] -> $method $path (roomId=$roomId)")
        val response = supabaseClient.functions.invoke(
            function = "cloudflare-calls",
            body = payload,
            headers = headers,
        )
        val text = response.bodyAsText()
        if (response.status.value !in 200..299) {
            val errorCode = runCatching {
                json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull
            }.getOrNull()
            // Preserve 401/402/403 as typed errors for the call UI and retry policy.
            throw CloudflareCallsApiException(response.status.value, text, errorCode)
        }

        return json.parseToJsonElement(text)
    }
}
