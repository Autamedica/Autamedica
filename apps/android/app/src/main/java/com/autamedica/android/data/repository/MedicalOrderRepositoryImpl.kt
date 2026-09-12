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
import java.util.UUID
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

    override suspend fun createMedicalOrder(request: CreateMedicalOrderRequest): Result<MedicalOrder> = runCatching {
        require(request.patientId.isNotBlank()) { "ID de paciente requerido" }
        require(request.practices.isNotEmpty()) { "Debe especificar al menos una práctica o estudio" }
        require(request.diagnosis.isNotBlank()) { "Diagnóstico presuntivo requerido" }

        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val doctor = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "license_number")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorRecordDto>()
            ?: throw IllegalStateException("Perfil médico no encontrado")

        val orderId = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val timestampHex = java.lang.Long.toHexString(System.currentTimeMillis()).uppercase()
        val randomHex = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
        val fallbackCuir = "AR-ORD-$timestampHex-$randomHex"
        val fallbackQr = "https://autamedica.com/verify/$fallbackCuir"

        val practicesArray = buildJsonArray {
            for (practice in request.practices) {
                add(buildJsonObject {
                    put("name", practice.name)
                    practice.code?.let { put("code", it) }
                })
            }
        }

        // 1. Invocar Edge Function issue-medical-order
        val functionPayload = buildJsonObject {
            put("patientId", request.patientId)
            put("studyType", request.studyType.value)
            put("practices", practicesArray)
            put("diagnosis", request.diagnosis)
            request.notes?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
        }

        var finalOrderId = orderId
        var finalCuir = fallbackCuir
        var finalPdfUrl: String? = null
        var finalStatus = "signed"
        var finalQr = fallbackQr

        val edgeSuccess = runCatching {
            val response = supabaseClient.functions.invoke("issue-medical-order", functionPayload)
            val responseText = response.bodyAsText()
            SecureLog.info("[MedicalOrders] issue-medical-order Edge Function response: $responseText")
            val jsonElement = Json.parseToJsonElement(responseText)
            val jsonObj = (jsonElement as? JsonObject)
                ?: (jsonElement as? JsonArray)?.firstOrNull() as? JsonObject
            val targetObj = jsonObj?.get("data") as? JsonObject
                ?: jsonObj?.get("order") as? JsonObject
                ?: jsonObj

            val returnedId = targetObj?.get("id")?.jsonPrimitive?.contentOrNull
            val returnedCuir = targetObj?.get("cuir")?.jsonPrimitive?.contentOrNull
            val returnedPdf = targetObj?.get("signed_pdf_url")?.jsonPrimitive?.contentOrNull
                ?: targetObj?.get("signedPdfUrl")?.jsonPrimitive?.contentOrNull
            val returnedStatus = targetObj?.get("status")?.jsonPrimitive?.contentOrNull ?: "signed"
            val returnedQr = targetObj?.get("qr_code_content")?.jsonPrimitive?.contentOrNull
                ?: targetObj?.get("qrContent")?.jsonPrimitive?.contentOrNull

            if (!returnedCuir.isNullOrBlank()) {
                if (!returnedId.isNullOrBlank()) {
                    finalOrderId = returnedId
                }
                finalCuir = returnedCuir
                finalPdfUrl = returnedPdf
                finalStatus = returnedStatus
                finalQr = returnedQr ?: "https://autamedica.com/verify/$returnedCuir"
                true
            } else {
                false
            }
        }.getOrDefault(false)

        // 2. Si la Edge Function falló o estamos en fallback offline, persistimos directamente vía PostgREST
        if (!edgeSuccess) {
            val insertPayload = buildJsonObject {
                put("id", orderId)
                put("doctor_id", doctor.id)
                put("patient_id", request.patientId)
                put("cuir", fallbackCuir)
                put("status", "signed")
                put("study_type", request.studyType.value)
                put("practices", practicesArray)
                put("diagnosis", request.diagnosis)
                request.notes?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
                put("qr_code_content", fallbackQr)
                put("created_at", now)
                put("updated_at", now)
            }
            supabaseClient.postgrest.from("medical_orders").insert(insertPayload)
        }

        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOf(request.patientId))
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctor.id))

        MedicalOrder(
            id = finalOrderId,
            cuir = finalCuir,
            status = finalStatus,
            studyType = request.studyType,
            practices = request.practices,
            diagnosis = request.diagnosis,
            notes = request.notes,
            qrCodeContent = finalQr,
            signedPdfUrl = finalPdfUrl,
            doctorName = doctorNameMap[doctor.id],
            doctorLicense = doctorLicenseMap[doctor.id] ?: doctor.licenseNumber,
            patientName = patientNameMap[request.patientId],
            patientDni = patientDniMap[request.patientId],
            createdAt = now,
        )
    }.onFailure {
        SecureLog.error("[MedicalOrders] Failed creating medical order", it)
    }

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
