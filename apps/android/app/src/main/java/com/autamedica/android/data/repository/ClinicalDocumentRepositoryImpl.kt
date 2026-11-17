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

@Singleton
class ClinicalDocumentRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : ClinicalDocumentRepository {

    override suspend fun getDocuments(): Result<List<ClinicalDocument>> = runCatching {
        val userId = resolveAuthenticatedUserId()
        val patientId = resolvePatientId(userId)

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

        rows.mapNotNull { row ->
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
    }.onFailure {
        SecureLog.error("[ClinicalDocuments] Failed fetching documents", it)
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
        val timestamp = System.currentTimeMillis()
        val storagePath = "$userId/${timestamp}_$sanitizedFileName"

        val bytes = withContext(Dispatchers.IO) {
            inputStream.readBytes()
        }
        val fileSize = bytes.size.toLong()

        // The production bucket is private and its RLS path is scoped to auth.uid().
        supabaseClient.storage.from(DOCUMENT_BUCKET).upload(storagePath, bytes) {
            upsert = true
        }
        val bucketUsed = DOCUMENT_BUCKET
        val fileUrl = supabaseClient.storage.from(DOCUMENT_BUCKET)
            .createSignedUrl(storagePath, expiresIn = SIGNED_URL_TTL)

        val attachmentsPayload = buildJsonArray {
            add(
                buildJsonObject {
                    put("name", JsonPrimitive(sanitizedFileName))
                    put("file_name", JsonPrimitive(sanitizedFileName))
                    put("url", JsonPrimitive(fileUrl))
                    put("file_url", JsonPrimitive(fileUrl))
                    put("path", JsonPrimitive(storagePath))
                    put("bucket", JsonPrimitive(bucketUsed))
                    put("size", JsonPrimitive(fileSize))
                    put("file_size", JsonPrimitive(fileSize))
                    put("mime_type", JsonPrimitive(mimeType))
                    put("type", JsonPrimitive(mimeType))
                }
            )
        }

        val contentPayload = buildJsonObject {
            put("title", JsonPrimitive(title))
            put("file_url", JsonPrimitive(fileUrl))
            put("file_name", JsonPrimitive(sanitizedFileName))
            put("file_size", JsonPrimitive(fileSize))
            put("mime_type", JsonPrimitive(mimeType))
            put("bucket", JsonPrimitive(bucketUsed))
            put("storage_path", JsonPrimitive(storagePath))
            put("uploaded_by", JsonPrimitive("patient"))
            put("attachments", attachmentsPayload)
        }

        val nowIso = OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        // 2. Insert into medical_records
        val insertDto = CreateMedicalRecordDto(
            patientId = patientId,
            type = mapToValidRecordType(type),
            title = title,
            content = contentPayload,
            attachments = attachmentsPayload,
            visibility = "patient",
            createdAt = nowIso,
            updatedAt = nowIso,
        )

        val inserted = supabaseClient.postgrest
            .from("medical_records")
            .insert(insertDto) {
                select()
            }
            .decodeSingle<MedicalRecordRowDto>()

        ClinicalDocument(
            id = inserted.id,
            title = title,
            type = type,
            fileUrl = fileUrl,
            fileName = sanitizedFileName,
            fileSize = fileSize,
            dateRecorded = inserted.createdAt ?: nowIso,
            mimeType = mimeType,
        )
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

    private fun mapToValidRecordType(requestedType: String): String {
        return when (requestedType.lowercase()) {
            "lab_result", "laboratorio", "analisis" -> "lab_result"
            "imaging", "imagen", "imagenologia", "radiografia", "resonancia" -> "imaging"
            else -> "procedure"
        }
    }

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class CreateMedicalRecordDto(
        @SerialName("patient_id") val patientId: String,
        val type: String,
        val title: String,
        val content: JsonObject,
        val attachments: JsonArray? = null,
        val visibility: String = "patient",
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    )

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
