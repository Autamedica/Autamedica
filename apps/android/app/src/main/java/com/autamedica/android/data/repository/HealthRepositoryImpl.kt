package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.ANAMNESIS_STATUS_COMPLETED
import com.autamedica.android.domain.model.ANAMNESIS_STATUS_UNDER_REVIEW
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.model.anamnesisReadOnlyReason
import com.autamedica.android.domain.model.deriveEditableAnamnesisStatus
import com.autamedica.android.domain.model.isAnamnesisSummaryReadOnly
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HealthRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : HealthRepository {

    override suspend fun getAnamnesisSummary(): Result<AnamnesisSummary?> = runCatching {
        val patientId = resolvePatientId()

        supabaseClient.postgrest
            .from("anamnesis")
            .select(Columns.ALL) {
                filter { eq("patient_id", patientId) }
                order("updated_at", Order.DESCENDING)
                limit(1)
            }
            .decodeList<AnamnesisDto>()
            .firstOrNull()
            ?.toDomain()
    }.onFailure {
        SecureLog.error("[Health] Failed fetching anamnesis summary", it)
    }

    override suspend fun getPreventiveProfile(): Result<PatientPreventiveProfile> = runCatching {
        val patientId = resolvePatientId()

        supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "birth_date", "gender")) {
                filter { eq("id", patientId) }
                limit(1)
            }
            .decodeSingle<PatientPreventiveProfileDto>()
            .toDomain()
    }.onFailure {
        SecureLog.error("[Health] Failed fetching preventive profile", it)
    }

    override suspend fun getOrCreateAnamnesis(): Result<AnamnesisSummary> = runCatching {
        val patientId = resolvePatientId()

        val existing = supabaseClient.postgrest
            .from("anamnesis")
            .select(Columns.ALL) {
                filter { eq("patient_id", patientId) }
                order("updated_at", Order.DESCENDING)
                limit(1)
            }
            .decodeList<AnamnesisDto>()
            .firstOrNull()

        if (existing != null) return@runCatching existing.toDomain()

        // Create new anamnesis with default sections_status
        val sectionsStatus = AnamnesisSection.SECTION_ORDER.associate { section ->
            section to "pending"
        }

        val created = supabaseClient.postgrest
            .from("anamnesis")
            .insert(
                CreateAnamnesisDto(
                    patientId = patientId,
                    status = "in_progress",
                    sectionsStatus = JsonObject(sectionsStatus.mapValues { JsonPrimitive(it.value) }),
                )
            ) {
                select(Columns.ALL)
            }
            .decodeSingle<AnamnesisDto>()

        // Create empty section records
        val sectionInserts = AnamnesisSection.SECTION_ORDER.map { section ->
            CreateSectionDto(
                anamnesisId = created.id,
                section = section,
                data = JsonObject(emptyMap()),
                completed = false,
            )
        }
        supabaseClient.postgrest
            .from("anamnesis_sections")
            .insert(sectionInserts)

        created.toDomain()
    }.onFailure {
        SecureLog.error("[Health] Failed creating anamnesis", it)
    }

    override suspend fun getAnamnesisSections(anamnesisId: String): Result<List<AnamnesisSection>> =
        runCatching {
            supabaseClient.postgrest
                .from("anamnesis_sections")
                .select(Columns.ALL) {
                    filter { eq("anamnesis_id", anamnesisId) }
                }
                .decodeList<AnamnesisSectionDto>()
                .map { it.toDomain() }
                .sortedBy { AnamnesisSection.SECTION_ORDER.indexOf(it.section).takeIf { i -> i >= 0 } ?: 999 }
        }.onFailure {
            SecureLog.error("[Health] Failed fetching sections", it)
        }

    override suspend fun saveSection(
        anamnesisId: String,
        section: String,
        data: Map<String, String>,
    ): Result<Unit> = runCatching {
        requireEditableAnamnesis(anamnesisId)
        val jsonData = JsonObject(data.mapValues { JsonPrimitive(it.value) })
        val now = OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        supabaseClient.postgrest
            .from("anamnesis_sections")
            .update(mapOf("data" to jsonData, "updated_at" to now)) {
                filter {
                    eq("anamnesis_id", anamnesisId)
                    eq("section", section)
                }
            }
        Unit
    }.onFailure {
        SecureLog.error("[Health] Failed saving section $section", it)
    }

    override suspend fun completeSection(
        anamnesisId: String,
        section: String,
    ): Result<Unit> = runCatching {
        val currentSummary = requireEditableAnamnesis(anamnesisId)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        supabaseClient.postgrest
            .from("anamnesis_sections")
            .update(mapOf("completed" to true, "completed_at" to now, "updated_at" to now)) {
                filter {
                    eq("anamnesis_id", anamnesisId)
                    eq("section", section)
                }
            }

        // Update sections_status JSONB in parent anamnesis
        val sections = fetchSectionStatuses(anamnesisId)

        val total = sections.size.coerceAtLeast(1)
        val completed = sections.count { it.completed }
        val percentage = (completed.toDouble() / total * 100).roundToInt()
        val nextStatus = deriveEditableAnamnesisStatus(
            currentStatus = currentSummary.status,
            completedSections = completed,
            totalSections = total,
        )

        supabaseClient.postgrest
            .from("anamnesis")
            .update(buildProgressUpdatePayload(sections, percentage, nextStatus, now)) {
                filter { eq("id", anamnesisId) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[Health] Failed completing section $section", it)
    }

    override suspend fun submitAnamnesis(anamnesisId: String): Result<Unit> = runCatching {
        requireEditableAnamnesis(anamnesisId)
        val sections = fetchSectionStatuses(anamnesisId)
        val total = sections.size.coerceAtLeast(1)
        val completed = sections.count { it.completed }
        if (completed != total) {
            throw IllegalStateException("Complete todas las secciones antes de enviar la anamnesis.")
        }

        val now = OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        supabaseClient.postgrest
            .from("anamnesis")
            .update(
                mapOf(
                    "status" to ANAMNESIS_STATUS_UNDER_REVIEW,
                    "locked" to true,
                    "completion_percentage" to 100,
                    "sections_status" to buildSectionsStatus(sections),
                    "completed_at" to now,
                    "updated_at" to now,
                )
            ) {
                filter { eq("id", anamnesisId) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[Health] Failed submitting anamnesis", it)
    }

    // ────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────

    private suspend fun resolvePatientId(): String {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")
        return supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingle<RecordIdDto>()
            .id
    }

    private suspend fun requireEditableAnamnesis(anamnesisId: String): AnamnesisSummary {
        val summary = fetchAnamnesisById(anamnesisId)
        if (isAnamnesisSummaryReadOnly(summary)) {
            throw IllegalStateException(
                anamnesisReadOnlyReason(summary) ?: "La anamnesis se encuentra en solo lectura."
            )
        }
        return summary
    }

    private suspend fun fetchAnamnesisById(anamnesisId: String): AnamnesisSummary =
        supabaseClient.postgrest
            .from("anamnesis")
            .select(Columns.ALL) {
                filter { eq("id", anamnesisId) }
                limit(1)
            }
            .decodeSingle<AnamnesisDto>()
            .toDomain()

    private suspend fun fetchSectionStatuses(anamnesisId: String): List<SectionStatusDto> =
        supabaseClient.postgrest
            .from("anamnesis_sections")
            .select(Columns.list("section", "completed")) {
                filter { eq("anamnesis_id", anamnesisId) }
            }
            .decodeList<SectionStatusDto>()

    private fun buildSectionsStatus(sections: List<SectionStatusDto>): JsonObject =
        JsonObject(sections.associate { status ->
            status.section to JsonPrimitive(if (status.completed) "completed" else "pending")
        })

    private fun buildProgressUpdatePayload(
        sections: List<SectionStatusDto>,
        completionPercentage: Int,
        status: String,
        now: String,
    ): Map<String, Any?> {
        val payload = mutableMapOf<String, Any?>(
            "sections_status" to buildSectionsStatus(sections),
            "completion_percentage" to completionPercentage,
            "status" to status,
            "updated_at" to now,
        )
        if (status == ANAMNESIS_STATUS_COMPLETED) {
            payload["completed_at"] = now
        }
        return payload
    }

    // ────────────────────────────────────────────────────────────
    //  DTOs
    // ────────────────────────────────────────────────────────────

    @Serializable
private data class RecordIdDto(val id: String)

@Serializable
private data class PatientPreventiveProfileDto(
    val id: String,
    @SerialName("birth_date") val birthDate: String? = null,
    val gender: String? = null,
) {
    fun toDomain() = PatientPreventiveProfile(
        patientId = id,
        birthDate = birthDate,
        gender = gender,
    )
}

    @Serializable
    private data class AnamnesisDto(
        val id: String,
        val status: String = "draft",
        @SerialName("completion_percentage") val completionPercentage: Double = 0.0,
        val locked: Boolean = false,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("sections_status") val sectionsStatus: JsonElement? = null,
    ) {
        fun toDomain(): AnamnesisSummary {
            val (completedSections, totalSections) = countSections(sectionsStatus)
            return AnamnesisSummary(
                id = id,
                status = status,
                completionPercentage = completionPercentage.roundToInt().coerceIn(0, 100),
                locked = locked,
                updatedAt = updatedAt,
                completedSections = completedSections,
                totalSections = totalSections,
            )
        }

        private fun countSections(value: JsonElement?): Pair<Int, Int> {
            val json = value as? JsonObject ?: return 0 to 0
            val total = json.size
            val completed = json.values.count { element ->
                when (element) {
                    is JsonObject -> {
                        element["completed"]?.jsonPrimitive?.contentOrNull
                            ?.toBooleanStrictOrNull() == true
                    }
                    else -> {
                        val s = element.jsonPrimitive.contentOrNull?.lowercase()
                        s == "completed" || s == "true"
                    }
                }
            }
            return completed to total
        }
    }

    @Serializable
    private data class CreateAnamnesisDto(
        @SerialName("patient_id") val patientId: String,
        val status: String,
        @SerialName("sections_status") val sectionsStatus: JsonObject,
    )

    @Serializable
    private data class AnamnesisSectionDto(
        val id: String,
        @SerialName("anamnesis_id") val anamnesisId: String,
        val section: String,
        val data: JsonElement? = null,
        val completed: Boolean = false,
        @SerialName("completed_at") val completedAt: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    ) {
        fun toDomain() = AnamnesisSection(
            id = id,
            anamnesisId = anamnesisId,
            section = section,
            data = parseData(data),
            completed = completed,
            completedAt = completedAt,
            updatedAt = updatedAt,
        )

        private fun parseData(value: JsonElement?): Map<String, String> {
            val obj = value as? JsonObject ?: return emptyMap()
            return obj.entries.associate { (key, el) ->
                key to (el.jsonPrimitive.contentOrNull ?: "")
            }
        }
    }

    @Serializable
    private data class CreateSectionDto(
        @SerialName("anamnesis_id") val anamnesisId: String,
        val section: String,
        val data: JsonObject,
        val completed: Boolean,
    )

    @Serializable
    private data class SectionStatusDto(
        val section: String,
        val completed: Boolean = false,
    )
}
