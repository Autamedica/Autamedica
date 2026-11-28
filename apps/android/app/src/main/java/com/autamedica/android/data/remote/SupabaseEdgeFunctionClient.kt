package com.autamedica.android.data.remote

import com.autamedica.android.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class EdgeFunctionException(
    val statusCode: Int,
    val errorCode: String?,
    override val message: String,
) : IllegalStateException(message)

private val edgeFunctionJson = Json { ignoreUnknownKeys = true }

private val edgeFunctionHttpClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
}

/**
 * Invokes a Supabase Edge Function over OkHttp and extracts structured
 * `{ code, error, message }` payloads on non-2xx responses instead of
 * propagating opaque SDK RestException dumps to the UI.
 */
suspend fun SupabaseClient.invokeEdgeFunctionJson(
    functionName: String,
    body: JsonObject? = null,
): String {
    val endpoint = BuildConfig.SUPABASE_URL.trimEnd('/') + "/functions/v1/$functionName"
    val accessToken = this.auth.currentSessionOrNull()?.accessToken?.takeIf { it.isNotBlank() }

    val (httpCode, responseText) = withContext(Dispatchers.IO) {
        val requestBody = (body?.toString() ?: "{}")
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val requestBuilder = Request.Builder()
            .url(endpoint)
            .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .header("Accept", "application/json")
            .post(requestBody)
        if (accessToken != null) {
            requestBuilder.header("Authorization", "Bearer $accessToken")
        }
        edgeFunctionHttpClient.newCall(requestBuilder.build()).execute().use { resp ->
            resp.code to resp.body?.string().orEmpty()
        }
    }

    if (httpCode !in 200..299) {
        val root = runCatching { edgeFunctionJson.parseToJsonElement(responseText) as? JsonObject }.getOrNull()
        val errCode = root?.get("code")?.jsonPrimitive?.contentOrNull
        val errMsg = root?.get("message")?.jsonPrimitive?.contentOrNull
        val errField = root?.get("error")?.jsonPrimitive?.contentOrNull
        val cleanMsg = errMsg ?: errField ?: errCode ?: "Error del servidor (HTTP $httpCode)"
        throw EdgeFunctionException(httpCode, errCode, cleanMsg)
    }

    return responseText
}
