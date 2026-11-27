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
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AutaMedica Brazil only. Server rechecks role, physician, CFM, encounter,
 * patient identity and LGPD before returning a link. No tokens in browser URL.
 */
@Singleton
class MemedMobileBridgeRepository @Inject constructor(private val client: SupabaseClient) {
    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    suspend fun createLaunch(appointmentId: String): Result<String> =
        createLaunchForEncounter("appointmentId", appointmentId)

    suspend fun createLaunchForDispatch(requestId: String): Result<String> =
        createLaunchForEncounter("requestId", requestId)

    suspend fun createLaunchForPatient(patientId: String): Result<String> =
        createLaunchForEncounter("patientId", patientId)

    fun currentSessionTokens(): Pair<String, String>? {
        val session = client.auth.currentSessionOrNull() ?: return null
        return session.accessToken to session.refreshToken
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
            .select(Columns.list(
                "id", "doctor_id", "patient_id", "status", "clinical_data",
            )) {
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

    private suspend fun createLaunchForEncounter(key: String, encounterId: String): Result<String> = runCatching {
        require(MemedMobileLaunchUrl.isUuid(encounterId)) { "Consulta inválida" }
        val accessToken = client.auth.currentSessionOrNull()?.accessToken
            ?: error("Sessão autenticada necessária para abrir a Memed")
        val payload = buildJsonObject { put(key, encounterId) }
        val endpoint = BuildConfig.SUPABASE_URL.trimEnd('/') + "/functions/v1/memed-mobile-preflight"
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
                "MEMED_MOBILE_DISABLED" -> "Memed indisponível neste ambiente no momento."
                "PILOT_DOCTOR_REQUIRED" -> "Seu perfil médico ainda não está habilitado para a Memed."
                "CFM_LICENSE_NOT_VERIFIED" -> "Sua matrícula CRM/CFM precisa estar validada para usar a Memed."
                "DOCTOR_PATIENT_ACCESS_REQUIRED" -> "Sem vínculo clínico ativo com este paciente."
                "CLINICAL_ENCOUNTER_REQUIRED" -> "Atendimento clínico inválido ou sem permissão para emitir receita."
                "BRAZIL_PATIENT_CONSENT_REQUIRED" -> "Paciente precisa aceitar o termo LGPD Brasil antes de usar a Memed."
                "PATIENT_IDENTITY_INCOMPLETE" -> "Cadastro do paciente incompleto (CPF ou data de nascimento ausente)."
                "PATIENT_ACCOUNT_INACTIVE" -> "Conta do paciente inativa."
                "DOCTOR_REQUIRED" -> "Conta médica ativa necessária para acessar a Memed."
                else -> errMsg ?: errCode ?: "Memed indisponível (HTTP $httpCode)"
            }
            error(friendly)
        }
        val result = json.decodeFromString<MemedMobilePreflightResponse>(responseText)
        check(result.success && result.provider == "memed" &&
            result.country == "BR" && result.requiresBrowserSignIn) {
            "Resposta Memed não autorizada"
        }
        MemedMobileLaunchUrl.validate(result.launchUrl, encounterId, key)
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
    fun isUuid(value: String): Boolean = uuid.matches(value)

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
        require(uri.scheme == "https" && uri.host == "doctor.autamedica.com" &&
            uri.port == -1 && uri.rawUserInfo == null && uri.fragment == null &&
            uri.path == "/doctors/prescriptions/memed-mobile") {
            "Destino Memed não autorizado"
        }
        require(uri.rawQuery == "$queryKey=$expectedEncounterId") {
            "Consulta Memed não corresponde à consulta atual"
        }
        return uri.toASCIIString()
    }
}
