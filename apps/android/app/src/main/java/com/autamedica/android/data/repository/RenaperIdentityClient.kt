package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.RenaperIdentity
import com.autamedica.android.domain.model.RenaperLookupException
import com.autamedica.android.domain.model.RenaperSexId
import com.autamedica.android.domain.model.RenaperPreviewPrivacy
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin/Android RENAPER client. Calls ONLY AutaMedica's patient-authenticated
 * proxy; the MSAL/RENAPER password and Supabase service role stay server-side.
 *
 * Never log bodies, Bearer tokens, DNI, sex ID, or identity responses, even
 * under DEBUG (NetworkModule's shared OkHttp logs BODY by default).
 */
@Singleton
class RenaperIdentityClient @Inject constructor(
    private val supabaseClient: SupabaseClient,
    sharedHttp: OkHttpClient,
    private val json: Json,
) {
    private val privateHttp = sharedHttp.newBuilder().apply {
        interceptors().removeAll { it is HttpLoggingInterceptor }
        networkInterceptors().removeAll { it is HttpLoggingInterceptor }
        cache(null)
        // Never follow redirects with a patient Bearer token, even within a host.
        followRedirects(false)
        followSslRedirects(false)
    }.build()

    suspend fun lookup(dni: String, sex: RenaperSexId): Result<RenaperIdentity> = runCatching {
        // Separate Cloudflare Patients deployment; the generic WEB_API_URL points
        // to the public marketing site and cannot be assumed to expose this API.
        val origin = "https://paciente.autamedica.com"
        val parsed = URI(origin)
        require(
            parsed.scheme == "https" &&
                parsed.host == "paciente.autamedica.com" &&
                parsed.userInfo == null && parsed.path.isNullOrEmpty()
        ) { "Invalid RENAPER Patients origin" }

        supabaseClient.auth.awaitInitialization()
        val session = supabaseClient.auth.currentSessionOrNull()
            ?: throw RenaperLookupException(401)
        requireNotNull(session.user?.id) { "Authenticated patient required" }
        postLookup(origin, dni, sex, session.accessToken)
    }

    /**
     * Explicit patient attestation. This route must not be enabled until
     * the server's identity-lock RPC/triggers pass staging.
     * Android sends no official person data: the server re-queries RENAPER.
     */
    suspend fun confirm(sex: RenaperSexId): Result<Boolean> = runCatching {
        val origin = "https://paciente.autamedica.com"
        supabaseClient.auth.awaitInitialization()
        val session = supabaseClient.auth.currentSessionOrNull()
            ?: throw RenaperLookupException(401)
        requireNotNull(session.user?.id) { "Authenticated patient required" }
        confirmOnServer(origin, sex, session.accessToken)
    }

    /** Internal for MockWebServer tests. Never used with arbitrary origins in production. */
    internal suspend fun confirmOnServer(
        origin: String,
        sex: RenaperSexId,
        bearer: String,
    ): Boolean = withContext(Dispatchers.IO) {
        require(bearer.isNotBlank()) { "Authenticated patient required" }
        val body = buildJsonObject {
            put("acknowledge", true)
            put("sexId", sex.providerId)
        }.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("${origin.trimEnd('/')}/api/patients/identity/renaper/confirm")
            .header("Authorization", "Bearer $bearer")
            .header("Cache-Control", "no-store")
            .header("Accept", "application/json")
            .post(body)
            .build()
        privateHttp.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw RenaperLookupException(response.code)
            val root = json.parseToJsonElement(response.body?.string().orEmpty()).jsonObject
            val data = root["data"]?.jsonObject ?: throw RenaperLookupException(502)
            if (root["success"]?.jsonPrimitive?.booleanOrNull != true ||
                data["confirmed"]?.jsonPrimitive?.booleanOrNull != true ||
                data["biometricVerified"]?.jsonPrimitive?.booleanOrNull != false) {
                throw RenaperLookupException(502)
            }
            true
        }
    }

    /** Internal for MockWebServer regression tests. No production call uses its URL. */
    internal suspend fun postLookup(
        origin: String,
        dni: String,
        sex: RenaperSexId,
        bearer: String,
    ): RenaperIdentity = withContext(Dispatchers.IO) {
        require(dni.matches(Regex("^[0-9]{6,12}$"))) { "Invalid DNI" }
        require(bearer.isNotBlank()) { "Authenticated patient required" }

        val body = buildJsonObject {
            put("dni", dni)
            put("sexId", sex.providerId)
        }.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url("${origin.trimEnd('/')}/api/patients/identity/renaper")
            .header("Authorization", "Bearer $bearer")
            .header("Cache-Control", "no-store")
            .header("Accept", "application/json")
            .post(body)
            .build()

        privateHttp.newCall(request).execute().use { response ->
            // Do not include raw response bodies in exceptions or diagnostics.
            if (!response.isSuccessful) throw RenaperLookupException(response.code)
            val raw = response.body?.string().orEmpty()
            parseRenaperResponse(raw, json)
        }
    }
}

/** The API owns masking policy. Unpaid results must never be treated as unmasked. */
internal fun parseRenaperResponse(raw: String, json: Json = Json): RenaperIdentity {
    val root = json.parseToJsonElement(raw).jsonObject
    if (root["success"]?.jsonPrimitive?.booleanOrNull != true) {
        throw RenaperLookupException(502)
    }
    val data = root["data"]?.jsonObject ?: throw RenaperLookupException(502)
    if (data["source"]?.jsonPrimitive?.contentOrNull != "RENAPER") {
        throw RenaperLookupException(502)
    }
    val form = data["form"]?.jsonObject ?: throw RenaperLookupException(502)
    val hasPaid = data["hasPaid"]?.jsonPrimitive?.booleanOrNull
        ?: throw RenaperLookupException(502)
    val coverage = data["coverage"]?.let { element ->
        runCatching { element.jsonObject }.getOrNull()
    }
    fun field(name: String): String =
        form[name]?.jsonPrimitive?.contentOrNull.orEmpty().take(180)

    // Defensive masking: even a faulty backend response must not display
    // complete personal names or coverage when hasPaid=false.
    fun maskIfUnpaid(value: String): String {
        if (hasPaid || value.isBlank()) return value
        return value.take(1) + "*".repeat((value.length - 1).coerceAtMost(40))
    }

    return RenaperIdentity(
        checkedAt = data["checkedAt"]?.jsonPrimitive?.contentOrNull.orEmpty().take(64),
        hasPaid = hasPaid,
        firstName = maskIfUnpaid(field("firstName")),
        lastName = maskIfUnpaid(field("lastName")),
        birthDate = maskIfUnpaid(field("birthDate")),
        gender = field("gender"),
        coverageName = coverage?.get("name")?.jsonPrimitive?.contentOrNull?.take(180)?.let(::maskIfUnpaid),
        // Always redact address (including paid results): confirmation of identity
        // is separate from a transaction/payment or a successful lookup.
        maskedAddress = RenaperPreviewPrivacy.maskAddress(field("address")),
        photoAvailable = data["photoAvailable"]?.jsonPrimitive?.booleanOrNull
            ?: form["photoAvailable"]?.jsonPrimitive?.booleanOrNull ?: false,
    )
}
