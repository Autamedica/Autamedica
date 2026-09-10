package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.data.remote.dto.AppointmentFollowupDto
import com.autamedica.android.data.remote.dto.toDomain
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupStatus
import com.autamedica.android.domain.repository.FollowupRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FollowupRepositoryImpl @Inject constructor(
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : FollowupRepository {

    override suspend fun getActiveFollowupsForPatient(patientId: String): Result<List<AppointmentFollowup>> =
        withContext(ioDispatcher) {
            runCatching {
                val resolvedPatientId = resolvePatientId(patientId)
                val dtos = supabaseClient.postgrest["appointment_followups"]
                    .select(Columns.ALL) {
                        filter {
                            eq("patient_id", resolvedPatientId)
                            neq("status", "cancelled")
                        }
                        order("scheduled_for", Order.DESCENDING)
                    }
                    .decodeList<AppointmentFollowupDto>()

                dtos.map { it.toDomain() }
            }.onFailure {
                SecureLog.error("[FollowupRepository] Failed getting active followups for patient $patientId", it)
            }
        }

    override suspend fun getPendingCheckIn(patientId: String): Result<AppointmentFollowup?> =
        withContext(ioDispatcher) {
            runCatching {
                val resolvedPatientId = resolvePatientId(patientId)
                val dtos = supabaseClient.postgrest["appointment_followups"]
                    .select(Columns.ALL) {
                        filter {
                            eq("patient_id", resolvedPatientId)
                            isIn("status", listOf("sent", "pending"))
                        }
                        order("scheduled_for", Order.DESCENDING)
                    }
                    .decodeList<AppointmentFollowupDto>()

                val domainList = dtos.map { it.toDomain() }
                domainList.firstOrNull { followup ->
                    followup.status != FollowupStatus.RESPONDED && followup.response == null
                }
            }.onFailure {
                SecureLog.error("[FollowupRepository] Failed getting pending check-in for patient $patientId", it)
            }
        }

    override suspend fun submitCheckIn(
        followupId: String,
        evolution: String,
        notes: String?,
    ): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            require(followupId.isNotBlank()) { "Followup ID must not be blank" }
            require(evolution.isNotBlank()) { "Evolution must not be blank" }

            val now = OffsetDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

            // Fetch existing metadata to preserve fields (lang, roomId, etc.)
            val existingRow = try {
                supabaseClient.postgrest["appointment_followups"]
                    .select(Columns.list("id", "metadata", "status")) {
                        filter { eq("id", followupId) }
                    }
                    .decodeSingleOrNull<FollowupMetadataDto>()
            } catch (e: Exception) {
                SecureLog.warn("[FollowupRepository] Could not fetch existing metadata for followup $followupId: ${e.message}")
                null
            }

            val updatedMetadata = buildJsonObject {
                (existingRow?.metadata as? JsonObject)?.forEach { (key, value) ->
                    put(key, value)
                }
                put("evolution", JsonPrimitive(evolution.lowercase().trim()))
                put("response", JsonPrimitive(evolution.lowercase().trim()))
                put("responded_at", JsonPrimitive(now))
                if (!notes.isNullOrBlank()) {
                    put("notes", JsonPrimitive(notes.trim()))
                }
            }

            // Attempt to update with status = "responded", fallback to metadata only if DB status constraint rejects "responded"
            try {
                supabaseClient.postgrest["appointment_followups"].update(
                    UpdateFollowupWithStatusDto(
                        status = "responded",
                        metadata = updatedMetadata,
                        updatedAt = now,
                    )
                ) {
                    filter { eq("id", followupId) }
                }
            } catch (e: Exception) {
                SecureLog.warn("[FollowupRepository] Failed updating status to 'responded', updating metadata only: ${e.message}")
                supabaseClient.postgrest["appointment_followups"].update(
                    UpdateFollowupMetadataOnlyDto(
                        metadata = updatedMetadata,
                        updatedAt = now,
                    )
                ) {
                    filter { eq("id", followupId) }
                }
            }

            Unit
        }.onFailure {
            SecureLog.error("[FollowupRepository] Failed submitting check-in for followup $followupId", it)
        }
    }

    private suspend fun resolvePatientId(candidatePatientId: String): String {
        val target = candidatePatientId.ifBlank {
            securePreferences.getString(SecurePreferences.KEY_USER_ID)
                ?: throw IllegalStateException("No authenticated user ID found")
        }

        // If target corresponds to auth.users.id, resolve to patients.id
        val resolvedFromUserId = try {
            supabaseClient.postgrest["patients"]
                .select(Columns.list("id")) {
                    filter { eq("user_id", target) }
                }
                .decodeSingleOrNull<FollowupRecordIdDto>()?.id
        } catch (_: Exception) {
            null
        }

        return resolvedFromUserId ?: target
    }
}

@Serializable
private data class FollowupRecordIdDto(val id: String)

@Serializable
private data class FollowupMetadataDto(
    val id: String,
    val status: String? = null,
    val metadata: JsonElement? = null,
)

@Serializable
private data class UpdateFollowupWithStatusDto(
    val status: String,
    val metadata: JsonObject,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
private data class UpdateFollowupMetadataOnlyDto(
    val metadata: JsonObject,
    @SerialName("updated_at") val updatedAt: String,
)
