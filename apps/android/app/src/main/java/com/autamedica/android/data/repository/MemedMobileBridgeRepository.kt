package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

data class MemedMobileLaunchSession(
    val canonicalLaunchUrl: String,
    val exchangeUrl: String,
)

/**
 * AutaMedica Brazil only. Server rechecks role, physician, CFM, encounter,
 * patient identity and LGPD before issuing an ephemeral single-use handoff code.
 * No JWT, refresh token or Memed token is ever placed in browser URLs.
 */
@Singleton
class MemedMobileBridgeRepository internal constructor(
    private val client: SupabaseClient,
    private val httpClient: OkHttpClient,
    private val supabaseBaseUrl: String,
    private val portalBaseUrl: String,
) {
    @Inject
    constructor(client: SupabaseClient) : this(
        client = client,
        httpClient = defaultHttpClient(),
        supabaseBaseUrl = BuildConfig.SUPABASE_URL.trimEnd('/'),
        portalBaseUrl = DEFAULT_PORTAL_BASE_URL,
    )

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun createLaunch(appointmentId: String): Result<MemedMobileLaunchSession> =
        createLaunchForEncounter("appointmentId", appointmentId)

    suspend fun createLaunchForDispatch(requestId: String): Result<MemedMobileLaunchSession> =
        createLaunchForEncounter("requestId", requestId)

    suspend fun createLaunchForPatient(patientId: String): Result<MemedMobileLaunchSession> =
        createLaunchForEncounter("patientId", patientId)

    suspend fun createSessionExchangeForLaunchUrl(
        canonicalLaunchUrl: String,
        forceRefreshSession: Boolean = false,
    ): Result<String> = runCatching {
        val nextPath = MemedMobileLaunchUrl.extractCanonicalNextPath(canonicalLaunchUrl)
        if (forceRefreshSession || client.auth.currentSessionOrNull() == null) {
            runCatching { client.auth.refreshCurrentSession() }
        }

        val initialSession = client.auth.currentSessionOrNull()
            ?: error("Sessão autenticada necessária para emitir documentos digitais")
        val initialAccess = initialSession.accessToken.takeIf { it.isNotBlank() }
            ?: error("Sessão autenticada necessária para emitir documentos digitais")
        val initialRefresh = initialSession.refreshToken.takeIf { it.isNotBlank() }
            ?: error("Sessão autenticada necessária para emitir documentos digitais")

        var (httpCode, responseText) = postSessionExchange(
            accessToken = initialAccess,
            refreshToken = initialRefresh,
            nextPath = nextPath,
        )

        if (httpCode == 401 && !forceRefreshSession) {
            runCatching { client.auth.refreshCurrentSession() }
            val refreshedSession = client.auth.currentSessionOrNull()
            val refreshedAccess = refreshedSession?.accessToken?.takeIf { it.isNotBlank() }
            val refreshedRefresh = refreshedSession?.refreshToken?.takeIf { it.isNotBlank() }
            if (refreshedAccess != null && refreshedRefresh != null) {
                val retryResult = postSessionExchange(
                    accessToken = refreshedAccess,
                    refreshToken = refreshedRefresh,
                    nextPath = nextPath,
                )
                httpCode = retryResult.first
                responseText = retryResult.second
            }
        }

        if (httpCode !in 200..299) {
            val root = runCatching { json.parseToJsonElement(responseText) as? JsonObject }.getOrNull()
            val errorObj = root?.get("error") as? JsonObject
            val errMsg = errorObj?.get("message")?.jsonPrimitive?.contentOrNull
                ?: root?.get("message")?.jsonPrimitive?.contentOrNull
            val friendly = when (httpCode) {
                401 -> "Sessão expirada ao iniciar o emissor digital. Faça login novamente."
                403 -> "Perfil médico ou habilitação pendente para abrir o emissor digital."
                else -> errMsg ?: "Não foi possível iniciar a sessão no emissor digital (HTTP $httpCode)"
            }
            error(friendly)
        }

        val parsed = json.decodeFromString<MemedSessionExchangeEnvelope>(responseText)
        val exchangeData = parsed.data
        check(parsed.success && exchangeData != null) {
            "Resposta inválida do servidor de sessão Memed"
        }
        MemedMobileLaunchUrl.validateExchangeUrl(
            raw = exchangeData.exchangeUrl,
            expectedNextPath = nextPath,
            expectedOrigin = portalBaseUrl,
        )
    }

    /**
     * Confirms a Jordan pharmacy prescription only after the Memed event has
     * been verified server-side and persisted against this exact dispatch.
     * The row may remain a draft: provider verification is not PDF-signature
     * verification or proof of patient delivery.
     */
    suspend fun findVerifiedDispatchPrescription(
        requestId: String,
        patientId: String,
        doctorId: String,
    ): Result<MemedDispatchPrescriptionConfirmation?> = runCatching {
        require(MemedMobileLaunchUrl.isUuid(requestId)) { "Solicitud de farmacia inválida" }
        require(MemedMobileLaunchUrl.isUuid(patientId)) { "Paciente inválido" }
        require(MemedMobileLaunchUrl.isUuid(doctorId)) { "Médico inválido" }

        val rows = client.postgrest
            .from("prescriptions")
            .select(
                Columns.list(
                    "id",
                    "doctor_id",
                    "patient_id",
                    "status",
                    "clinical_data",
                ),
            ) {
                filter {
                    eq("doctor_id", doctorId)
                    eq("patient_id", patientId)
                    eq("country_code", "BR")
                    eq("vendor_name", "memed")
                }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList<MemedDispatchPrescriptionRowDto>()

        rows.firstNotNullOfOrNull { row ->
            val clinical = row.clinicalData ?: return@firstNotNullOfOrNull null
            val evidence = MemedDispatchIssuanceEvidence(
                source = clinical["source"]?.jsonPrimitive?.contentOrNull,
                dispatchRequestId = clinical["dispatch_request_id"]?.jsonPrimitive?.contentOrNull,
                providerPrescriptionId = clinical["memed_prescription_id"]?.jsonPrimitive?.contentOrNull,
                emissionStatus = clinical["emission_status"]?.jsonPrimitive?.contentOrNull,
                providerVerifiedAt = clinical["provider_verified_at"]?.jsonPrimitive?.contentOrNull,
                prescriptionStatus = row.status,
            )
            if (MemedDispatchIssuancePolicy.confirms(requestId, evidence)) {
                MemedDispatchPrescriptionConfirmation(
                    prescriptionId = row.id,
                    providerPrescriptionId = evidence.providerPrescriptionId.orEmpty(),
                    providerVerifiedAt = evidence.providerVerifiedAt.orEmpty(),
                )
            } else {
                null
            }
        }
    }

    private suspend fun createLaunchForEncounter(
        key: String,
        encounterId: String,
    ): Result<MemedMobileLaunchSession> = runCatching {
        require(MemedMobileLaunchUrl.isUuid(encounterId)) { "Consulta inválida" }
        val accessToken = client.auth.currentSessionOrNull()?.accessToken?.takeIf { it.isNotBlank() }
            ?: error("Sessão autenticada necessária para emitir documentos digitais")
        val payload = buildJsonObject { put(key, encounterId) }
        val endpoint = "$supabaseBaseUrl/functions/v1/memed-mobile-preflight"
        val (httpCode, responseText) = withContext(Dispatchers.IO) {
            val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val httpRequest = Request.Builder()
                .url(endpoint)
                .header("Authorization", "Bearer $accessToken")
                .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .header("Accept", "application/json")
                .post(body)
                .build()
            httpClient.newCall(httpRequest).execute().use { resp ->
                resp.code to resp.body?.string().orEmpty()
            }
        }
        if (httpCode !in 200..299) {
            val root = runCatching { json.parseToJsonElement(responseText) as? JsonObject }.getOrNull()
            val errCode = root?.get("code")?.jsonPrimitive?.contentOrNull
            val errMsg = root?.get("message")?.jsonPrimitive?.contentOrNull
                ?: root?.get("error")?.jsonPrimitive?.contentOrNull
            val friendly = when (errCode) {
                "MEMED_MOBILE_DISABLED" -> "Emissor digital indisponível neste momento."
                "PILOT_DOCTOR_REQUIRED" -> "Seu perfil médico ainda não está habilitado para emissão digital."
                "CFM_LICENSE_NOT_VERIFIED" -> "Sua matrícula CRM/CFM precisa estar validada para emitir documentos."
                "DOCTOR_PATIENT_ACCESS_REQUIRED" -> "Sem vínculo clínico ativo com este paciente."
                "CLINICAL_ENCOUNTER_REQUIRED" -> "Atendimento clínico inválido ou sem permissão para emitir receita."
                "BRAZIL_PATIENT_CONSENT_REQUIRED" -> "Paciente precisa aceitar o termo LGPD antes da emissão."
                "PATIENT_IDENTITY_INCOMPLETE" -> "Cadastro do paciente incompleto (CPF ou data de nascimento ausente)."
                "PATIENT_ACCOUNT_INACTIVE" -> "Conta do paciente inativa."
                "DOCTOR_REQUIRED" -> "Conta médica ativa necessária para emitir documentos."
                else -> errMsg ?: errCode ?: "Emissor digital indisponível (HTTP $httpCode)"
            }
            error(friendly)
        }
        val result = json.decodeFromString<MemedMobilePreflightResponse>(responseText)
        check(
            result.success &&
                result.provider == "memed" &&
                result.country == "BR" &&
                result.requiresBrowserSignIn,
        ) {
            "Resposta do emissor digital não autorizada"
        }
        val canonicalLaunchUrl = MemedMobileLaunchUrl.validate(result.launchUrl, encounterId, key)
        val exchangeUrl = createSessionExchangeForLaunchUrl(canonicalLaunchUrl).getOrThrow()
        MemedMobileLaunchSession(
            canonicalLaunchUrl = canonicalLaunchUrl,
            exchangeUrl = exchangeUrl,
        )
    }

    private suspend fun postSessionExchange(
        accessToken: String,
        refreshToken: String,
        nextPath: String,
    ): Pair<Int, String> = withContext(Dispatchers.IO) {
        val endpoint = "${portalBaseUrl.trimEnd('/')}$SESSION_EXCHANGE_PATH"
        val payload = buildJsonObject {
            put("refreshToken", refreshToken)
            put("next", nextPath)
        }
        val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val httpRequest = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $accessToken")
            .header("Accept", "application/json")
            .header("User-Agent", "AutaMedica-Android/1.0")
            .post(body)
            .build()
        httpClient.newCall(httpRequest).execute().use { resp ->
            resp.code to resp.body?.string().orEmpty()
        }
    }

    private companion object {
        private const val DEFAULT_PORTAL_BASE_URL = "https://doctor.autamedica.com"
        private const val SESSION_EXCHANGE_PATH = "/api/doctors/memed-mobile/session-exchange"

        private fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}

@Serializable
data class MemedMobilePreflightResponse(
    val success: Boolean,
    val launchUrl: String,
    val requiresBrowserSignIn: Boolean,
    val provider: String,
    val country: String,
)

@Serializable
private data class MemedSessionExchangeEnvelope(
    val success: Boolean,
    val data: MemedSessionExchangeData? = null,
)

@Serializable
private data class MemedSessionExchangeData(
    val code: String,
    val exchangeUrl: String,
    val expiresInSeconds: Int = 45,
)

@Serializable
private data class MemedDispatchPrescriptionRowDto(
    val id: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("status") val status: String,
    @SerialName("clinical_data") val clinicalData: JsonObject? = null,
)

data class MemedDispatchPrescriptionConfirmation(
    val prescriptionId: String,
    val providerPrescriptionId: String,
    val providerVerifiedAt: String,
)

data class MemedDispatchIssuanceEvidence(
    val source: String?,
    val dispatchRequestId: String?,
    val providerPrescriptionId: String?,
    val emissionStatus: String?,
    val providerVerifiedAt: String?,
    val prescriptionStatus: String?,
)

object MemedDispatchIssuancePolicy {
    fun confirms(requestId: String, evidence: MemedDispatchIssuanceEvidence): Boolean =
        MemedMobileLaunchUrl.isUuid(requestId) &&
            evidence.dispatchRequestId == requestId &&
            evidence.source == "memed" &&
            !evidence.providerPrescriptionId.isNullOrBlank() &&
            evidence.emissionStatus == "provider_verified" &&
            !evidence.providerVerifiedAt.isNullOrBlank() &&
            !evidence.prescriptionStatus.equals("cancelled", ignoreCase = true)
}

data class MemedEncounterTarget(
    val queryKey: String,
    val encounterId: String,
)

/** A pharmacy dispatch remains the authoritative encounter when both IDs are present. */
object MemedEncounterTargetResolver {
    fun resolve(appointmentId: String, dispatchRequestId: String?): MemedEncounterTarget? {
        val dispatch = dispatchRequestId?.takeIf { it.isNotBlank() }
        if (dispatch != null) {
            return if (MemedMobileLaunchUrl.isUuid(dispatch)) {
                MemedEncounterTarget("requestId", dispatch)
            } else {
                null
            }
        }
        val appointment = appointmentId.takeIf { it.isNotBlank() } ?: return null
        return if (MemedMobileLaunchUrl.isUuid(appointment)) {
            MemedEncounterTarget("appointmentId", appointment)
        } else {
            null
        }
    }
}

/** Appointment ID is a lookup handle only, never an authorization credential. */
object MemedMobileLaunchUrl {
    private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val opaqueCode = Regex("^[A-Za-z0-9_-]{32,128}$")
    private val forbiddenSecretTokens = listOf("access_token", "refresh_token", "jwt=", "eyJ")

    const val TARGET_PATH = "/doctors/prescriptions/memed-mobile"
    const val EXCHANGE_PATH = "/api/doctors/memed-mobile/session-exchange"
    const val DEFAULT_ORIGIN = "https://doctor.autamedica.com"

    fun isUuid(value: String): Boolean = uuid.matches(value)

    fun isOpaqueHandoffCode(code: String): Boolean =
        opaqueCode.matches(code) && !code.contains('.')

    fun resolveEncounterTarget(
        appointmentId: String,
        dispatchRequestId: String?,
    ): MemedEncounterTarget? = MemedEncounterTargetResolver.resolve(appointmentId, dispatchRequestId)

    fun validate(raw: String, expectedAppointmentId: String): String =
        validate(raw, expectedAppointmentId, "appointmentId")

    fun validate(raw: String, expectedEncounterId: String, queryKey: String): String {
        require(queryKey == "appointmentId" || queryKey == "requestId" || queryKey == "patientId") { "Consulta inválida" }
        require(isUuid(expectedEncounterId)) { "Consulta inválida" }
        require(raw.length < 512) { "Endereço Memed inválido" }
        val uri = URI(raw)
        require(
            uri.scheme == "https" &&
                uri.host == "doctor.autamedica.com" &&
                uri.port == -1 &&
                uri.rawUserInfo == null &&
                uri.fragment == null &&
                uri.path == TARGET_PATH,
        ) {
            "Destino Memed não autorizado"
        }
        require(uri.rawQuery == "$queryKey=$expectedEncounterId") {
            "Consulta Memed não corresponde à consulta atual"
        }
        return uri.toASCIIString()
    }

    fun extractCanonicalNextPath(rawLaunchUrl: String): String {
        require(rawLaunchUrl.length < 512) { "Endereço Memed inválido" }
        val uri = URI(rawLaunchUrl)
        require(
            uri.scheme == "https" &&
                uri.host == "doctor.autamedica.com" &&
                uri.port == -1 &&
                uri.rawUserInfo == null &&
                uri.fragment == null &&
                uri.path == TARGET_PATH,
        ) {
            "Destino Memed não autorizado"
        }
        val query = uri.rawQuery ?: error("Destino Memed inválido")
        val parts = query.split('=')
        require(parts.size == 2) { "Destino Memed inválido" }
        val key = parts[0]
        val value = parts[1]
        validate(rawLaunchUrl, value, key)
        return "$TARGET_PATH?$key=$value"
    }

    fun buildExchangeUrl(
        code: String,
        nextPath: String,
        baseOrigin: String = DEFAULT_ORIGIN,
    ): String {
        require(isOpaqueHandoffCode(code)) { "Código de handoff inválido" }
        val canonicalNext = extractCanonicalNextPath("$DEFAULT_ORIGIN$nextPath")
        val originUri = URI(baseOrigin.trimEnd('/'))
        require(
            (originUri.scheme == "https" || originUri.scheme == "http") &&
                !originUri.host.isNullOrBlank() &&
                originUri.rawUserInfo == null,
        ) {
            "Origem de handoff inválida"
        }
        val encodedCode = URLEncoder.encode(code, Charsets.UTF_8.name())
        val encodedNext = URLEncoder.encode(canonicalNext, Charsets.UTF_8.name())
        val built = "${baseOrigin.trimEnd('/')}$EXCHANGE_PATH?code=$encodedCode&next=$encodedNext"
        return validateExchangeUrl(built, canonicalNext, baseOrigin)
    }

    fun validateExchangeUrl(
        raw: String,
        expectedNextPath: String,
        expectedOrigin: String = DEFAULT_ORIGIN,
    ): String {
        require(raw.length in 1..1024) { "URL de handoff inválida" }
        require(forbiddenSecretTokens.none { raw.contains(it, ignoreCase = false) }) {
            "URL de handoff contém credencial proibida"
        }
        val expectedOriginUri = URI(expectedOrigin.trimEnd('/'))
        val uri = URI(raw)
        require(
            uri.scheme == expectedOriginUri.scheme &&
                uri.host == expectedOriginUri.host &&
                uri.port == expectedOriginUri.port &&
                uri.rawUserInfo == null &&
                uri.fragment == null &&
                uri.path == EXCHANGE_PATH,
        ) {
            "Destino de exchange Memed não autorizado"
        }
        val rawQuery = uri.rawQuery ?: error("Parâmetros de exchange ausentes")
        val params = rawQuery.split('&').associate { pair ->
            val idx = pair.indexOf('=')
            require(idx > 0) { "Parâmetro de exchange inválido" }
            val k = URLDecoder.decode(pair.substring(0, idx), Charsets.UTF_8.name())
            val v = URLDecoder.decode(pair.substring(idx + 1), Charsets.UTF_8.name())
            k to v
        }
        require(params.size == 2 && params.keys == setOf("code", "next")) {
            "Parâmetros de exchange não autorizados"
        }
        val code = params["code"].orEmpty()
        val next = params["next"].orEmpty()
        require(isOpaqueHandoffCode(code)) { "Código de exchange inválido" }
        require(next == expectedNextPath) { "Destino de exchange divergente" }
        extractCanonicalNextPath("$DEFAULT_ORIGIN$next")
        return uri.toASCIIString()
    }
}
