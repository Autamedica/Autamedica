package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.CreateMedicalOrderRequest
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.domain.repository.MedicalOrderRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MedicalOrderRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : MedicalOrderRepository {

    override suspend fun getDoctorMedicalOrders(): Result<List<MedicalOrder>> = runCatching {
        val doctorId = resolveDoctorId()

        val rows = supabaseClient.postgrest
            .from("medical_orders")
            .select(Columns.ALL) {
                filter {
                    eq("doctor_id", doctorId)
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<MedicalOrderRowDto>()

        if (rows.isEmpty()) return@runCatching emptyList()

        val patientIds = rows.mapNotNull { it.patientId }.distinct()
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(patientIds)
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctorId))

        rows.map { row ->
            val patId = row.patientId
            MedicalOrder(
                id = row.id,
                cuir = row.cuir,
                status = row.status,
                studyType = StudyType.fromValue(row.studyType),
                practices = parsePractices(row.practices),
                diagnosis = row.diagnosis,
                notes = row.notes,
                qrCodeContent = row.qrCodeContent ?: row.cuir?.let { "https://autamedica.com/verify/$it" },
                signedPdfUrl = row.signedPdfUrl,
                doctorName = doctorNameMap[doctorId],
                doctorLicense = doctorLicenseMap[doctorId],
                patientName = patId?.let { patientNameMap[it] },
                patientDni = patId?.let { patientDniMap[it] },
                createdAt = row.createdAt,
            )
        }
    }.onFailure {
        SecureLog.error("[MedicalOrders] Failed fetching doctor medical orders", it)
    }

    override suspend fun getPatientMedicalOrders(): Result<List<MedicalOrder>> = runCatching {
        val patientId = resolvePatientId()

        val rows = supabaseClient.postgrest
            .from("medical_orders")
            .select(Columns.ALL) {
                filter {
                    eq("patient_id", patientId)
                    neq("status", "draft")
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<MedicalOrderRowDto>()

        if (rows.isEmpty()) return@runCatching emptyList()

        val doctorIds = rows.mapNotNull { it.doctorId }.distinct()
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(doctorIds)

        rows.map { row ->
            val docId = row.doctorId
            MedicalOrder(
                id = row.id,
                cuir = row.cuir,
                status = row.status,
                studyType = StudyType.fromValue(row.studyType),
                practices = parsePractices(row.practices),
                diagnosis = row.diagnosis,
                notes = row.notes,
                qrCodeContent = row.qrCodeContent ?: row.cuir?.let { "https://autamedica.com/verify/$it" },
                signedPdfUrl = row.signedPdfUrl,
                doctorName = docId?.let { doctorNameMap[it] },
                doctorLicense = docId?.let { doctorLicenseMap[it] },
                createdAt = row.createdAt,
            )
        }
    }.onFailure {
        SecureLog.error("[MedicalOrders] Failed fetching patient medical orders", it)
    }

    override suspend fun getMedicalOrderById(id: String): Result<MedicalOrder> = runCatching {
        val row = supabaseClient.postgrest
            .from("medical_orders")
            .select(Columns.ALL) {
                filter { eq("id", id) }
                limit(1)
            }
            .decodeSingle<MedicalOrderRowDto>()

        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOfNotNull(row.doctorId))
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOfNotNull(row.patientId))
        val docId = row.doctorId
        val patId = row.patientId

        MedicalOrder(
            id = row.id,
            cuir = row.cuir,
            status = row.status,
            studyType = StudyType.fromValue(row.studyType),
            practices = parsePractices(row.practices),
            diagnosis = row.diagnosis,
            notes = row.notes,
            qrCodeContent = row.qrCodeContent ?: row.cuir?.let { "https://autamedica.com/verify/$it" },
            signedPdfUrl = row.signedPdfUrl,
            doctorName = docId?.let { doctorNameMap[it] },
            doctorLicense = docId?.let { doctorLicenseMap[it] },
            patientName = patId?.let { patientNameMap[it] },
            patientDni = patId?.let { patientDniMap[it] },
            createdAt = row.createdAt,
        )
    }.onFailure {
        SecureLog.error("[MedicalOrders] Failed fetching medical order $id", it)
    }

    // Keep the coroutine state machines small: the former monolithic suspend method
    // exhausted the Kotlin compiler heap on CircleCI during JVM back-end lowering.
    override suspend fun createMedicalOrder(request: CreateMedicalOrderRequest): Result<MedicalOrder> =
        runCatching { createVerifiedMedicalOrder(request) }.onFailure {
            SecureLog.error("[MedicalOrders] Failed creating medical order", it)
        }

    private suspend fun createVerifiedMedicalOrder(request: CreateMedicalOrderRequest): MedicalOrder {
        require(request.patientId.isNotBlank()) { "ID de paciente requerido" }
        require(request.practices.isNotEmpty()) { "Debe especificar al menos una práctica o estudio" }
        require(request.diagnosis.isNotBlank()) { "Diagnóstico presuntivo requerido" }

        val doctorId = resolveDoctorId()
        val issued = issueMedicalOrder(request)
        val (patientNames, patientDnis) = resolvePatientsInfo(listOf(request.patientId))
        val (doctorNames, doctorLicenses) = resolveDoctorsInfo(listOf(doctorId))

        return MedicalOrder(
            id = issued.id,
            cuir = issued.cuir,
            status = issued.status,
            studyType = request.studyType,
            practices = request.practices,
            diagnosis = request.diagnosis,
            notes = request.notes,
            qrCodeContent = issued.qrCodeContent,
            signedPdfUrl = issued.signedPdfUrl,
            doctorName = doctorNames[doctorId],
            doctorLicense = doctorLicenses[doctorId],
            patientName = patientNames[request.patientId],
            patientDni = patientDnis[request.patientId],
            createdAt = issued.createdAt ?: Instant.now().toString(),
        )
    }

    private fun medicalOrderPracticesJson(practices: List<PracticeItem>): JsonArray =
        buildJsonArray {
            for (practice in practices) {
                add(buildJsonObject {
                    put("name", practice.name)
                    practice.code?.let { put("code", it) }
                })
            }
        }

    private suspend fun issueMedicalOrder(request: CreateMedicalOrderRequest): IssuedMedicalOrder {
        val payload = buildJsonObject {
            put("patientId", request.patientId)
            put("studyType", request.studyType.value)
            put("practices", medicalOrderPracticesJson(request.practices))
            put("diagnosis", request.diagnosis)
            request.notes?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
        }

        // Only the server may issue an order. Never generate a local CUIR or mark
        // a PostgREST fallback as signed when the issuance function is unavailable.
        val response = supabaseClient.functions.invoke("issue-medical-order", payload)
        val root = Json.parseToJsonElement(response.bodyAsText()) as? JsonObject
            ?: throw IllegalStateException("Respuesta inválida al emitir la orden médica")
        val data = root["data"] as? JsonObject
            ?: throw IllegalStateException("No se pudo emitir la orden médica")

        val status = requiredIssuedOrderField(data, "status")
        check(status == "signed") { "La orden médica no fue emitida correctamente" }

        return IssuedMedicalOrder(
            id = requiredIssuedOrderField(data, "id"),
            cuir = requiredIssuedOrderField(data, "cuir"),
            status = status,
            signedPdfUrl = requiredIssuedOrderField(data, "signed_pdf_url"),
            qrCodeContent = requiredIssuedOrderField(data, "qr_code_content"),
            createdAt = data["created_at"]?.jsonPrimitive?.contentOrNull,
        )
    }

    private fun requiredIssuedOrderField(data: JsonObject, field: String): String =
        data[field]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Respuesta incompleta al emitir la orden médica: $field")

    private data class IssuedMedicalOrder(
        val id: String,
        val cuir: String,
        val status: String,
        val signedPdfUrl: String,
        val qrCodeContent: String,
        val createdAt: String?,
    )

    override suspend fun cancelMedicalOrder(orderId: String, reason: String): Result<Unit> = runCatching {
        require(reason.isNotBlank()) { "Motivo de cancelación requerido" }

        val now = Instant.now().toString()
        val updatePayload = buildJsonObject {
            put("status", "cancelled")
            put("updated_at", now)
        }

        supabaseClient.postgrest
            .from("medical_orders")
            .update(updatePayload) {
                filter { eq("id", orderId) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[MedicalOrders] Failed cancelling medical order $orderId", it)
    }

    private fun parsePractices(element: JsonElement?): List<PracticeItem> {
        if (element == null) return emptyList()
        return when (element) {
            is JsonArray -> {
                element.mapNotNull { item ->
                    when (item) {
                        is JsonPrimitive -> item.contentOrNull?.takeIf { it.isNotBlank() }?.let { PracticeItem(it.trim()) }
                        is JsonObject -> {
                            val name = item["name"]?.jsonPrimitive?.contentOrNull
                                ?: item["title"]?.jsonPrimitive?.contentOrNull
                                ?: item["practice"]?.jsonPrimitive?.contentOrNull
                            val code = item["code"]?.jsonPrimitive?.contentOrNull
                            name?.takeIf { it.isNotBlank() }?.let { PracticeItem(it.trim(), code?.trim()) }
                        }
                        else -> null
                    }
                }
            }
            is JsonObject -> {
                val name = element["name"]?.jsonPrimitive?.contentOrNull
                val code = element["code"]?.jsonPrimitive?.contentOrNull
                listOfNotNull(name?.takeIf { it.isNotBlank() }?.let { PracticeItem(it.trim(), code?.trim()) })
            }
            is JsonPrimitive -> {
                element.contentOrNull?.takeIf { it.isNotBlank() }?.let { listOf(PracticeItem(it.trim())) } ?: emptyList()
            }
        }
    }

    private suspend fun resolvePatientId(): String {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        return supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<RecordIdDto>()
            ?.id
            ?: throw IllegalStateException("No patient profile found for user $userId")
    }

    private suspend fun resolveDoctorId(): String {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        return supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<RecordIdDto>()
            ?.id
            ?: throw IllegalStateException("No doctor profile found for user $userId")
    }

    private suspend fun resolveDoctorsInfo(
        doctorIds: List<String>
    ): Pair<Map<String, String>, Map<String, String>> {
        if (doctorIds.isEmpty()) return emptyMap<String, String>() to emptyMap<String, String>()

        val doctors = try {
            supabaseClient.postgrest
                .from("doctors")
                .select(Columns.list("id", "user_id", "license_number")) {
                    filter { isIn("id", doctorIds) }
                }
                .decodeList<DoctorRecordDto>()
        } catch (e: Exception) {
            SecureLog.error("[MedicalOrders] Failed loading doctors info", e)
            emptyList()
        }

        val userIds = doctors.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
            } catch (e: Exception) {
                SecureLog.error("[MedicalOrders] Failed loading doctor profiles", e)
                emptyList()
            }
        } else emptyList()

        val profileByUser = profiles.associateBy { it.userId }
        val nameMap = mutableMapOf<String, String>()
        val licenseMap = mutableMapOf<String, String>()

        for (doc in doctors) {
            val prof = doc.userId?.let { profileByUser[it] }
            val fullName = if (prof != null) {
                val names = listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
                if (names.isNotEmpty()) "Dr. $names" else "Dr. Médico Tratante"
            } else "Dr. Médico Tratante"
            nameMap[doc.id] = fullName
            doc.licenseNumber?.takeIf { it.isNotBlank() }?.let {
                licenseMap[doc.id] = it
            }
        }

        return nameMap to licenseMap
    }

    private suspend fun resolvePatientsInfo(
        patientIds: List<String>
    ): Pair<Map<String, String>, Map<String, String>> {
        if (patientIds.isEmpty()) return emptyMap<String, String>() to emptyMap<String, String>()

        val patients = try {
            supabaseClient.postgrest
                .from("patients")
                .select(Columns.list("id", "user_id", "dni")) {
                    filter { isIn("id", patientIds) }
                }
                .decodeList<PatientRecordDto>()
        } catch (e: Exception) {
            SecureLog.error("[MedicalOrders] Failed loading patients info", e)
            emptyList()
        }

        val userIds = patients.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
            } catch (e: Exception) {
                SecureLog.error("[MedicalOrders] Failed loading patient profiles", e)
                emptyList()
            }
        } else emptyList()

        val profileByUser = profiles.associateBy { it.userId }
        val nameMap = mutableMapOf<String, String>()
        val dniMap = mutableMapOf<String, String>()

        for (pat in patients) {
            val prof = pat.userId?.let { profileByUser[it] }
            val fullName = if (prof != null) {
                listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
            } else ""
            nameMap[pat.id] = fullName.ifBlank { "Paciente" }
            pat.dni?.takeIf { it.isNotBlank() }?.let {
                dniMap[pat.id] = it
            }
        }

        return nameMap to dniMap
    }

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class MedicalOrderRowDto(
        val id: String,
        val cuir: String? = null,
        val status: String = "draft",
        @SerialName("study_type") val studyType: String = "other",
        val practices: JsonElement? = null,
        val diagnosis: String? = null,
        val notes: String? = null,
        @SerialName("doctor_id") val doctorId: String? = null,
        @SerialName("patient_id") val patientId: String? = null,
        @SerialName("signed_pdf_url") val signedPdfUrl: String? = null,
        @SerialName("qr_code_content") val qrCodeContent: String? = null,
        @SerialName("created_at") val createdAt: String,
    )

    @Serializable
    private data class DoctorRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        @SerialName("license_number") val licenseNumber: String? = null,
    )

    @Serializable
    private data class DoctorProfileDto(
        @SerialName("user_id") val userId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
    )

    @Serializable
    private data class PatientRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        val dni: String? = null,
    )
}
