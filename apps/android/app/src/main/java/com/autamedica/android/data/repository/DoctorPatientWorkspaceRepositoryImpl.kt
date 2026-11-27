package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.model.ClinicalNoteEntry
import com.autamedica.android.domain.model.ClinicalWorkspaceLogic
import com.autamedica.android.domain.model.CreateClinicalNoteRequest
import com.autamedica.android.domain.model.CreateFollowupRequest
import com.autamedica.android.domain.model.CreateVitalSignRequest
import com.autamedica.android.domain.model.ExternalPatientRecord
import com.autamedica.android.domain.model.PatientFollowupEntry
import com.autamedica.android.domain.model.PatientPrescriptionRenewalItem
import com.autamedica.android.domain.model.RegisterExternalPatientRequest
import com.autamedica.android.domain.model.RenewalStatus
import com.autamedica.android.domain.model.VitalAlertSeverity
import com.autamedica.android.domain.model.VitalSignAlert
import com.autamedica.android.domain.model.VitalSignEntry
import com.autamedica.android.domain.repository.DoctorPatientWorkspaceRepository
import com.autamedica.android.domain.repository.PatientVitalsPayload
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DoctorPatientWorkspaceRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : DoctorPatientWorkspaceRepository {

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    private fun baseUrl(): String = BuildConfig.WEB_API_URL.trimEnd('/')

    private fun requireToken(): String =
        supabaseClient.auth.currentSessionOrNull()?.accessToken
            ?: throw IllegalStateException("Sessão autenticada necessária")

    private fun executeJson(
        method: String,
        path: String,
        bodyJson: String? = null,
    ): JsonObject {
        val token = requireToken()
        val url = "${baseUrl()}$path"
        val builder = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")

        val reqBody = bodyJson?.toRequestBody("application/json; charset=utf-8".toMediaType())
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.header("Origin", baseUrl()).post(reqBody ?: "{}".toRequestBody("application/json".toMediaType()))
            "PATCH" -> builder.header("Origin", baseUrl()).patch(reqBody ?: "{}".toRequestBody("application/json".toMediaType()))
            else -> error("Unsupported HTTP method $method")
        }

        httpClient.newCall(builder.build()).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            val root = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
            if (!resp.isSuccessful || root?.get("success")?.jsonPrimitive?.contentOrNull == "false") {
                val errObj = root?.get("error")
                val errMsg = when (errObj) {
                    is JsonObject -> errObj["message"]?.jsonPrimitive?.contentOrNull
                        ?: errObj["code"]?.jsonPrimitive?.contentOrNull
                    else -> errObj?.jsonPrimitive?.contentOrNull
                } ?: "HTTP ${resp.code}"
                throw IllegalStateException(errMsg)
            }
            return root ?: JsonObject(emptyMap())
        }
    }

    override suspend fun getClinicalNotes(patientId: String): Result<List<ClinicalNoteEntry>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val encoded = URLEncoder.encode(patientId, "UTF-8")
                val root = executeJson("GET", "/api/doctors/medical-records?patientId=$encoded&pageSize=20")
                val arr = root["data"]?.jsonObject?.get("records")?.jsonArray ?: JsonArray(emptyList())
                arr.mapNotNull { el -> parseClinicalNote(el as? JsonObject ?: return@mapNotNull null) }
            }
        }

    override suspend fun createClinicalNote(request: CreateClinicalNoteRequest): Result<ClinicalNoteEntry> =
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = buildJsonObject {
                    put("patientId", request.patientId)
                    put("type", "consultation")
                    put("kind", request.kind)
                    put("title", request.title)
                    put("summary", request.summary)
                    if (!request.diagnosis.isNullOrBlank()) {
                        put("diagnosis", request.diagnosis)
                    }
                }.toString()
                val root = executeJson("POST", "/api/doctors/medical-records", payload)
                val obj = root["data"]?.jsonObject ?: throw IllegalStateException("Resposta inválida")
                parseClinicalNote(obj) ?: throw IllegalStateException("Registro inválido")
            }
        }

    override suspend fun getVitals(patientId: String): Result<PatientVitalsPayload> =
        withContext(Dispatchers.IO) {
            runCatching {
                val encoded = URLEncoder.encode(patientId, "UTF-8")
                val root = executeJson("GET", "/api/doctors/patients/$encoded/vitals")
                val data = root["data"]?.jsonObject ?: JsonObject(emptyMap())
                parseVitalsPayload(data)
            }
        }

    override suspend fun recordVitals(request: CreateVitalSignRequest): Result<PatientVitalsPayload> =
        withContext(Dispatchers.IO) {
            runCatching {
                val encoded = URLEncoder.encode(request.patientId, "UTF-8")
                val payload = buildJsonObject {
                    request.bloodPressureSystolic?.let { put("bloodPressureSystolic", it) }
                    request.bloodPressureDiastolic?.let { put("bloodPressureDiastolic", it) }
                    request.heartRate?.let { put("heartRate", it) }
                    request.temperature?.let { put("temperature", it) }
                    request.oxygenSaturation?.let { put("oxygenSaturation", it) }
                    request.weight?.let { put("weight", it) }
                    request.height?.let { put("height", it) }
                    request.painScale?.let { put("painScale", it) }
                    if (!request.notes.isNullOrBlank()) put("notes", request.notes)
                }.toString()
                val root = executeJson("POST", "/api/doctors/patients/$encoded/vitals", payload)
                val data = root["data"]?.jsonObject ?: JsonObject(emptyMap())
                val single = (data["vital"] as? JsonObject)?.let(::parseVital)
                val alerts = (data["alerts"] as? JsonArray)?.mapNotNull { parseAlert(it as? JsonObject) }.orEmpty()
                PatientVitalsPayload(
                    vitals = listOfNotNull(single),
                    alerts = alerts,
                )
            }
        }

    override suspend fun getFollowups(patientId: String): Result<List<PatientFollowupEntry>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val encoded = URLEncoder.encode(patientId, "UTF-8")
                val root = executeJson("GET", "/api/doctors/patients/$encoded/followups")
                val arr = root["data"]?.jsonObject?.get("followups")?.jsonArray ?: JsonArray(emptyList())
                arr.mapNotNull { parseFollowup(it as? JsonObject) }
            }
        }

    override suspend fun createFollowup(request: CreateFollowupRequest): Result<PatientFollowupEntry> =
        withContext(Dispatchers.IO) {
            runCatching {
                val encoded = URLEncoder.encode(request.patientId, "UTF-8")
                val payload = buildJsonObject {
                    put("scheduledFor", request.scheduledFor)
                    put("objective", request.objective)
                    put("channel", request.channel)
                }.toString()
                val root = executeJson("POST", "/api/doctors/patients/$encoded/followups", payload)
                val obj = root["data"]?.jsonObject?.get("followup")?.jsonObject
                    ?: throw IllegalStateException("Resposta inválida")
                parseFollowup(obj) ?: throw IllegalStateException("Seguimento inválido")
            }
        }

    override suspend fun updateFollowup(
        patientId: String,
        followupId: String,
        action: String,
    ): Result<PatientFollowupEntry> = withContext(Dispatchers.IO) {
        runCatching {
            val encoded = URLEncoder.encode(patientId, "UTF-8")
            val payload = buildJsonObject {
                put("followupId", followupId)
                put("action", action)
            }.toString()
            val root = executeJson("PATCH", "/api/doctors/patients/$encoded/followups", payload)
            val obj = root["data"]?.jsonObject?.get("followup")?.jsonObject
                ?: throw IllegalStateException("Resposta inválida")
            parseFollowup(obj) ?: throw IllegalStateException("Seguimento inválido")
        }
    }

    override suspend fun getPatientPrescriptions(
        patientId: String,
    ): Result<List<PatientPrescriptionRenewalItem>> = withContext(Dispatchers.IO) {
        runCatching {
            val encoded = URLEncoder.encode(patientId, "UTF-8")
            val root = executeJson("GET", "/api/doctors/patients/$encoded/prescriptions")
            val arr = root["data"]?.jsonObject?.get("prescriptions")?.jsonArray ?: JsonArray(emptyList())
            arr.mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                val status = obj["status"]?.jsonPrimitive?.contentOrNull ?: "active"
                val days = obj["daysRemaining"]?.jsonPrimitive?.intOrNull
                val renewalStr = obj["renewalStatus"]?.jsonPrimitive?.contentOrNull
                val renewalStatus = when (renewalStr) {
                    "expired" -> RenewalStatus.EXPIRED
                    "expiring_soon" -> RenewalStatus.EXPIRING_SOON
                    "cancelled" -> RenewalStatus.CANCELLED
                    "active" -> RenewalStatus.ACTIVE
                    else -> ClinicalWorkspaceLogic.computeRenewalStatus(status, days)
                }
                PatientPrescriptionRenewalItem(
                    id = id,
                    cuir = obj["cuir"]?.jsonPrimitive?.contentOrNull,
                    status = status,
                    createdAt = obj["createdAt"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    validUntil = obj["validUntil"]?.jsonPrimitive?.contentOrNull,
                    daysRemaining = days,
                    renewalStatus = renewalStatus,
                    canRenew = obj["canRenew"]?.jsonPrimitive?.contentOrNull != "false" && renewalStatus != RenewalStatus.CANCELLED,
                    medicationName = obj["medicationName"]?.jsonPrimitive?.contentOrNull ?: "Prescripción",
                    dosage = obj["dosage"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    diagnosis = obj["diagnosis"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    notes = obj["notes"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                )
            }
        }
    }

    override suspend fun getExternalPatients(): Result<List<ExternalPatientRecord>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val root = executeJson("GET", "/api/doctors/patients/eventual")
                val arr = root["data"] as? JsonArray ?: JsonArray(emptyList())
                arr.mapNotNull { parseExternalPatient(it as? JsonObject) }
            }
        }

    override suspend fun registerExternalPatient(
        request: RegisterExternalPatientRequest,
    ): Result<ExternalPatientRecord> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = buildJsonObject {
                put("fullName", request.fullName.trim())
                put("documentNumber", request.documentNumber.filter(Char::isDigit))
                put("gender", request.gender)
                if (!request.birthDate.isNullOrBlank()) put("birthDate", request.birthDate.trim())
                if (!request.contact.isNullOrBlank()) put("contact", request.contact.trim())
                put("consentAccepted", true)
                put("careCountryConfirmed", true)
            }.toString()
            val root = executeJson("POST", "/api/doctors/patients/eventual", payload)
            val data = root["data"]?.jsonObject ?: throw IllegalStateException("Resposta inválida")
            parseExternalPatient(data) ?: throw IllegalStateException("Paciente inválido")
        }
    }

    private fun parseExternalPatient(obj: JsonObject?): ExternalPatientRecord? {
        if (obj == null) return null
        val pid = obj["patientId"]?.jsonPrimitive?.contentOrNull ?: return null
        val name = obj["fullName"]?.jsonPrimitive?.contentOrNull ?: return null
        return ExternalPatientRecord(
            patientId = pid,
            fullName = name,
            dni = obj["dni"]?.jsonPrimitive?.contentOrNull,
            birthDate = obj["birthDate"]?.jsonPrimitive?.contentOrNull,
            gender = obj["gender"]?.jsonPrimitive?.contentOrNull,
            contact = obj["contact"]?.jsonPrimitive?.contentOrNull,
        )
    }

    private fun parseClinicalNote(obj: JsonObject): ClinicalNoteEntry? {
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return null
        val title = obj["title"]?.jsonPrimitive?.contentOrNull ?: "Registro clínico"
        val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: "consultation"
        val date = obj["dateRecorded"]?.jsonPrimitive?.contentOrNull
            ?: obj["date_recorded"]?.jsonPrimitive?.contentOrNull
            ?: obj["createdAt"]?.jsonPrimitive?.contentOrNull
            ?: obj["created_at"]?.jsonPrimitive?.contentOrNull
            ?: ""
        val contentEl = obj["content"]
        var kind = "evolution"
        var summary = ""
        var diagnosis: String? = null
        if (contentEl is JsonObject) {
            kind = contentEl["kind"]?.jsonPrimitive?.contentOrNull ?: "evolution"
            diagnosis = contentEl["diagnosis"]?.jsonPrimitive?.contentOrNull
            summary = contentEl["summary"]?.jsonPrimitive?.contentOrNull
                ?: contentEl["notes"]?.jsonPrimitive?.contentOrNull
                ?: diagnosis
                ?: ""
        } else {
            summary = contentEl?.jsonPrimitive?.contentOrNull.orEmpty()
        }
        return ClinicalNoteEntry(
            id = id,
            title = title,
            type = type,
            kind = kind,
            summary = summary,
            diagnosis = diagnosis,
            dateRecorded = date,
        )
    }

    private fun parseVitalsPayload(data: JsonObject): PatientVitalsPayload {
        val vitalsArr = data["vitals"] as? JsonArray ?: JsonArray(emptyList())
        val alertsArr = data["alerts"] as? JsonArray ?: JsonArray(emptyList())
        return PatientVitalsPayload(
            vitals = vitalsArr.mapNotNull { parseVital(it as? JsonObject) },
            alerts = alertsArr.mapNotNull { parseAlert(it as? JsonObject) },
        )
    }

    private fun parseVital(obj: JsonObject?): VitalSignEntry? {
        if (obj == null) return null
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return null
        return VitalSignEntry(
            id = id,
            patientId = obj["patient_id"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            bloodPressureSystolic = obj["blood_pressure_systolic"]?.jsonPrimitive?.intOrNull,
            bloodPressureDiastolic = obj["blood_pressure_diastolic"]?.jsonPrimitive?.intOrNull,
            heartRate = obj["heart_rate"]?.jsonPrimitive?.intOrNull,
            temperature = obj["temperature"]?.jsonPrimitive?.doubleOrNull,
            oxygenSaturation = obj["oxygen_saturation"]?.jsonPrimitive?.intOrNull,
            respiratoryRate = obj["respiratory_rate"]?.jsonPrimitive?.intOrNull,
            weight = obj["weight"]?.jsonPrimitive?.doubleOrNull,
            height = obj["height"]?.jsonPrimitive?.intOrNull,
            bmi = obj["bmi"]?.jsonPrimitive?.doubleOrNull,
            painScale = obj["pain_scale"]?.jsonPrimitive?.intOrNull,
            notes = obj["notes"]?.jsonPrimitive?.contentOrNull,
            measuredAt = obj["measured_at"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    private fun parseAlert(obj: JsonObject?): VitalSignAlert? {
        if (obj == null) return null
        val code = obj["code"]?.jsonPrimitive?.contentOrNull ?: return null
        val severity = if (obj["severity"]?.jsonPrimitive?.contentOrNull == "critical") {
            VitalAlertSeverity.CRITICAL
        } else {
            VitalAlertSeverity.WARNING
        }
        return VitalSignAlert(
            code = code,
            severity = severity,
            labelEs = obj["labelEs"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            labelPt = obj["labelPt"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    private fun parseFollowup(obj: JsonObject?): PatientFollowupEntry? {
        if (obj == null) return null
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return null
        return PatientFollowupEntry(
            id = id,
            patientId = obj["patient_id"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            channel = obj["channel"]?.jsonPrimitive?.contentOrNull ?: "whatsapp",
            message = obj["message"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            scheduledFor = obj["scheduled_for"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            status = obj["status"]?.jsonPrimitive?.contentOrNull ?: "pending",
        )
    }
}
