package com.autamedica.android.data.repository

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Internal, admin-only Prescri BR sandbox API.
 *
 * The provider API key/secret are strictly server-side Supabase Edge secrets.
 * Uses one immutable fictitious patient and one immutable idempotency key.
 * NEVER write these results into the clinical PrescriptionRepository.
 *
 * This adapter intentionally has no patient/doctor ID parameters or production mode.
 * The backend repeats all authorization and sandbox checks.
 */
@Singleton
class PrescriSandboxRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun createDemoDocument(): Result<PrescriDemoStatus> =
        requestStatus("create_demo")

    suspend fun getDemoStatus(): Result<PrescriDemoStatus> =
        requestStatus("get_demo")

    suspend fun getDocumentTypes(): Result<PrescriDemoDocumentTypes> = runCatching {
        val response = supabaseClient.functions(
            "prescri-br-sandbox",
            buildJsonObject { put("action", "document_types") },
        )
        check(response.status.value in 200..299) { "PRESCRI_SANDBOX_UNAVAILABLE" }
        json.decodeFromString<PrescriDemoDocumentTypes>(response.bodyAsText())
    }

    suspend fun downloadDemoPdf(): Result<ByteArray> = runCatching {
        val response = supabaseClient.functions(
            "prescri-br-sandbox",
            buildJsonObject { put("action", "download_demo_pdf") },
        )
        check(response.status.value in 200..299) { "PRESCRI_SANDBOX_PDF_NOT_READY" }
        val pdf = response.bodyAsBytes()
        check(pdf.size in 100..8_000_000 &&
            pdf.copyOfRange(0, 5).decodeToString() == "%PDF-") {
            "PRESCRI_SANDBOX_INVALID_PDF"
        }
        // Do not cache, mark as signed, or show as a clinical prescription.
        pdf
    }

    private suspend fun requestStatus(action: String): Result<PrescriDemoStatus> = runCatching {
        val response = supabaseClient.functions(
            "prescri-br-sandbox",
            buildJsonObject { put("action", action) },
        )
        check(response.status.value in 200..299) { "PRESCRI_SANDBOX_UNAVAILABLE" }
        val status = json.decodeFromString<PrescriDemoStatus>(response.bodyAsText())
        check(status.sandbox && !status.cryptographicallySigned && !status.legalValidity) {
            "PRESCRI_SANDBOX_ATTESTATION_MISSING"
        }
        status
    }
}

@Serializable
data class PrescriDemoStatus(
    val success: Boolean,
    @SerialName("signature_id") val signatureId: String,
    val status: String,
    val sandbox: Boolean,
    @SerialName("cryptographically_signed") val cryptographicallySigned: Boolean,
    @SerialName("legal_validity") val legalValidity: Boolean,
)

@Serializable
data class PrescriDemoDocumentTypes(
    val success: Boolean,
    val sandbox: Boolean,
    val types: List<PrescriDemoDocumentType> = emptyList(),
)

@Serializable
data class PrescriDemoDocumentType(
    val name: String,
    @SerialName("requires_sncr") val requiresSncr: Boolean,
)
