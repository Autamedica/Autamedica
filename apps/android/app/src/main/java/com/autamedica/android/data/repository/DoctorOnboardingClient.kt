package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

data class DoctorOnboardingSubmission(
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val careCountry: String,
    val licenseType: String,
    val licenseNumber: String,
    val specialty: String,
    val ufBrazil: String? = null,
    val enrollmentJurisdiction: String? = null,
    val cpf: String? = null,
)

class DoctorOnboardingException(
    val httpStatus: Int,
    val errorCode: String? = null,
) : IOException("Doctor onboarding failed ($httpStatus${errorCode?.let { ": $it" }.orEmpty()})")

internal val BRAZIL_UFS = listOf(
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)

internal fun validateDoctorOnboardingSubmission(submission: DoctorOnboardingSubmission): DoctorOnboardingSubmission {
    val firstName = submission.firstName.trim()
    val lastName = submission.lastName.trim()
    val phone = submission.phone?.trim()?.takeIf { it.isNotBlank() }
    val careCountry = submission.careCountry.trim().uppercase()
    val licenseType = submission.licenseType.trim().uppercase()
    val licenseNumber = submission.licenseNumber.trim()
    val specialty = submission.specialty.trim()
    val ufBrazil = submission.ufBrazil?.trim()?.uppercase()?.takeIf { it.isNotBlank() }
    val jurisdiction = submission.enrollmentJurisdiction?.trim()?.takeIf { it.isNotBlank() }
    val cpf = submission.cpf?.filter { it.isDigit() }?.takeIf { it.isNotBlank() }

    require(firstName.isNotBlank()) { "El nombre es obligatorio" }
    require(lastName.isNotBlank()) { "El apellido es obligatorio" }
    require(specialty.isNotBlank()) { "La especialidad es obligatoria" }
    require(licenseNumber.isNotBlank()) { "La matrícula es obligatoria" }
    require(!Regex("^PENDING(-|$)", RegexOption.IGNORE_CASE).containsMatchIn(licenseNumber)) {
        "Ingresá una matrícula profesional válida"
    }
    require(careCountry == "AR" || careCountry == "BR") { "País de atención inválido" }

    if (careCountry == "BR") {
        require(licenseType == "CRM") { "Brasil requiere matrícula CRM" }
        require(ufBrazil != null && ufBrazil in BRAZIL_UFS) { "Seleccioná la UF del CRM" }
    } else {
        require(licenseType == "MN" || licenseType == "MP") { "Argentina requiere matrícula MN o MP" }
    }

    return DoctorOnboardingSubmission(
        firstName = firstName,
        lastName = lastName,
        phone = phone,
        careCountry = careCountry,
        licenseType = licenseType,
        licenseNumber = licenseNumber,
        specialty = specialty,
        ufBrazil = if (careCountry == "BR") ufBrazil else null,
        enrollmentJurisdiction = if (careCountry == "AR") jurisdiction else null,
        cpf = if (careCountry == "BR") cpf else null,
    )
}

internal fun buildDoctorProfilePayload(normalized: DoctorOnboardingSubmission): JsonObject {
    return buildJsonObject {
        put("first_name", normalized.firstName)
        put("last_name", normalized.lastName)
        normalized.phone?.let { put("phone", it) }
        put("care_country", normalized.careCountry)
        put("license_type", normalized.licenseType)
        put("license_number", normalized.licenseNumber)
        put("specialty", normalized.specialty)
        if (normalized.careCountry == "BR") {
            normalized.ufBrazil?.let { put("uf_brazil", it) }
            normalized.cpf?.let { put("cpf", it) }
        } else {
            normalized.enrollmentJurisdiction?.let { put("enrollment_jurisdiction", it) }
        }
    }
}

internal fun buildOnboardingCompletePayload(normalized: DoctorOnboardingSubmission): JsonObject {
    return buildJsonObject {
        put("first_name", normalized.firstName)
        put("last_name", normalized.lastName)
    }
}

/**
 * Authenticated Android client for Doctor onboarding (`POST /api/profiles/doctors` +
 * `POST /api/doctors/onboarding-complete`).
 *
 * Strips HTTP body logging and disables redirects so Bearer tokens, credentials,
 * and CPF values are never leaked into logs or across hosts.
 */
@Singleton
open class DoctorOnboardingClient @Inject constructor(
    private val supabaseClient: SupabaseClient,
    sharedHttp: OkHttpClient,
    private val json: Json,
) {
    private val privateHttp = sharedHttp.newBuilder().apply {
        interceptors().removeAll { it is HttpLoggingInterceptor }
        networkInterceptors().removeAll { it is HttpLoggingInterceptor }
        cache(null)
        followRedirects(false)
        followSslRedirects(false)
    }.build()

    open suspend fun submitOnboarding(submission: DoctorOnboardingSubmission): Result<String> = runCatching {
        val origin = BuildConfig.WEB_API_URL.trimEnd('/')
        val parsed = URI(origin)
        require(
            parsed.scheme == "https" &&
                !parsed.host.isNullOrBlank() &&
                parsed.userInfo == null,
        ) { "Invalid AutaMedica Web API origin" }

        supabaseClient.auth.awaitInitialization()
        val session = supabaseClient.auth.currentSessionOrNull()
            ?: throw DoctorOnboardingException(401, "missing_session")
        requireNotNull(session.user?.id) { "Authenticated doctor required" }

        postOnboarding(origin = origin, submission = submission, bearer = session.accessToken)
    }

    /** Internal for MockWebServer regression tests. */
    internal suspend fun postOnboarding(
        origin: String,
        submission: DoctorOnboardingSubmission,
        bearer: String,
    ): String = withContext(Dispatchers.IO) {
        val normalized = validateDoctorOnboardingSubmission(submission)
        require(bearer.isNotBlank()) { "Authenticated doctor required" }

        val cleanOrigin = origin.trimEnd('/')
        val jsonMediaType = "application/json; charset=utf-8".toMediaType()

        val profileBody = buildDoctorProfilePayload(normalized).toString().toRequestBody(jsonMediaType)
        val profileRequest = Request.Builder()
            .url("$cleanOrigin/api/profiles/doctors")
            .header("Authorization", "Bearer $bearer")
            .header("Cache-Control", "no-store")
            .header("Accept", "application/json")
            .post(profileBody)
            .build()

        val doctorId = privateHttp.newCall(profileRequest).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw DoctorOnboardingException(response.code, parseErrorCode(raw, json))
            }
            parseProfileDoctorId(raw, json)
        }

        val completeBody = buildOnboardingCompletePayload(normalized).toString().toRequestBody(jsonMediaType)
        val completeRequest = Request.Builder()
            .url("$cleanOrigin/api/doctors/onboarding-complete")
            .header("Authorization", "Bearer $bearer")
            .header("Cache-Control", "no-store")
            .header("Accept", "application/json")
            .post(completeBody)
            .build()

        privateHttp.newCall(completeRequest).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw DoctorOnboardingException(response.code, parseErrorCode(raw, json))
            }
            parseCompleteResponse(raw, json)
        }

        doctorId
    }
}

internal fun parseProfileDoctorId(raw: String, json: Json = Json): String {
    val root = runCatching { json.parseToJsonElement(raw).jsonObject }
        .getOrElse { throw DoctorOnboardingException(502, "invalid_json") }
    if (root["success"]?.jsonPrimitive?.booleanOrNull != true) {
        throw DoctorOnboardingException(502, parseErrorCode(raw, json))
    }
    return root["data"]?.jsonObject?.get("id")?.jsonPrimitive?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: throw DoctorOnboardingException(502, "missing_doctor_id")
}

internal fun parseCompleteResponse(raw: String, json: Json = Json) {
    val root = runCatching { json.parseToJsonElement(raw).jsonObject }
        .getOrElse { throw DoctorOnboardingException(502, "invalid_json") }
    if (root["success"]?.jsonPrimitive?.booleanOrNull != true) {
        throw DoctorOnboardingException(502, parseErrorCode(raw, json))
    }
}

internal fun parseErrorCode(raw: String, json: Json = Json): String? {
    val root = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return null
    val errorVal = root["error"] ?: return null
    return runCatching { errorVal.jsonPrimitive.contentOrNull }.getOrNull()
        ?: runCatching { errorVal.jsonObject["code"]?.jsonPrimitive?.contentOrNull }.getOrNull()
}
