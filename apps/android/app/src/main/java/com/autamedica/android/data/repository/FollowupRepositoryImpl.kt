package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.data.remote.dto.AppointmentFollowupDto
import com.autamedica.android.data.remote.dto.toDomain
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupStatus
import com.autamedica.android.domain.model.MedicationAdherenceSummary
import com.autamedica.android.domain.model.PatientContinuityCase
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
import kotlinx.serialization.json.put
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
            require(evolution in setOf("better", "stable", "worse")) { "Invalid follow-up evolution" }
            val result = supabaseClient.postgrest.rpc(
                "patient_submit_followup_checkin",
                buildJsonObject {
                    put("p_followup_id", followupId)
                    put("p_evolution", evolution)
                    if (notes.isNullOrBlank()) {
                        put("p_notes", kotlinx.serialization.json.JsonNull)
                    } else {
                        put("p_notes", notes.take(500))
                    }
                },
            ).decodeSingle<FollowupCheckInRpcResult>()
            check(result.success && result.followupId == followupId) {
                "Follow-up check-in was not confirmed by the server"
            }
        }.onFailure {
            SecureLog.warn("[FollowupRepository] check-in stage=rpc code=" + safeRepositoryErrorCode(it))
        }
    }

    override suspend fun getContinuityCase(patientId: String): Result<PatientContinuityCase?> =
        withContext(ioDispatcher) {
            runCatching {
                val resolvedPatientId = resolvePatientId(patientId)
                supabaseClient.postgrest["clinical_case_states"]
                    .select(Columns.ALL) {
                        filter { eq("patient_id", resolvedPatientId) }
                        order("updated_at", Order.DESCENDING)
                        limit(1)
                    }
                    .decodeList<ContinuityCaseDto>()
                    .firstOrNull()
                    ?.toDomain()
            }.onFailure {
                SecureLog.warn("[FollowupRepository] continuity read stage=clinical_case_states code=" + safeRepositoryErrorCode(it))
            }
        }

    override suspend fun requestContinuity(patientId: String): Result<PatientContinuityCase> =
        withContext(ioDispatcher) {
            runCatching {
                val resolvedPatientId = resolvePatientId(patientId)
                val current = supabaseClient.postgrest["clinical_case_states"]
                    .select(Columns.ALL) {
                        filter { eq("patient_id", resolvedPatientId) }
                        order("updated_at", Order.DESCENDING)
                        limit(1)
                    }
                    .decodeList<ContinuityCaseDto>()
                    .firstOrNull()
                    ?: throw IllegalStateException("No clinical case is available for continuity")
                check(current.triagePriorityRank > 2) {
                    "Clinical case is not eligible for continuity request"
                }
                val updatedAt = OffsetDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                val updated = supabaseClient.postgrest["clinical_case_states"].update(
                    ContinuityCaseUpdateDto(caseIntent = "continuity", triageStatus = "pending", updatedAt = updatedAt)
                ) {
                    filter {
                        eq("id", current.id)
                        eq("patient_id", resolvedPatientId)
                        eq("triage_priority_rank", current.triagePriorityRank)
                    }
                    select(Columns.ALL)
                }.decodeList<ContinuityCaseDto>().firstOrNull()
                    ?: throw IllegalStateException("Continuity request was not confirmed by the server")
                updated.toDomain()
            }.onFailure {
                SecureLog.warn("[FollowupRepository] continuity request stage=clinical_case_states_update code=" + safeRepositoryErrorCode(it))
            }
        }

    override suspend fun getMedicationAdherence(
        patientId: String,
        medicationName: String,
    ): Result<MedicationAdherenceSummary> = withContext(ioDispatcher) {
        runCatching {
            val resolvedPatientId = resolvePatientId(patientId)
            val since = OffsetDateTime.now(ZoneOffset.UTC).minusDays(30)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            val rows = supabaseClient.postgrest["medication_logs"]
                .select(Columns.list("taken_at", "status")) {
                    filter {
                        eq("patient_id", resolvedPatientId)
                        eq("medication_name", medicationName)
                        eq("status", "taken")
                        gte("taken_at", since)
                    }
                }
                .decodeList<MedicationLogDto>()
            val today = java.time.LocalDate.now(ZoneOffset.UTC).toString()
            MedicationAdherenceSummary(
                dosesTakenInCycle = rows.size.coerceAtMost(30),
                totalDosesInCycle = 30,
                isTakenToday = rows.any { it.takenAt.startsWith(today) },
            )
        }.onFailure {
            SecureLog.warn("[FollowupRepository] adherence read stage=medication_logs code=" + safeRepositoryErrorCode(it))
        }
    }

    override suspend fun recordMedicationDose(
        patientId: String,
        medicationName: String,
        dosage: String,
    ): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            require(medicationName.isNotBlank() && dosage.isNotBlank()) { "Medication and dosage are required" }
            val resolvedPatientId = resolvePatientId(patientId)
            val takenAt = OffsetDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            val inserted = supabaseClient.postgrest["medication_logs"].insert(
                MedicationLogInsertDto(
                    patientId = resolvedPatientId,
                    medicationName = medicationName,
                    dosage = dosage,
                    status = "taken",
                    source = "patient_portal",
                    takenAt = takenAt,
                )
            ) {
                select(Columns.list("id"))
            }.decodeSingleOrNull<MedicationLogInsertResult>()
            check(inserted?.id?.isNotBlank() == true) { "Medication dose was not confirmed by the server" }
        }.onFailure {
            SecureLog.warn("[FollowupRepository] dose write stage=medication_logs_insert code=" + safeRepositoryErrorCode(it))
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
                    filter {
                        eq("user_id", target)
                        eq("active", true)
                    }
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


@Serializable
private data class FollowupCheckInRpcResult(
    val success: Boolean,
    @SerialName("followup_id") val followupId: String,
    @SerialName("responded_at") val respondedAt: String,
)

@Serializable
private data class ContinuityCaseDto(
    val id: String,
    @SerialName("case_intent") val caseIntent: String? = null,
    @SerialName("triage_status") val triageStatus: String? = null,
    @SerialName("triage_priority_rank") val triagePriorityRank: Int = 0,
    @SerialName("risk_of_interruption") val riskOfInterruption: String? = null,
    @SerialName("medication_snapshot_name") val medicationName: String? = null,
    @SerialName("medication_snapshot_dose") val medicationDose: String? = null,
    @SerialName("medication_snapshot_days_remaining") val medicationDaysRemaining: Int? = null,
    @SerialName("assigned_doctor_id") val assignedDoctorId: String? = null,
    @SerialName("acknowledged_at") val acknowledgedAt: String? = null,
    @SerialName("resolved_at") val resolvedAt: String? = null,
    @SerialName("resolution_deadline_at") val resolutionDeadlineAt: String? = null,
    @SerialName("created_at") val createdAt: String,
) {
    fun toDomain() = PatientContinuityCase(
        id = id,
        caseIntent = caseIntent ?: "continuity",
        triageStatus = triageStatus ?: "pending",
        triagePriorityRank = triagePriorityRank,
        riskOfInterruption = riskOfInterruption,
        medicationName = medicationName,
        medicationDose = medicationDose,
        medicationDaysRemaining = medicationDaysRemaining,
        assignedDoctorId = assignedDoctorId,
        acknowledgedAt = acknowledgedAt,
        resolvedAt = resolvedAt,
        resolutionDeadlineAt = resolutionDeadlineAt,
        createdAt = createdAt,
    )
}

@Serializable
private data class ContinuityCaseUpdateDto(
    @SerialName("case_intent") val caseIntent: String,
    @SerialName("triage_status") val triageStatus: String,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
private data class MedicationLogDto(
    @SerialName("taken_at") val takenAt: String,
    val status: String,
)

@Serializable
private data class MedicationLogInsertDto(
    @SerialName("patient_id") val patientId: String,
    @SerialName("medication_name") val medicationName: String,
    val dosage: String,
    val status: String,
    val source: String,
    @SerialName("taken_at") val takenAt: String,
)

@Serializable
private data class MedicationLogInsertResult(val id: String)

private fun safeRepositoryErrorCode(error: Throwable): String {
    val text = generateSequence(error) { it.cause }.take(8).map { it.message.orEmpty() }.joinToString(" ")
    Regex("(?i)HTTP\\s+(\\d{3})").find(text)?.groupValues?.get(1)?.let { return "http_$it" }
    Regex("(?i)SQLSTATE\\s*[:=]?\\s*([0-9A-Z]{5})").find(text)?.groupValues?.get(1)?.let { return it.uppercase() }
    Regex("\\b(42501|23503|23505|22P02)\\b").find(text)?.groupValues?.get(1)?.let { return it }
    return error::class.simpleName?.take(48) ?: "unknown"
}
