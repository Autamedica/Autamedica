package com.autamedica.android.presentation.videocall.webrtc.sfu

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Cliente tipado del edge function `cloudflare-calls` (proxy autenticado hacia el
 * SFU de Cloudflare Calls con autorización por participación en la sala).
 *
 * El body enviado es el envelope { roomId, method, path, body } que espera la
 * función. Los secretos del SFU nunca llegan al cliente: viven en las variables
 * de entorno de la edge function.
 */
interface CloudflareCallsApi {
    suspend fun call(method: String, path: String, body: JsonElement? = null): JsonElement
}

class CloudflareCallsApiException(
    val httpStatus: Int,
    val details: String,
) : RuntimeException("Cloudflare Calls error $httpStatus: $details")

class SupabaseCloudflareCallsApi(
    private val supabaseClient: SupabaseClient,
    private val json: Json,
    private val roomId: String,
) : CloudflareCallsApi {

    override suspend fun call(method: String, path: String, body: JsonElement?): JsonElement {
        val payload = buildJsonObject {
            put("roomId", roomId)
            put("method", method)
            put("path", path)
            if (body != null) put("body", body)
        }

        com.autamedica.android.logging.SecureLog.info("[SFU-API] -> $method $path (roomId=$roomId) body=$body")
        val response = supabaseClient.functions.invoke("cloudflare-calls", payload)
        val text = response.bodyAsText()
        com.autamedica.android.logging.SecureLog.info("[SFU-API] <- ${response.status.value}: $text")
        if (response.status.value !in 200..299) {
            throw CloudflareCallsApiException(response.status.value, text)
        }

        return json.parseToJsonElement(text)
    }
}