package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.ClinicalDocument
import com.autamedica.android.domain.repository.ClinicalDocumentRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.InputStream
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.time.Duration
import javax.inject.Inject
import javax.inject.Singleton

private const val DOCUMENT_BUCKET = "medical-documents"
private val SIGNED_URL_TTL = Duration.parse("3600s")
internal const val MAX_DOCUMENT_SIZE_BYTES = 25L * 1024L * 1024L
internal val ALLOWED_DOCUMENT_MIME_TYPES = setOf(
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
)

internal fun normalizeDocumentMimeType(mimeType: String, fileName: String): String {
    val raw = mimeType.trim().lowercase().substringBefore(';').trim()
    val inferred = when {
        raw == "image/jpg" -> "image/jpeg"
        raw in ALLOWED_DOCUMENT_MIME_TYPES -> raw
        raw.isBlank() || raw == "application/octet-stream" -> {
            val lowerName = fileName.trim().lowercase()
            when {
                lowerName.endsWith(".pdf") -> "application/pdf"
                lowerName.endsWith(".png") -> "image/png"
                lowerName.endsWith(".webp") -> "image/webp"
                lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") -> "image/jpeg"
                else -> raw
            }
        }
        else -> raw
    }
    require(inferred in ALLOWED_DOCUMENT_MIME_TYPES) {
        "Formato no compatible. Usá PDF, JPG, PNG o WEBP."
    }
    return inferred
}

internal fun mapToSubmissionDocumentType(requestedType: String): String {
    return when (requestedType.trim().lowercase()) {
        "lab_result", "laboratorio", "analisis" -> "lab_result"
        "imaging", "imagen", "imagenologia", "radiografia", "resonancia" -> "imaging"
        "prescription", "receta" -> "prescription"
        "report", "informe" -> "report"
        else -> "other"
    }
}

@Singleton
class ClinicalDocumentRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : ClinicalDocumentRepository {

    override suspend fun getDocuments(): Result<List<ClinicalDocument>> = runCatching {
        val userId = resolveAuthenticatedUserId()
        val patientId = resolvePatientId(userId)

        val submissionDocs = fetchPatientSubmissions(userId, patientId)
        val recordDocs = runCatching { fetchClinicianMedicalRecords(userId, patientId) }
            .getOrElse { emptyList() }

        (submissionDocs + recordDocs)
            .distinctBy { it.id }
            .sortedByDescending { it.dateRecorded }
    }.onFailure {
        SecureLog.error("[ClinicalDocuments] Failed fetching documents", it)
    }

    private suspend fun fetchPatientSubmissions(userId: String, patientId: String): List<ClinicalDocument> {
        val rows = supabaseClient.postgrest
            .from("patient_document_submissions")
            .select(Columns.ALL) {
                filter {
                    eq("patient_id", patientId)
                    exact("deleted_at", null)
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<PatientDocumentSubmissionRowDto>()

        return rows.map { row ->
            val signedUrl = row.storagePath
                .takeIf { it.startsWith("$userId/") }
                ?.let { path ->
                    runCatching {
                        supabaseClient.storage.from(row.storageBucket)
                            .createSignedUrl(path, expiresIn = SIGNED_URL_TTL)
                    }.getOrNull()
                }
                .orEmpty()
            row.toDomain(signedUrl)
        }
    }

    private suspend fun fetchClinicianMedicalRecords(userId: String, patientId: String): List<ClinicalDocument> {
        val rows = supabaseClient.postgrest
            .from("medical_records")
            .select(Columns.ALL) {
                filter {
                    eq("patient_id", patientId)
                    exact("deleted_at", null)
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<MedicalRecordRowDto>()

        return rows.mapNotNull { row ->
            val document = row.toDomain() ?: return@mapNotNull null
            // Never return a persisted public/expired URL. Re-sign only an object
            // whose path is scoped to the authenticated owner in the private bucket.
            val storagePath = row.storagePath()
                ?.takeIf { it.startsWith("$userId/") }
                ?: return@mapNotNull document.copy(fileUrl = "")
            val signedUrl = supabaseClient.storage.from(DOCUMENT_BUCKET)
                .createSignedUrl(storagePath, expiresIn = SIGNED_URL_TTL)
            document.copy(fileUrl = signedUrl)
        }
    }

    override suspend fun uploadDocument(
        title: String,
        type: String,
        fileName: String,
        mimeType: String,
        inputStream: InputStream,
    ): Result<ClinicalDocument> = runCatching {
        val userId = resolveAuthenticatedUserId()
        val patientId = resolvePatientId(userId)
        val sanitizedFileName = fileName.trim().replace("\\s+".toRegex(), "_")
            .ifBlank { "estudio_${System.currentTimeMillis()}" }
            .take(255)
        val normalizedMimeType = normalizeDocumentMimeType(mimeType, sanitizedFileName)
        val timestamp = System.currentTimeMillis()
        val storagePath = "$userId/${timestamp}_$sanitizedFileName"

        val bytes = withContext(Dispatchers.IO) {
            inputStream.readBytes()
        }
        val fileSize = bytes.size.toLong()
        require(fileSize > 0L) { "El archivo seleccionado está vacío." }
        require(fileSize <= MAX_DOCUMENT_SIZE_BYTES) {
            "El archivo supera el límite máximo permitido (25 MB)."
        }

        // The production bucket is private and its RLS path is scoped to auth.uid().
        supabaseClient.storage.from(DOCUMENT_BUCKET).upload(storagePath, bytes) {
            upsert = true
        }

        try {
            val normalizedTitle = title.trim().ifBlank { sanitizedFileName }.take(200)
            val insertDto = CreatePatientDocumentSubmissionDto(
                patientId = patientId,
                uploadedByUserId = userId,
                title = normalizedTitle,
                documentType = mapToSubmissionDocumentType(type),
                storageBucket = DOCUMENT_BUCKET,
                storagePath = storagePath,
                fileName = sanitizedFileName,
                mimeType = normalizedMimeType,
                fileSizeBytes = fileSize,
            )

            val inserted = supabaseClient.postgrest
                .from("patient_document_submissions")
                .insert(insertDto) {
                    select()
                }
                .decodeSingle<PatientDocumentSubmissionRowDto>()

            val fileUrl = supabaseClient.storage.from(DOCUMENT_BUCKET)
                .createSignedUrl(storagePath, expiresIn = SIGNED_URL_TTL)

            inserted.toDomain(fileUrl)
        } catch (e: Throwable) {
            runCatching { supabaseClient.storage.from(DOCUMENT_BUCKET).delete(storagePath) }
            throw e
        }
    }.onFailure {
        SecureLog.error("[ClinicalDocuments] Failed uploading document", it)
    }

    private suspend fun resolveAuthenticatedUserId(): String =
        securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("No authenticated user ID found")

    private suspend fun resolvePatientId(userId: String? = null): String {
        val authenticatedUserId = userId ?: resolveAuthenticatedUserId()
        return supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id")) {
                filter { eq("user_id", authenticatedUserId) }
            }
            .decodeSingleOrNull<RecordIdDto>()
            ?.id
            ?: throw IllegalStateException("No patient profile found for authenticated user")
    }

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class CreatePatientDocumentSubmissionDto(
        @SerialName("patient_id") val patientId: String,
        @SerialName("uploaded_by_user_id") val uploadedByUserId: String,
        val title: String,
        @SerialName("document_type") val documentType: String,
        @SerialName("storage_bucket") val storageBucket: String = DOCUMENT_BUCKET,
        @SerialName("storage_path") val storagePath: String,
        @SerialName("file_name") val fileName: String,
        @SerialName("mime_type") val mimeType: String,
        @SerialName("file_size_bytes") val fileSizeBytes: Long,
    )

    @Serializable
    private data class PatientDocumentSubmissionRowDto(
        val id: String,
        @SerialName("patient_id") val patientId: String? = null,
        val title: String = "",
        @SerialName("document_type") val documentType: String = "other",
        @SerialName("storage_bucket") val storageBucket: String = DOCUMENT_BUCKET,
        @SerialName("storage_path") val storagePath: String = "",
        @SerialName("file_name") val fileName: String = "documento.pdf",
        @SerialName("mime_type") val mimeType: String = "application/pdf",
        @SerialName("file_size_bytes") val fileSizeBytes: Long = 0L,
        @SerialName("created_at") val createdAt: String? = null,
    ) {
        fun toDomain(signedUrl: String): ClinicalDocument = ClinicalDocument(
            id = id,
            title = title.ifBlank { fileName },
            type = documentType,
            fileUrl = signedUrl,
            fileName = fileName,
            fileSize = fileSizeBytes,
            dateRecorded = createdAt.orEmpty(),
            mimeType = mimeType,
        )
    }

    @Serializable
    private data class MedicalRecordRowDto(
        val id: String,
        @SerialName("patient_id") val patientId: String? = null,
        val type: String = "document",
        val title: String = "",
        val content: JsonElement? = null,
        val attachments: JsonElement? = null,
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    ) {
        fun storagePath(): String? {
            val contentObj = content as? JsonObject
            val attachmentsArr = attachments as? JsonArray
                ?: contentObj?.get("attachments") as? JsonArray
            val firstAttachment = attachmentsArr?.firstOrNull() as? JsonObject
            return firstAttachment?.get("path")?.jsonPrimitive?.contentOrNull
                ?: contentObj?.get("storage_path")?.jsonPrimitive?.contentOrNull
        }

        fun toDomain(): ClinicalDocument? {
            val contentObj = content as? JsonObject
            val attachmentsArr = attachments as? JsonArray
                ?: contentObj?.get("attachments") as? JsonArray

            val firstAttachment = attachmentsArr?.firstOrNull() as? JsonObject

            val extractedUrl = firstAttachment?.get("url")?.jsonPrimitive?.contentOrNull
                ?: firstAttachment?.get("file_url")?.jsonPrimitive?.contentOrNull
                ?: contentObj?.get("file_url")?.jsonPrimitive?.contentOrNull
                ?: contentObj?.get("url")?.jsonPrimitive?.contentOrNull

            // If there's no attachment or URL associated, this is a plain consultation note, skip
            if (extractedUrl.isNullOrBlank()) {
                // If it's explicitly lab_result or imaging, still create an entry so user sees it
                if (type == "lab_result" || type == "imaging") {
                    return ClinicalDocument(
                        id = id,
                        title = title.ifBlank { "Estudio Clínico" },
                        type = type,
                        fileUrl = "",
                        fileName = "estudio.pdf",
                        fileSize = 0L,
                        dateRecorded = createdAt ?: "",
                        mimeType = "application/pdf",
                    )
                }
                return null
            }

            val extractedName = firstAttachment?.get("file_name")?.jsonPrimitive?.contentOrNull
                ?: firstAttachment?.get("name")?.jsonPrimitive?.contentOrNull
                ?: contentObj?.get("file_name")?.jsonPrimitive?.contentOrNull
                ?: title.ifBlank { "documento.pdf" }

            val extractedSize = firstAttachment?.get("file_size")?.jsonPrimitive?.longOrNull
                ?: firstAttachment?.get("size")?.jsonPrimitive?.longOrNull
                ?: contentObj?.get("file_size")?.jsonPrimitive?.longOrNull ?: 0L

            val extractedMime = firstAttachment?.get("mime_type")?.jsonPrimitive?.contentOrNull
                ?: firstAttachment?.get("type")?.jsonPrimitive?.contentOrNull
                ?: contentObj?.get("mime_type")?.jsonPrimitive?.contentOrNull
                ?: if (extractedName.endsWith(".pdf", ignoreCase = true)) "application/pdf" else "image/jpeg"

            return ClinicalDocument(
                id = id,
                title = title.ifBlank { extractedName },
                type = type,
                fileUrl = extractedUrl,
                fileName = extractedName,
                fileSize = extractedSize,
                dateRecorded = createdAt ?: "",
                mimeType = extractedMime,
            )
        }
    }
}
